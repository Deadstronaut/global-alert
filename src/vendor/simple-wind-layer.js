/**
 * Minimal animated wind/current particle layer — spec 053.
 *
 * Built against MapLibre GL JS's PUBLIC, stable CustomLayerInterface
 * (onAdd(map, gl) / render(gl, matrix)) rather than any private internals.
 * This exists because both third-party candidates evaluated for this
 * feature (@sakitam-gis/maplibre-wind, mapbox-exif-layer) reach into
 * MapLibre's *private* `map.transform` object for their own camera sync —
 * live-verified 2026-08-05 that `map.transform` is `undefined` in
 * maplibre-gl v6 (a real, confirmed removal/rename, not a version-range
 * technicality: sakitam's peerDependencies claim `>=3.0.0` compatibility
 * and still crash; mapbox-exif-layer's own peerDependencies explicitly cap
 * at `^5.0.0`, one version short of what this app runs). The public
 * `render(gl, matrix)` contract — a plain projection matrix handed to the
 * layer every frame — has stayed stable since MapLibre forked from
 * Mapbox and is the only interface a custom layer can build against
 * without re-breaking on the next MapLibre internal refactor.
 *
 * Technique: CPU-side particle advection (not a GPU ping-pong update
 * shader) — reads the wind texture once into an offscreen canvas for
 * pixel sampling, steps a fixed particle count per frame in JS, uploads
 * updated positions to a GPU point-sprite buffer. Simpler and more robust
 * to get right than a full GPGPU update pass, at the cost of being
 * capped to a few thousand particles rather nullschool-scale hundreds of
 * thousands — an acceptable trade for this feature's actual visual goal
 * (readable flow direction/speed, not a photorealistic density field).
 */

const PARTICLE_COUNT = 3000
// Respawn a particle after this many frames so flow keeps circulating. Was
// 90 (~1.5s @60fps) — live-testing finding, 2026-08-05: at world zoom a
// single frame's real-world movement is sub-pixel (see the gl.POINTS fix
// above), so the dominant thing actually visible frame to frame wasn't
// drift, it was respawns — particles "teleporting" to a fresh random spot
// read as constant twinkling rather than flow. Raised so respawns are rare
// enough not to dominate the visual, while still keeping particles
// circulating instead of freezing in place forever.
const MAX_AGE_FRAMES = 400
const SPEED_FACTOR = 0.4 // tunes how many degrees/frame a particle moves per m/s of wind
// Each particle keeps its last TRAIL_LENGTH positions and redraws them as a
// fading polyline+point trail every frame (instead of a single dot).
// MapLibre clears the canvas each render pass, so there's no persistent
// framebuffer to "leave a trail" on like nullschool's canvas-2D fade trick
// — the trail has to be stored and redrawn explicitly per particle.
// Was 6, raised to 18 — live-testing feedback, 2026-08-05: at world zoom a
// single frame's real movement is sub-pixel, so a short trail read as
// "twinkling dots," not flow; a longer trail traces enough of each
// particle's actual curved path to show swirl/vortex shapes, closer to
// the reference tool's "ghost sliding" look.
const TRAIL_LENGTH = 18

const VERTEX_SHADER = `
  uniform mat4 u_matrix;
  uniform float u_pointSize;
  attribute vec2 a_pos; // Mercator x/y, both in [0,1]
  attribute float a_speed;
  attribute float a_alpha;
  varying float v_speed;
  varying float v_alpha;
  void main() {
    gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
    gl_PointSize = u_pointSize;
    v_speed = a_speed;
    v_alpha = a_alpha;
  }
`

const FRAGMENT_SHADER = `
  precision mediump float;
  varying float v_speed;
  varying float v_alpha;
  void main() {
    // Cool blue (calm) -> warm orange/red (strong), readable against both
    // the dark and light base map styles this app uses.
    vec3 slow = vec3(0.25, 0.55, 0.95);
    vec3 fast = vec3(0.95, 0.35, 0.15);
    vec3 color = mix(slow, fast, clamp(v_speed, 0.0, 1.0));
    gl_FragColor = vec4(color, v_alpha);
  }
`

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Wind layer shader compile error: ${info}`)
  }
  return shader
}

function linkProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram()
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource))
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Wind layer program link error: ${info}`)
  }
  return program
}

/**
 * @param {number} lng
 * @param {number} lat
 * @returns {[number, number]} Mercator x/y in [0,1], matching
 *   maplibregl.MercatorCoordinate.fromLngLat()'s own convention — computed
 *   directly here (plain trig, no MapLibre import needed) so this file has
 *   zero dependency on any maplibre-gl internals, public or private.
 */
function lngLatToMercator(lng, lat) {
  const x = (180 + lng) / 360
  const sinLat = Math.sin((lat * Math.PI) / 180)
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)
  return [x, y]
}

// Constitution Principle VI (reduced-motion support): respects both the OS-
// level preference (prefers-reduced-motion, e.g. vestibular-disorder users
// who never touched this app's own settings) and the app's own explicit
// safeMode toggle (uiStore.safeMode / <html data-safe-mode>, spec 004) —
// either one is enough to ask for less motion. Checked live each render
// rather than cached once, so toggling either setting takes effect on the
// very next frame without this layer needing to be told directly.
function reducedMotionRequested() {
  if (document.documentElement.getAttribute('data-safe-mode') === 'true') return true
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}

export class SimpleWindLayer {
  /**
   * @param {string} id
   * @param {{ textureUrl: string, bounds: [number, number, number, number], dataRange: [[number,number],[number,number]] }} options
   *   bounds = [west, south, east, north]; dataRange = [[uMin,uMax],[vMin,vMax]]
   */
  constructor(id, options) {
    this.id = id
    this.type = 'custom'
    this.renderingMode = '2d'
    this.options = options
    this.particles = null // Float32Array-backed, lazily initialized once the wind image has loaded
    this.imageData = null
    this.imageReady = false
    // Live-tunable via setSpeedMultiplier()/setTrailLength() — read fresh
    // every render() frame, so UI sliders can adjust apparent flow speed
    // and trail length in real time without recreating the layer
    // (live-testing ask, 2026-08-05: movement read as too slow/flickery to
    // track by eye at real-world scale, trail wasn't visibly persisting).
    this.speedMultiplier = options.speedMultiplier ?? 1
    this.trailLength = options.trailLength ?? TRAIL_LENGTH
    // Point-sprite size along each trail (gl_PointSize) — live-testing
    // feedback, 2026-08-05: at a thin size the trail reads as separated
    // "tık tık tık" dots rather than a continuous flowing line, since the
    // gl.POINTS draw (this file's own comment above on why it exists) is
    // what actually carries visibility at world zoom, not the 1px-only
    // gl.LINES draw underneath it — bigger points overlap frame to frame
    // and read as smooth motion instead of a dotted trail.
    this.trailThickness = options.trailThickness ?? 3.0
  }

  setSpeedMultiplier(value) {
    this.speedMultiplier = value
  }

  setTrailLength(value) {
    this.trailLength = Math.max(2, Math.round(value))
  }

  setTrailThickness(value) {
    this.trailThickness = Math.max(1, value)
  }

  onAdd(map, gl) {
    this.map = map
    this.gl = gl
    this.program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER)
    this.buffer = gl.createBuffer()

    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)
      this.imageData = ctx.getImageData(0, 0, image.width, image.height)
      this.imageReady = true
      this._initParticles()
      this.map.triggerRepaint()
    }
    image.onerror = (e) => {
      console.warn(`[SimpleWindLayer] Failed to load texture for ${this.id}`, e)
    }
    image.src = this.options.textureUrl
  }

  onRemove() {
    if (!this.gl) return
    this.gl.deleteProgram(this.program)
    this.gl.deleteBuffer(this.buffer)
    if (this.speedBuffer) this.gl.deleteBuffer(this.speedBuffer)
    if (this.alphaBuffer) this.gl.deleteBuffer(this.alphaBuffer)
  }

  _initParticles() {
    const [west, south, east, north] = this.options.bounds
    this.particles = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push(this._spawnParticle(west, south, east, north))
    }
  }

  _spawnParticle(west, south, east, north) {
    const lng = west + Math.random() * (east - west)
    const lat = south + Math.random() * (north - south)
    return {
      lng,
      lat,
      age: Math.floor(Math.random() * MAX_AGE_FRAMES),
      history: [[lng, lat]], // most recent position first; grows to TRAIL_LENGTH as it moves
      speedNormalized: 0,
    }
  }

  /** Samples the wind texture at a given lng/lat, returns [u, v, speedNormalized] or null if out of bounds. */
  _sampleWind(lng, lat) {
    const { bounds, dataRange } = this.options
    const [west, south, east, north] = bounds
    if (lng < west || lng > east || lat < south || lat > north) return null

    const px = Math.floor(((lng - west) / (east - west)) * this.imageData.width)
    const py = Math.floor(((north - lat) / (north - south)) * this.imageData.height)
    const idx = (Math.min(py, this.imageData.height - 1) * this.imageData.width + Math.min(px, this.imageData.width - 1)) * 4
    const r = this.imageData.data[idx]
    const g = this.imageData.data[idx + 1]
    // Blue channel = validity mask (flow_texture_common.py's
    // build_flow_texture), not a color — 0 means "no real data here"
    // (land, for ocean-current/wave textures). Treating it the same as
    // out-of-bounds (respawn, don't draw) instead of decoding a fake
    // vector fixes the parallel-diagonal-lines-across-continents bug
    // live-tested 2026-08-05: land pixels used to all decode to the exact
    // same (uMin,vMin) "vector" since NaN was zeroed before normalization.
    const b = this.imageData.data[idx + 2]
    if (b < 128) return null

    const [uMin, uMax] = dataRange[0]
    const [vMin, vMax] = dataRange[1]
    const u = uMin + (r / 255) * (uMax - uMin)
    const v = vMin + (g / 255) * (vMax - vMin)
    const speed = Math.sqrt(u * u + v * v)
    // Normalizes against a generous 40 m/s ceiling (well above all but
    // extreme storm-force wind) so the color scale stays meaningful
    // instead of always maxing out on rare outliers.
    const speedNormalized = Math.min(speed / 40, 1)
    return [u, v, speedNormalized]
  }

  render(gl, options) {
    if (!this.imageReady || !this.particles) return
    // MapLibre v6 changed CustomRenderMethod's signature from the old
    // `render(gl, matrix)` (a raw mat4) to `render(gl, options)` (an
    // options object, to support globe projection) — live-verified
    // 2026-08-05: passing `options` itself straight into uniformMatrix4fv
    // throws ("must have a callable @@iterator property", since it's a
    // plain object, not an array-like). `defaultProjectionData.mainMatrix`
    // is what MapLibre's own docs point to for "simple custom layers that
    // only support mercator projection" — exactly this layer.
    const matrix = options.defaultProjectionData.mainMatrix
    const [west, south, east, north] = this.options.bounds

    // Reduced motion: let the trails fully build up once (TRAIL_LENGTH
    // frames), then stop moving/re-triggering repaints — a static flow
    // snapshot instead of a continuous animation. Resets the moment
    // reduced motion is turned back off, so it doesn't stay frozen forever.
    const trailLength = this.trailLength
    const reducedMotion = reducedMotionRequested()
    if (!reducedMotion) {
      this._staticFramesRemaining = null
    } else if (this._staticFramesRemaining == null) {
      this._staticFramesRemaining = trailLength
    }
    const advect = !reducedMotion || this._staticFramesRemaining > 0
    if (reducedMotion && advect) this._staticFramesRemaining -= 1

    // Worst case: every particle has a full trail, drawn as trailLength-1
    // separate 2-vertex line segments (gl.LINES, not LINE_STRIP — a single
    // strip can't represent N disconnected per-particle polylines in one
    // draw call). Actual usage (vIdx) is usually smaller right after
    // particles respawn, so buffers are uploaded as a trimmed subarray.
    const maxVertices = this.particles.length * (trailLength - 1) * 2
    const positions = new Float32Array(maxVertices * 2)
    const speeds = new Float32Array(maxVertices)
    const alphas = new Float32Array(maxVertices)
    let vIdx = 0

    for (let i = 0; i < this.particles.length; i++) {
      let p = this.particles[i]

      if (advect) {
        const sample = this._sampleWind(p.lng, p.lat)
        p.age += 1

        if (!sample || p.age > MAX_AGE_FRAMES) {
          p = this._spawnParticle(west, south, east, north)
          this.particles[i] = p
        } else {
          const [u, v, speedNormalized] = sample
          // Degrees-per-frame step: scaled down at low latitudes' wider
          // degrees-per-km and, deliberately, NOT by current map zoom — a
          // particle's real-world speed should look consistent whether the
          // user is zoomed in or out, only the on-screen pixel distance
          // should change (which naturally happens via the projection
          // matrix, not this step size).
          const latRad = (p.lat * Math.PI) / 180
          // Guards against the degrees-per-km divisor collapsing toward 0
          // near the poles — live-testing finding, 2026-08-05: without this
          // clamp, a particle above ~89°N/S could jump thousands of degrees
          // of longitude in a single frame (division by a near-zero
          // cosine), which drew as a full-map-width erroneous streak once
          // trails (not just single points) were rendered.
          const cosLat = Math.max(Math.cos(latRad), 0.05)
          const step = SPEED_FACTOR * this.speedMultiplier
          p.lng += (u * step) / (111.32 * cosLat * 100)
          p.lat += (v * step) / (110.57 * 100)
          // Mercator's y projection (lngLatToMercator) divides by (1 -
          // sin(lat)), which blows up the same way as lat approaches ±90 —
          // clamp so a fast poleward-blowing v-component can't push a
          // particle to exactly the pole in one step.
          p.lat = Math.max(-89.9, Math.min(89.9, p.lat))
          p.speedNormalized = speedNormalized
          p.history.unshift([p.lng, p.lat])
          if (p.history.length > trailLength) p.history.pop()
        }
      }

      for (let h = 0; h < p.history.length - 1; h++) {
        const newer = p.history[h]
        const older = p.history[h + 1]
        const fade = 1 - h / (trailLength - 1) // segments nearer the head are more opaque
        const [mx0, my0] = lngLatToMercator(older[0], older[1])
        const [mx1, my1] = lngLatToMercator(newer[0], newer[1])
        positions[vIdx * 2] = mx0
        positions[vIdx * 2 + 1] = my0
        speeds[vIdx] = p.speedNormalized
        alphas[vIdx] = fade * 0.25
        vIdx++
        positions[vIdx * 2] = mx1
        positions[vIdx * 2 + 1] = my1
        speeds[vIdx] = p.speedNormalized
        alphas[vIdx] = fade * 0.85
        vIdx++
      }
    }

    gl.useProgram(this.program)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    // Live-debugged 2026-08-05: this layer rendered nothing on the main
    // map (68-layer style including fill-extrusion/3D + dimming layers)
    // while working fine on a simpler style — root cause was gl.DEPTH_TEST
    // being left enabled from an earlier layer's draw call. Our vertices
    // write z=0 (`vec4(a_pos, 0.0, 1.0)`), which the depth test then
    // silently failed against whatever depth values 3D/extrusion layers
    // already wrote at those pixels — drawArrays ran with zero errors and
    // correct vertex data, every fragment was just discarded. This layer
    // never needs depth testing (flat 2D particles, no self-occlusion to
    // resolve), so it's simplest to unconditionally disable it here.
    gl.disable(gl.DEPTH_TEST)
    // Same "don't inherit state from whatever layer drew last" reasoning
    // as DEPTH_TEST above — a stencil test left enabled (MapLibre uses the
    // stencil buffer for tile/fill clipping) or a colorMask left partially
    // disabled by an earlier layer would silently discard our fragments
    // exactly like the depth-test bug did, with zero errors either way.
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.SCISSOR_TEST)
    gl.colorMask(true, true, true, true)

    gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_matrix'), false, matrix)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_pointSize'), this.trailThickness)
    // Best-effort — most WebGL implementations (ANGLE on Windows/Chrome in
    // particular) clamp gl.lineWidth to 1 regardless of the value passed,
    // a WebGL 1 spec-allowed limitation, not a bug here. Harmless to set
    // anyway for the platforms that do honor it; the gl.POINTS draw below
    // is what actually carries trail thickness cross-platform.
    gl.lineWidth(this.trailThickness)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, vIdx * 2), gl.DYNAMIC_DRAW)
    const posLoc = gl.getAttribLocation(this.program, 'a_pos')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    if (!this.speedBuffer) this.speedBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.speedBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, speeds.subarray(0, vIdx), gl.DYNAMIC_DRAW)
    const speedLoc = gl.getAttribLocation(this.program, 'a_speed')
    gl.enableVertexAttribArray(speedLoc)
    gl.vertexAttribPointer(speedLoc, 1, gl.FLOAT, false, 0, 0)

    if (!this.alphaBuffer) this.alphaBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.alphaBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, alphas.subarray(0, vIdx), gl.DYNAMIC_DRAW)
    const alphaLoc = gl.getAttribLocation(this.program, 'a_alpha')
    gl.enableVertexAttribArray(alphaLoc)
    gl.vertexAttribPointer(alphaLoc, 1, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.LINES, 0, vIdx)
    // Also draw every trail vertex as a small point (gl_PointSize=3 in the
    // vertex shader) — live-testing finding, 2026-08-05: at world-zoom, a
    // single frame's worth of real-world particle movement is often
    // sub-pixel, so the LINES draw above can be technically correct but
    // visually imperceptible (confirmed via matrix/NDC math: particles
    // were provably on-screen yet invisible). A fixed-size point doesn't
    // depend on movement distance, so it stays visible regardless of zoom
    // — reuses the exact same already-bound buffers, no extra upload.
    gl.drawArrays(gl.POINTS, 0, vIdx)

    // Custom layers are responsible for restoring GL state they change —
    // MapLibre's own subsequent draws (fill/symbol/other custom layers)
    // assume blending is off unless a layer explicitly needs it. Left
    // enabled, a later-drawn layer (e.g. a second SimpleWindLayer instance,
    // or MapView.vue's own layers) could pick up unintended alpha
    // blending. Cheap and correct to reset every frame.
    gl.disable(gl.BLEND)
    gl.enable(gl.DEPTH_TEST) // restore MapLibre's own defaults so later layers (3D/extrusion, tile clipping) still work correctly
    gl.enable(gl.STENCIL_TEST)

    // custom layers don't animate on their own; keep the loop going — unless
    // reduced motion has finished building its static trail, in which case
    // staying frozen (no more self-triggered repaints) IS the point. The
    // map's own pan/zoom repaints still redraw this last frame as-is.
    if (advect) this.map.triggerRepaint()
  }
}
