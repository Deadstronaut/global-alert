import { describe, it, expect } from 'vitest'
import { uvToCompassBearingDeg, latLngToPixel, decodePixelToWindCondition } from '@/utils/windDirectionAtPoint.js'

describe('uvToCompassBearingDeg', () => {
  it('pure eastward wind (u>0, v=0) reports 90° (East) — the direction it blows TOWARD', () => {
    expect(uvToCompassBearingDeg(10, 0)).toBeCloseTo(90)
  })

  it('pure northward wind (u=0, v>0) reports 0° (North)', () => {
    expect(uvToCompassBearingDeg(0, 10)).toBeCloseTo(0)
  })

  it('pure westward wind (u<0, v=0) reports 270° (West)', () => {
    expect(uvToCompassBearingDeg(-10, 0)).toBeCloseTo(270)
  })

  it('pure southward wind (u=0, v<0) reports 180° (South)', () => {
    expect(uvToCompassBearingDeg(0, -10)).toBeCloseTo(180)
  })
})

describe('latLngToPixel', () => {
  const bounds = [-180, -90, 180, 90] // west, south, east, north
  const width = 720
  const height = 361

  it('maps the center of the bounds to the center of the texture', () => {
    const pixel = latLngToPixel(0, 0, bounds, width, height)
    expect(pixel.col).toBeCloseTo(width / 2, -1)
    expect(pixel.row).toBeCloseTo(height / 2, -1)
  })

  it('maps the north-west corner to pixel (0, 0)', () => {
    expect(latLngToPixel(90, -180, bounds, width, height)).toEqual({ col: 0, row: 0 })
  })

  it('maps the south-east corner to the last pixel', () => {
    expect(latLngToPixel(-90, 180, bounds, width, height)).toEqual({ col: width - 1, row: height - 1 })
  })

  it('returns null for a point outside the bounds', () => {
    expect(latLngToPixel(45, 200, bounds, width, height)).toBeNull()
    expect(latLngToPixel(95, 0, bounds, width, height)).toBeNull()
  })
})

describe('decodePixelToWindCondition', () => {
  const dataRange = [[-20, 20], [-20, 20]] // uMin/uMax, vMin/vMax

  it('decodes a mid-range pixel back to real u/v and computes speed+direction', () => {
    // R=128 -> u ≈ 0 (mid of -20..20); G=255 -> v = 20 (max); B=255 -> valid
    const result = decodePixelToWindCondition([128, 255, 255], dataRange)
    expect(result).not.toBeNull()
    expect(result.windSpeed).toBeGreaterThan(19) // ~v=20, u≈0
    expect(result.windDirectionDeg).toBeCloseTo(0, 0) // blowing toward North
  })

  it('returns null when the blue validity mask is below 128 (land/nodata)', () => {
    expect(decodePixelToWindCondition([128, 128, 50], dataRange)).toBeNull()
  })

  it('never fabricates a value for a masked pixel, even with extreme R/G bytes', () => {
    expect(decodePixelToWindCondition([255, 0, 0], dataRange)).toBeNull()
  })
})
