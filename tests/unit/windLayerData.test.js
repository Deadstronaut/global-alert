import { describe, it, expect } from 'vitest'
import { boundsToImageCoordinates } from '@/utils/windLayerData.js'

const WEB_MERCATOR_MAX_LAT = 85.0511287798

describe('boundsToImageCoordinates', () => {
  it('converts [west, south, east, north] into top-left/top-right/bottom-right/bottom-left order, longitude preserved', () => {
    const bounds = [-180, -85, 180, 85]
    expect(boundsToImageCoordinates(bounds)).toEqual([
      [-180, WEB_MERCATOR_MAX_LAT],
      [180, WEB_MERCATOR_MAX_LAT],
      [180, -WEB_MERCATOR_MAX_LAT],
      [-180, -WEB_MERCATOR_MAX_LAT],
    ])
  })

  // north/south always land on exactly ±WEB_MERCATOR_MAX_LAT regardless of
  // the real input bounds (2026-08-06 fix) — the warped image content this
  // is paired with (warpEquirectImageDataToWebMercator, or overlay_texture.
  // py's server-side twin) always spans exactly that range by construction,
  // so the placement corners must match it exactly, not the source data's
  // own real coverage. A dataset whose real bounds are narrower on only one
  // side (e.g. ocean_current's CMEMS request, -80..90 lat) used to keep its
  // own unclamped south value here while the warped pixels still assumed
  // -85.05, stretching the placement out of sync with the image content —
  // live-testing finding: "harita tam oturmuyor... daha aşağıda durması
  // gerekiyor". West/east (longitude) are unaffected — Mercator doesn't
  // distort longitude, only clamped to the valid ±180 range.
  it('always places north/south at exactly ±WEB_MERCATOR_MAX_LAT, regardless of how narrow the real bounds are', () => {
    const bounds = [25.5, 35.7, 44.9, 43.1]
    expect(boundsToImageCoordinates(bounds)).toEqual([
      [25.5, WEB_MERCATOR_MAX_LAT],
      [44.9, WEB_MERCATOR_MAX_LAT],
      [44.9, -WEB_MERCATOR_MAX_LAT],
      [25.5, -WEB_MERCATOR_MAX_LAT],
    ])
  })

  it('always places north/south at exactly ±WEB_MERCATOR_MAX_LAT for asymmetric bounds too (e.g. ocean_current -80..90)', () => {
    const bounds = [-180, -80.125, 180, 90.125]
    expect(boundsToImageCoordinates(bounds)).toEqual([
      [-180, WEB_MERCATOR_MAX_LAT],
      [180, WEB_MERCATOR_MAX_LAT],
      [180, -WEB_MERCATOR_MAX_LAT],
      [-180, -WEB_MERCATOR_MAX_LAT],
    ])
  })

  it('clamps longitude to ±180', () => {
    const bounds = [-190, -10, 190, 10]
    const [[w], [e]] = boundsToImageCoordinates(bounds)
    expect(w).toBe(-180)
    expect(e).toBe(180)
  })
})
