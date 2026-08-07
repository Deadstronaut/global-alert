/**
 * Fetches the latest wind/ocean-current flow snapshot (spec 053) and
 * resolves it into the shape @sakitam-gis/maplibre-wind's ImageSource
 * expects — contracts/flow-snapshot-contract.md's "Frontend → Consumer"
 * steps 1-3, kept separate from MapView.vue so it's testable without a
 * real map instance (matches this repo's convention of extracting pure/
 * fetchable logic into src/utils/, e.g. disasterSourceBadges.js).
 */
import { supabase } from '@/services/api/config.js'

/**
 * [west, south, east, north] -> maplibre-wind's ImageSourceOptions.coordinates
 * shape: [top-left, top-right, bottom-right, bottom-left].
 *
 * Clamps to valid lng/lat ranges — wind-importer's GDAL grid resampling
 * (flow_texture_common.py's TEXTURE_WIDTH/HEIGHT) produces pixel-edge
 * bounds like north=90.125/south=-90.125 (half a pixel beyond the pole,
 * an artifact of how gdal.Translate reports a grid's outer edge, not a
 * bug in the data itself). SimpleWindLayer's own manual per-particle
 * projection tolerates that fine, but live-verified 2026-08-05:
 * MapLibre's built-in `image` source type throws "Invalid LngLat
 * latitude value: must be between -90 and 90" and silently fails to
 * render anything — this is why every pre-colored Overlay layer (PM2.5,
 * Temp, RH, ...) added no visible layer at all despite the source/layer
 * both reporting success.
 *
 * ±90 itself is still not safe, even though it passes that validity
 * check — live-verified in a second round, 2026-08-06: Web Mercator's own
 * y = f(lat) formula (the same one lngLatToMercator in
 * simple-wind-layer.js implements) divides by (1 - sin(lat)), which is
 * exactly 0 at the true pole, producing y=Infinity and a downstream
 * "outside of bounds" tile-coordinate crash. 85.0511287798° is the
 * standard Web Mercator projection limit (the latitude where the
 * projected square becomes literally square) — MapLibre and every other
 * Mercator-based web map clamp to this same value internally.
 */
const WEB_MERCATOR_MAX_LAT = 85.0511287798

function mercatorY(latDeg) {
  const latRad = (latDeg * Math.PI) / 180
  const sinLat = Math.sin(latRad)
  return 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)
}

/**
 * Row-remaps an equirectangular (plate carrée) ImageData into Web
 * Mercator's own vertical spacing — the JS twin of wind-importer/
 * overlay_texture.py's warp_equirect_rgba_to_web_mercator(), needed here
 * because this speed-color overlay is colored entirely client-side
 * (buildWindSpeedOverlayDataUrl below), unlike the pre-colored
 * overlay_snapshots textures the Python importer already warps before
 * upload. See that Python function's own docstring for why this step
 * exists at all (MapLibre's `image` source assumes linear-in-Mercator
 * spacing, not linear-in-latitude) — same root cause, same fix, just
 * a per-row nearest-neighbor resample instead of a full reprojection
 * since longitude needs no remapping.
 */
function warpEquirectImageDataToWebMercator(src, sourceSouth, sourceNorth) {
  const { width, height } = src
  const out = new ImageData(width, height)
  const mercNorth = mercatorY(WEB_MERCATOR_MAX_LAT)
  const mercSouth = mercatorY(-WEB_MERCATOR_MAX_LAT)
  for (let row = 0; row < height; row++) {
    const frac = row / (height - 1)
    const mercY = mercNorth + frac * (mercSouth - mercNorth)
    // Inverse of mercatorY: solve y = 0.5 - ln((1+sin(lat))/(1-sin(lat)))/(4*pi) for lat.
    const a = (0.5 - mercY) * 4 * Math.PI
    const lat = (Math.asin(Math.tanh(a / 2)) * 180) / Math.PI

    const srcRowFrac = ((sourceNorth - lat) / (sourceNorth - sourceSouth)) * (height - 1)
    const srcRow = Math.max(0, Math.min(height - 1, Math.round(srcRowFrac)))

    const srcOffset = srcRow * width * 4
    const outOffset = row * width * 4
    out.data.set(src.data.subarray(srcOffset, srcOffset + width * 4), outOffset)
  }
  return out
}

/**
 * north/south are ALWAYS placed at exactly ±WEB_MERCATOR_MAX_LAT — not
 * "clamped only if the real bounds exceed it" — because the warped image
 * CONTENT this is paired with (warpEquirectImageDataToWebMercator above,
 * and overlay_texture.py's server-side twin for pre-colored Overlay
 * textures) always outputs rows spanning exactly that range by
 * construction, regardless of the source data's own real coverage
 * (padding/clamping edge rows when the source doesn't reach that far —
 * see that function's own comments). A dataset whose real bounds are
 * narrower than ±85.05 on one side only — e.g. ocean_current's CMEMS
 * request, -80..90 lat, not wind's near-symmetric ~-90.125..90.125 — used
 * to keep its own (unclamped, since -80 is "within range") south value
 * here while the warped image content still assumed -85.05, stretching
 * the image's placement corners out of sync with its own pixel content
 * (live-testing finding, 2026-08-06: "harita tam oturmuyor... daha
 * aşağıda durması gerekiyor" — the same class of bug wind itself had
 * before its own fix, this time triggered by ocean_current's asymmetric
 * bounds specifically). wind's bounds happened to exceed ±85.05 on BOTH
 * sides, so this bug was invisible there by coincidence.
 */
export function boundsToImageCoordinates([west, south, east, north]) {
  const clampLng = (lng) => Math.max(-180, Math.min(180, lng))
  const w = clampLng(west)
  const e = clampLng(east)
  const n = WEB_MERCATOR_MAX_LAT
  const s = -WEB_MERCATOR_MAX_LAT
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ]
}

/**
 * @param {'wind'|'ocean_current'} layerType
 * @returns {Promise<{
 *   textureUrl: string,
 *   coordinates: [[number,number],[number,number],[number,number],[number,number]],
 *   dataRange: [[number,number],[number,number]],
 *   issuedAt: string,
 * } | null>} null when no snapshot exists yet (e.g. importer never run) —
 *   callers should treat this the same as a fetch failure (FR-006's
 *   graceful "unavailable" state), not throw.
 * @param {string} [level] Height selector (spec 054 follow-up,
 *   2026-08-06) — 'sfc' (default) for every layer type, or a GFS
 *   pressure level string for 'wind' specifically (the only level-aware
 *   flow_snapshots layer_type; ocean_current/wave only ever have a 'sfc'
 *   row). Same contract as fetchLatestOverlaySnapshot's own `level` param.
 */
export async function fetchLatestFlowSnapshot(layerType, level = 'sfc') {
  const { data, error } = await supabase
    .from('flow_snapshots')
    .select('texture_storage_path, u_min, u_max, v_min, v_max, bounds, issued_at')
    .eq('layer_type', layerType)
    .eq('level', level)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const { data: urlData } = supabase.storage.from('flow-snapshots').getPublicUrl(data.texture_storage_path)
  if (!urlData?.publicUrl) return null

  return {
    textureUrl: urlData.publicUrl,
    bounds: data.bounds, // [west, south, east, north] — SimpleWindLayer's own sampling shape
    coordinates: boundsToImageCoordinates(data.bounds),
    dataRange: [
      [data.u_min, data.u_max],
      [data.v_min, data.v_max],
    ],
    issuedAt: data.issued_at,
  }
}

/**
 * Spec 054 US2 — parallel to fetchLatestFlowSnapshot, but for the
 * pre-colored, scalar Overlay (contracts/overlay-snapshot-contract.md).
 * The returned PNG is already RGBA-colored server-side (overlay_texture.py)
 * — the frontend just draws it as a plain MapLibre image/raster source, no
 * decode step needed, unlike the vector flow-snapshot texture above.
 * @param {'air_quality_pm25'|'temperature'|'relative_humidity'|...} overlayType
 * @param {string} [level] Height selector (spec 054 follow-up, 2026-08-06)
 *   — 'sfc' (default) for every overlay type, or a GFS pressure level
 *   string ('1000'|'850'|'700'|'500'|'250'|'70'|'10') for the two
 *   level-aware fields (Temp, RH). Fields that never had per-level data
 *   only ever have a 'sfc' row, so passing anything else for them would
 *   just find nothing — callers are expected to only vary level for the
 *   fields that actually support it (FlowControlPanel.vue's Height row).
 * @returns {Promise<{
 *   textureUrl: string,
 *   coordinates: [[number,number],[number,number],[number,number],[number,number]],
 *   valueRange: [number, number],
 *   issuedAt: string,
 * } | null>}
 */
export async function fetchLatestOverlaySnapshot(overlayType, level = 'sfc') {
  const { data, error } = await supabase
    .from('overlay_snapshots')
    .select('texture_storage_path, value_min, value_max, bounds, issued_at')
    .eq('overlay_type', overlayType)
    .eq('level', level)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const { data: urlData } = supabase.storage.from('overlay-snapshots').getPublicUrl(data.texture_storage_path)
  if (!urlData?.publicUrl) return null

  return {
    textureUrl: urlData.publicUrl,
    coordinates: boundsToImageCoordinates(data.bounds),
    valueRange: [data.value_min, data.value_max],
    issuedAt: data.issued_at,
  }
}

// Smooth multi-stop speed ramp (calm -> extreme), matching the reference
// tool's own wind-speed overlay language more closely than a discrete
// quantile-bucket ramp would — this overlay has no server-side coloring
// step to bucket in, so it's computed client-side per pixel anyway.
const WIND_SPEED_RAMP = [
  [98, 113, 183], [61, 159, 133], [86, 173, 74],
  [203, 190, 60], [223, 137, 45], [200, 63, 63], [147, 66, 173],
]
function speedToColor(t) {
  const clamped = Math.max(0, Math.min(1, t))
  const scaled = clamped * (WIND_SPEED_RAMP.length - 1)
  const i = Math.min(Math.floor(scaled), WIND_SPEED_RAMP.length - 2)
  const frac = scaled - i
  const [r0, g0, b0] = WIND_SPEED_RAMP[i]
  const [r1, g1, b1] = WIND_SPEED_RAMP[i + 1]
  return [r0 + (r1 - r0) * frac, g0 + (g1 - g0) * frac, b0 + (b1 - b0) * frac]
}

/**
 * Spec 054 follow-up (live-testing ask, 2026-08-05: reference tool's own
 * "Overlay: Wind" entry — wind SPEED as a color heatmap, distinct from the
 * animated flow lines) — reuses the already-fetched flow_snapshots wind
 * texture and decodes it client-side, no new backend importer needed.
 * @param {{ textureUrl: string, dataRange: [[number,number],[number,number]] }} flowSnapshot
 * @param {number} [speedCeiling] Normalization ceiling for the color ramp
 *   below — defaults to wind's own 40 m/s. Callers rendering ocean_current
 *   or wave must pass their own real-world ceiling (2026-08-06 live-testing
 *   finding: reusing 40 for ocean currents, whose real speeds rarely exceed
 *   ~1-2 m/s, normalized nearly every pixel to ~0 — the same dim blue
 *   everywhere, no visible heatmap gradient). Kept as a plain optional
 *   param (not a layerType lookup table) so this file has no knowledge of
 *   which layer_types exist — that's simple-current-layer.js/
 *   simple-wave-layer.js's own concern now that each layer is its own
 *   isolated engine.
 * @returns {Promise<string>} a PNG data URL, same shape overlay_snapshots'
 *   pre-colored textures have, so it can be used as a plain image source.
 */
export async function buildWindSpeedOverlayDataUrl(flowSnapshot, speedCeiling = 40) {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
    image.src = flowSnapshot.textureUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const src = ctx.getImageData(0, 0, image.width, image.height)
  const out = ctx.createImageData(image.width, image.height)

  const [[uMin, uMax], [vMin, vMax]] = flowSnapshot.dataRange
  for (let i = 0; i < src.data.length; i += 4) {
    const b = src.data[i + 2] // validity mask, flow_texture_common.py's build_flow_texture
    if (b < 128) {
      out.data[i + 3] = 0 // transparent — no real data here (land/nodata)
      continue
    }
    const u = uMin + (src.data[i] / 255) * (uMax - uMin)
    const v = vMin + (src.data[i + 1] / 255) * (vMax - vMin)
    const speed = Math.sqrt(u * u + v * v)
    const [r, g, bb] = speedToColor(speed / speedCeiling)
    out.data[i] = r
    out.data[i + 1] = g
    out.data[i + 2] = bb
    out.data[i + 3] = 200
  }
  const [, south, , north] = flowSnapshot.bounds
  const warped = warpEquirectImageDataToWebMercator(out, south, north)
  ctx.putImageData(warped, 0, 0)
  return canvas.toDataURL('image/png')
}
