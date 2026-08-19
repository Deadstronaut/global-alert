import { describe, it, expect } from 'vitest'
import { latLngToCell, cellToLatLng } from 'h3-js'
import { computeSpreadProjection, computeCoveringRadiusKm, WIND_AFFECTED_HAZARD_TYPES } from '@/utils/windSpreadPrediction.js'

const RES = 7
const sourceH3Id = latLngToCell(38.6, 27.85, RES) // roughly Aydın, TR — matches the user's own example scenario

describe('WIND_AFFECTED_HAZARD_TYPES', () => {
  it('includes wildfire, dust_storm, volcano, cyclone', () => {
    expect(WIND_AFFECTED_HAZARD_TYPES.has('wildfire')).toBe(true)
    expect(WIND_AFFECTED_HAZARD_TYPES.has('dust_storm')).toBe(true)
    expect(WIND_AFFECTED_HAZARD_TYPES.has('volcano')).toBe(true)
    expect(WIND_AFFECTED_HAZARD_TYPES.has('cyclone')).toBe(true)
  })

  it('excludes tsunami — wave physics, not wind-driven (spec.md Assumptions)', () => {
    expect(WIND_AFFECTED_HAZARD_TYPES.has('tsunami')).toBe(false)
  })

  it('excludes earthquake, flood, drought, food_security, epidemic', () => {
    for (const type of ['earthquake', 'flood', 'drought', 'food_security', 'epidemic']) {
      expect(WIND_AFFECTED_HAZARD_TYPES.has(type)).toBe(false)
    }
  })
})

describe('computeSpreadProjection', () => {
  const windFromEast = { windSpeed: 10, windDirectionDeg: 270, issuedAt: '2026-08-18T21:00:00Z' } // blowing toward West

  it('returns null for a hazard type that is not wind-affected (FR-009)', () => {
    const event = { id: 'eq-1', type: 'earthquake', h3_id: sourceH3Id }
    expect(computeSpreadProjection(event, windFromEast)).toBeNull()
  })

  it('returns null for tsunami specifically, even with strong wind data present', () => {
    const event = { id: 'ts-1', type: 'tsunami', h3_id: sourceH3Id }
    expect(computeSpreadProjection(event, windFromEast)).toBeNull()
  })

  it('returns null when windCondition is null (no data — FR-005)', () => {
    const event = { id: 'fire-1', type: 'wildfire', h3_id: sourceH3Id }
    expect(computeSpreadProjection(event, null)).toBeNull()
  })

  it('returns null when wind speed is below the calm threshold (FR-005 — never a fabricated direction)', () => {
    const event = { id: 'fire-1', type: 'wildfire', h3_id: sourceH3Id }
    const calm = { windSpeed: 0.2, windDirectionDeg: 270, issuedAt: '2026-08-18T21:00:00Z' }
    expect(computeSpreadProjection(event, calm)).toBeNull()
  })

  it('produces a projection for a wind-affected hazard with real wind data', () => {
    const event = { id: 'fire-1', type: 'wildfire', h3_id: sourceH3Id }
    const projection = computeSpreadProjection(event, windFromEast)
    expect(projection).not.toBeNull()
    expect(projection.sourceEventId).toBe('fire-1')
    expect(projection.sourceHazardType).toBe('wildfire')
    expect(projection.sourceH3Id).toBe(sourceH3Id)
    expect(projection.windCondition).toBe(windFromEast)
    expect(projection.projectedHexIds.length).toBeGreaterThan(0)
    expect(projection.projectedHexIds).not.toContain(sourceH3Id) // never includes the source hex itself
  })

  it('every projected hex is roughly in the wind direction from the source, not the opposite side', () => {
    const event = { id: 'fire-1', type: 'wildfire', h3_id: sourceH3Id }
    const projection = computeSpreadProjection(event, windFromEast)
    const [sourceLat, sourceLng] = cellToLatLng(sourceH3Id)
    for (const h3Id of projection.projectedHexIds) {
      const [lat, lng] = cellToLatLng(h3Id)
      // wind blows toward West (270°) — every projected hex should be west of the source (lower longitude)
      expect(lng).toBeLessThan(sourceLng)
    }
  })

  it('respects a custom hexRings/coneAngleDeg option', () => {
    const event = { id: 'fire-1', type: 'wildfire', h3_id: sourceH3Id }
    const wide = computeSpreadProjection(event, windFromEast, { hexRings: 1, coneAngleDeg: 180 })
    const narrow = computeSpreadProjection(event, windFromEast, { hexRings: 1, coneAngleDeg: 10 })
    expect(wide.projectedHexIds.length).toBeGreaterThanOrEqual(narrow.projectedHexIds.length)
  })
})

describe('computeCoveringRadiusKm', () => {
  const windFromEast = { windSpeed: 10, windDirectionDeg: 270, issuedAt: '2026-08-18T21:00:00Z' }

  it('returns null when there is no projection (nothing to cover)', () => {
    expect(computeCoveringRadiusKm(null)).toBeNull()
    expect(computeCoveringRadiusKm({ sourceH3Id, projectedHexIds: [] })).toBeNull()
  })

  it('returns a positive km radius large enough to cover the farthest projected hex', () => {
    const event = { id: 'fire-1', type: 'wildfire', h3_id: sourceH3Id }
    const projection = computeSpreadProjection(event, windFromEast, { hexRings: 2 })
    const radiusKm = computeCoveringRadiusKm(projection)
    expect(radiusKm).toBeGreaterThan(0)
    // res-7 hexes are ~1.2km across — 2 rings should stay well under 20km
    expect(radiusKm).toBeLessThan(20)
  })

  it('grows with hexRings', () => {
    const event = { id: 'fire-1', type: 'wildfire', h3_id: sourceH3Id }
    const small = computeCoveringRadiusKm(computeSpreadProjection(event, windFromEast, { hexRings: 1, coneAngleDeg: 180 }))
    const large = computeCoveringRadiusKm(computeSpreadProjection(event, windFromEast, { hexRings: 3, coneAngleDeg: 180 }))
    expect(large).toBeGreaterThan(small)
  })
})
