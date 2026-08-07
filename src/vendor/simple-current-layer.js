/**
 * Animated ocean-current particle layer — forked from simple-wind-layer.js
 * (2026-08-06, explicit user instruction: "hepsini ayrı tutman lazım... her
 * biri için ayrı bir motor yaz" — wind/currents/waves must be fully separate
 * engines, zero shared code, so tuning or fixing one can never change the
 * others' behavior again. This file intentionally duplicates
 * simple-wind-layer.js's structure rather than importing from it — do NOT
 * refactor the two back into a shared base without asking first).
 *
 * Same CustomLayerInterface technique as simple-wind-layer.js (see that
 * file's own header for the full rationale: public render(gl,options)
 * contract, CPU-side particle advection, why no third-party layer was
 * used). The real differences from wind are both about matching ocean
 * currents' own real-world value range instead of wind's:
 *   - CURRENT_SPEED_CEILING (2 m/s, not wind's 40) — real current speeds
 *     rarely exceed ~1-2 m/s even in the Gulf Stream's core (~2.5 m/s);
 *     reusing wind's 40 m/s ceiling made every pixel normalize to nearly 0,
 *     i.e. the same dim blue everywhere — no visible color variation
 *     (live-testing finding, 2026-08-06).
 *   - Particles spawn/respawn within the current on-screen viewport
 *     (padded), not spread across the full near-global data bounds — a
 *     fixed particle budget spread over the whole ocean showed only a
 *     sliver of particles in any one regional sea (also 2026-08-06).
 *
 * REVERTED (2026-08-06, same day): a persistent-fading-framebuffer render
 * technique (GPU ping-pong trail buffer, matching earth.nullschool.net's
 * own "painted flow field" look) was tried here and live-tested badly —
 * particles flickering on/off instead of flowing ("sönüp sönüp
 * parlıyorlar... ne partikül partikül yapıyor ne hareket hareketlerini
 * yapıyor" — nothing about it worked as intended). Reverted back to the
 * same direct-draw-every-frame technique simple-wind-layer.js/
 * simple-wave-layer.js use (per-particle stored position history,
 * redrawn as fading line segments each frame, no offscreen framebuffer).
 * If the "painted texture" look gets revisited, do it as a NEW attempt
 * with its own careful live-testing cycle, not by re-adding the FBO code
 * that was here — that specific implementation is what broke.
 */

const DEFAULT_PARTICLE_COUNT = 3000
const VIEWPORT_PADDING_FRACTION = 0.15
const MAX_AGE_FRAMES = 400
// Per-frame movement is step-scaled directly off the RAW u/v magnitude
// (real m/s here), not the normalized 0-1 speed — so real current speeds
// (~0-2 m/s, vs. wave's own synthetic "height" vectors of ~0-12) barely
// move particles each frame at wind's original 0.4 factor, which read as
// near-static dots instead of flowing lines (live-testing finding,
// 2026-08-06: "okyanus akıntıları nokta nokta ilerliyor, dalgalar çizgi
// halinde" — the two engines' motion scale should be swapped so currents
// get wave's flowing look and vice versa). 2.4 = 0.4 * (12/2), i.e. scaled
// up by the same ratio wave's own typical magnitude has over current's.
const SPEED_FACTOR = 2.4
const TRAIL_LENGTH = 18
const CURRENT_SPEED_CEILING = 2 // m/s — see header

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
    throw new Error(`Current layer shader compile error: ${info}`)
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
    throw new Error(`Current layer program link error: ${info}`)
  }
  return program
}

function lngLatToMercator(lng, lat) {
  const x = (180 + lng) / 360
  const sinLat = Math.sin((lat * Math.PI) / 180)
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)
  return [x, y]
}

function reducedMotionRequested() {
  if (document.documentElement.getAttribute('data-safe-mode') === 'true') return true
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}

export class SimpleCurrentLayer {
  /**
   * @param {string} id
   * @param {{ textureUrl: string, bounds: [number, number, number, number], dataRange: [[number,number],[number,number]], particleCount?: number, speedMultiplier?: number, trailLength?: number, trailThickness?: number, opacity?: number }} options
   *   bounds = [west, south, east, north]; dataRange = [[uMin,uMax],[vMin,vMax]]
   */
  constructor(id, options) {
    this.id = id
    this.type = 'custom'
    this.renderingMode = '2d'
    this.options = options
    this.particles = null
    this.imageData = null
    this.imageReady = false
    this.speedMultiplier = options.speedMultiplier ?? 1
    this.trailLength = options.trailLength ?? TRAIL_LENGTH
    this.trailThickness = options.trailThickness ?? 3.0
    // Live-tunable (gear-icon slider) — see setParticleCount() below.
    this.particleCount = options.particleCount ?? DEFAULT_PARTICLE_COUNT
    // Live-tunable opacity (gear-row slider, 2026-08-06 ask) — multiplies
    // every particle vertex's alpha.
    this.opacity = options.opacity ?? 1
  }

  setSpeedMultiplier(value) {
    this.speedMultiplier = value
  }

  setOpacity(value) {
    this.opacity = Math.max(0, Math.min(1, value))
  }

  setTrailLength(value) {
    this.trailLength = Math.max(2, Math.round(value))
  }

  setTrailThickness(value) {
    this.trailThickness = Math.max(0.1, value)
  }

  /**
   * Live particle-count adjustment (gear-icon slider, 2026-08-06 ask) —
   * grows/shrinks the live `particles` array in place rather than
   * recreating the layer, so dragging the slider doesn't cause a visible
   * flash/reset. No-op before the texture has loaded (_initParticles
   * hasn't run yet) — the new count is still recorded and used once it does.
   */
  setParticleCount(value) {
    const count = Math.max(0, Math.round(value))
    this.particleCount = count
    if (!this.particles) return
    if (this.particles.length > count) {
      this.particles.length = count
    } else if (this.particles.length < count) {
      const [west, south, east, north] = this._currentSpawnBounds()
      while (this.particles.length < count) {
        this.particles.push(this._spawnParticle(west, south, east, north))
      }
    }
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
      console.warn(`[SimpleCurrentLayer] Failed to load texture for ${this.id}`, e)
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
    const [west, south, east, north] = this._currentSpawnBounds()
    this.particles = []
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(this._spawnParticle(west, south, east, north))
    }
  }

  /**
   * Data bounds intersected with the current map viewport (padded) — see
   * this file's own header note on why (concentrates the particle budget
   * in whatever regional sea is actually on screen, instead of spreading
   * it across the whole near-global ocean-current dataset). Falls back to
   * the plain data bounds if the map/viewport isn't available yet, or if
   * the intersection is degenerate.
   */
  _currentSpawnBounds() {
    const [dWest, dSouth, dEast, dNorth] = this.options.bounds
    const fallback = [dWest, dSouth, dEast, dNorth]
    if (!this.map) return fallback
    let vb
    try {
      vb = this.map.getBounds()
    } catch {
      return fallback
    }
    if (!vb) return fallback

    const vWest = vb.getWest()
    const vEast = vb.getEast()
    const vSouth = Math.max(vb.getSouth(), -89.9)
    const vNorth = Math.min(vb.getNorth(), 89.9)
    const lngPad = (vEast - vWest) * VIEWPORT_PADDING_FRACTION
    const latPad = (vNorth - vSouth) * VIEWPORT_PADDING_FRACTION

    const west = Math.max(dWest, vWest - lngPad)
    const east = Math.min(dEast, vEast + lngPad)
    const south = Math.max(dSouth, vSouth - latPad)
    const north = Math.min(dNorth, vNorth + latPad)
    if (west >= east || south >= north) return fallback
    return [west, south, east, north]
  }

  _spawnParticle(west, south, east, north) {
    const lng = west + Math.random() * (east - west)
    const lat = south + Math.random() * (north - south)
    return {
      lng,
      lat,
      age: Math.floor(Math.random() * MAX_AGE_FRAMES),
      history: [[lng, lat]],
      speedNormalized: 0,
    }
  }

  /** Samples the current texture at a given lng/lat, returns [u, v, speedNormalized] or null if out of bounds. */
  _sampleCurrent(lng, lat) {
    const { bounds, dataRange } = this.options
    const [west, south, east, north] = bounds
    if (lng < west || lng > east || lat < south || lat > north) return null

    const px = Math.floor(((lng - west) / (east - west)) * this.imageData.width)
    const py = Math.floor(((north - lat) / (north - south)) * this.imageData.height)
    const idx = (Math.min(py, this.imageData.height - 1) * this.imageData.width + Math.min(px, this.imageData.width - 1)) * 4
    const r = this.imageData.data[idx]
    const g = this.imageData.data[idx + 1]
    // Blue channel = validity mask (flow_texture_common.py's
    // build_flow_texture) — 0 means no real data here (land).
    const b = this.imageData.data[idx + 2]
    if (b < 128) return null

    const [uMin, uMax] = dataRange[0]
    const [vMin, vMax] = dataRange[1]
    const u = uMin + (r / 255) * (uMax - uMin)
    const v = vMin + (g / 255) * (vMax - vMin)
    const speed = Math.sqrt(u * u + v * v)
    const speedNormalized = Math.min(speed / CURRENT_SPEED_CEILING, 1)
    return [u, v, speedNormalized]
  }

  _ensureBuffers(maxVertices) {
    if (!this._bufMaxVertices || this._bufMaxVertices < maxVertices) {
      this._bufMaxVertices = maxVertices
      this._positions = new Float32Array(maxVertices * 2)
      this._speeds = new Float32Array(maxVertices)
      this._alphas = new Float32Array(maxVertices)
    }
    return { positions: this._positions, speeds: this._speeds, alphas: this._alphas }
  }

  render(gl, options) {
    if (!this.imageReady || !this.particles) return
    const matrix = options.defaultProjectionData.mainMatrix
    const [west, south, east, north] = this._currentSpawnBounds()

    const trailLength = this.trailLength
    const reducedMotion = reducedMotionRequested()
    if (!reducedMotion) {
      this._staticFramesRemaining = null
    } else if (this._staticFramesRemaining == null) {
      this._staticFramesRemaining = trailLength
    }
    const advect = !reducedMotion || this._staticFramesRemaining > 0
    if (reducedMotion && advect) this._staticFramesRemaining -= 1

    const maxVertices = this.particles.length * (trailLength - 1) * 2
    const { positions, speeds, alphas } = this._ensureBuffers(maxVertices)
    let vIdx = 0

    for (let i = 0; i < this.particles.length; i++) {
      let p = this.particles[i]

      if (advect) {
        const sample = this._sampleCurrent(p.lng, p.lat)
        p.age += 1
        const outOfView = p.lng < west || p.lng > east || p.lat < south || p.lat > north

        if (!sample || p.age > MAX_AGE_FRAMES || outOfView) {
          p = this._spawnParticle(west, south, east, north)
          this.particles[i] = p
        } else {
          const [u, v, speedNormalized] = sample
          const latRad = (p.lat * Math.PI) / 180
          const cosLat = Math.max(Math.cos(latRad), 0.05)
          const step = SPEED_FACTOR * this.speedMultiplier
          p.lng += (u * step) / (111.32 * cosLat * 100)
          p.lat += (v * step) / (110.57 * 100)
          p.lat = Math.max(-89.9, Math.min(89.9, p.lat))
          p.speedNormalized = speedNormalized
          p.history.unshift([p.lng, p.lat])
          if (p.history.length > trailLength) p.history.pop()
        }
      }

      for (let h = 0; h < p.history.length - 1; h++) {
        const newer = p.history[h]
        const older = p.history[h + 1]
        const fade = 1 - h / (trailLength - 1)
        const [mx0, my0] = lngLatToMercator(older[0], older[1])
        const [mx1, my1] = lngLatToMercator(newer[0], newer[1])
        positions[vIdx * 2] = mx0
        positions[vIdx * 2 + 1] = my0
        speeds[vIdx] = p.speedNormalized
        alphas[vIdx] = fade * 0.25 * this.opacity
        vIdx++
        positions[vIdx * 2] = mx1
        positions[vIdx * 2 + 1] = my1
        speeds[vIdx] = p.speedNormalized
        alphas[vIdx] = fade * 0.85 * this.opacity
        vIdx++
      }
    }

    gl.useProgram(this.program)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.SCISSOR_TEST)
    gl.colorMask(true, true, true, true)

    gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_matrix'), false, matrix)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_pointSize'), this.trailThickness)
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
    gl.drawArrays(gl.POINTS, 0, vIdx)

    gl.disable(gl.BLEND)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.STENCIL_TEST)

    if (advect) this.map.triggerRepaint()
  }
}
