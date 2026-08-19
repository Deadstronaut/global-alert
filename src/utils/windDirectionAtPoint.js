/**
 * Spec 070 (Rüzgar Yönüne Dayalı Yayılım Tahmini) — decodes the wind speed
 * AND direction at one specific point from the same flow_snapshots texture
 * windLayerData.js's buildWindSpeedOverlayDataUrl already decodes in full
 * for the speed-heatmap Overlay. That function reads every pixel to build
 * a whole new image; this one reads exactly one pixel, since the only
 * thing spec 070 needs is "what's the wind doing at this hex's centroid" —
 * research.md R2's decision to avoid a new precomputed per-hex table.
 *
 * Texture is stored equirectangular (wind-importer/flow_texture_common.py's
 * TEXTURE_WIDTH x TEXTURE_HEIGHT grid, linear in lat/lng) — NOT the
 * Web-Mercator-warped image windLayerData.js produces for on-map display,
 * so lat/lng -> pixel here is a plain linear mapping against `bounds`.
 *
 * Split into pure helpers (exported, unit-testable with no DOM) + a thin
 * async orchestrator (Image/canvas — untested at the unit level, same as
 * windLayerData.js's own buildWindSpeedOverlayDataUrl, which has never had
 * canvas-level coverage either; this repo's tests run under Vitest's
 * `node` environment with no jsdom/Image/canvas shims — verified live via
 * Playwright instead, per this feature's quickstart.md).
 */

// research.md R3 — direction is reported as "which way the wind is
// blowing TOWARD" (compass bearing, 0=N/90=E/180=S/270=W), not the
// meteorological "reporting" convention (which way it's blowing FROM).
// The user's own scenario ("rüzgar batıdan esiyor... doğuya yayılacak")
// is a propagation direction, and mixing the two conventions in one UI
// invites an inverted-arrow bug — so only ever compute/expose this one.
export function uvToCompassBearingDeg(u, v) {
  const mathAngleDeg = (Math.atan2(v, u) * 180) / Math.PI // 0=East, 90=North, CCW
  return (90 - mathAngleDeg + 360) % 360
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {[number,number,number,number]} bounds [west, south, east, north]
 * @param {number} width texture pixel width
 * @param {number} height texture pixel height
 * @returns {{ col: number, row: number } | null} null when the point falls
 *   outside `bounds` entirely — never a clamped guess for an out-of-range point.
 */
export function latLngToPixel(lat, lng, [west, south, east, north], width, height) {
  if (lat < south || lat > north || lng < west || lng > east) return null
  const col = Math.round(((lng - west) / (east - west)) * (width - 1))
  const row = Math.round(((north - lat) / (north - south)) * (height - 1)) // row 0 = north edge
  return {
    col: Math.max(0, Math.min(width - 1, col)),
    row: Math.max(0, Math.min(height - 1, row)),
  }
}

/**
 * @param {[number, number, number]} rgb one pixel's [R, G, B] (0-255 each)
 * @param {[[number,number],[number,number]]} dataRange [[uMin,uMax],[vMin,vMax]]
 * @returns {{ windSpeed: number, windDirectionDeg: number } | null} null when
 *   the pixel is masked invalid (land/nodata) — flow_texture_common.py's
 *   build_flow_texture convention: blue channel is a validity mask, < 128
 *   means "no real sample here", never a fabricated speed/direction (FR-005).
 */
export function decodePixelToWindCondition([r, g, b], [[uMin, uMax], [vMin, vMax]]) {
  if (b < 128) return null
  const u = uMin + (r / 255) * (uMax - uMin)
  const v = vMin + (g / 255) * (vMax - vMin)
  return {
    windSpeed: Math.hypot(u, v),
    windDirectionDeg: uvToCompassBearingDeg(u, v),
  }
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ textureUrl: string, bounds: [number,number,number,number], dataRange: [[number,number],[number,number]], issuedAt: string }} flowSnapshot
 *   Same shape `fetchLatestFlowSnapshot('wind')` already returns (windLayerData.js) — no new fields.
 * @returns {Promise<{ windSpeed: number, windDirectionDeg: number, issuedAt: string } | null>}
 */
export async function windDirectionAtPoint(lat, lng, flowSnapshot) {
  if (!flowSnapshot?.textureUrl || !flowSnapshot.bounds) return null

  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
    image.src = flowSnapshot.textureUrl
  })

  const pixel = latLngToPixel(lat, lng, flowSnapshot.bounds, image.width, image.height)
  if (!pixel) return null

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const [r, g, b] = ctx.getImageData(pixel.col, pixel.row, 1, 1).data

  const condition = decodePixelToWindCondition([r, g, b], flowSnapshot.dataRange)
  if (!condition) return null

  return { ...condition, issuedAt: flowSnapshot.issuedAt }
}
