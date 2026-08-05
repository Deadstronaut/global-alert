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
 */
export function boundsToImageCoordinates([west, south, east, north]) {
  const clampLat = (lat) => Math.max(-90, Math.min(90, lat))
  const clampLng = (lng) => Math.max(-180, Math.min(180, lng))
  const w = clampLng(west)
  const e = clampLng(east)
  const n = clampLat(north)
  const s = clampLat(south)
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
 */
export async function fetchLatestFlowSnapshot(layerType) {
  const { data, error } = await supabase
    .from('flow_snapshots')
    .select('texture_storage_path, u_min, u_max, v_min, v_max, bounds, issued_at')
    .eq('layer_type', layerType)
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
 * @param {'air_quality_pm25'} overlayType
 * @returns {Promise<{
 *   textureUrl: string,
 *   coordinates: [[number,number],[number,number],[number,number],[number,number]],
 *   valueRange: [number, number],
 *   issuedAt: string,
 * } | null>}
 */
export async function fetchLatestOverlaySnapshot(overlayType) {
  const { data, error } = await supabase
    .from('overlay_snapshots')
    .select('texture_storage_path, value_min, value_max, bounds, issued_at')
    .eq('overlay_type', overlayType)
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
 * @returns {Promise<string>} a PNG data URL, same shape overlay_snapshots'
 *   pre-colored textures have, so it can be used as a plain image source.
 */
export async function buildWindSpeedOverlayDataUrl(flowSnapshot) {
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
    const [r, g, bb] = speedToColor(speed / 40) // same 40 m/s ceiling as SimpleWindLayer's own particle color
    out.data[i] = r
    out.data[i + 1] = g
    out.data[i + 2] = bb
    out.data[i + 3] = 200
  }
  ctx.putImageData(out, 0, 0)
  return canvas.toDataURL('image/png')
}
