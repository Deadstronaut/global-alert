import { describe, it, expect } from 'vitest'
import { latLngToCell } from 'h3-js'
import {
  evaluateLateralRisks,
  accessRiskFinding,
  windSpreadAsFinding,
  coastalDistanceKm,
  computeTsunamiRiskFinding,
  LATERAL_RISK_RULES,
} from '@/utils/lateralRiskRules.js'

const RES = 7
const quakeH3Id = latLngToCell(38.6, 27.85, RES) // Aydın, TR — same example scenario as spec 070

describe('evaluateLateralRisks', () => {
  const quake = { id: 'eq-1', type: 'earthquake', h3_id: quakeH3Id }

  it('returns [] when sourceEvent has no h3_id', () => {
    expect(evaluateLateralRisks({ id: 'x', type: 'earthquake' }, () => [{ id: 'd1' }])).toEqual([])
  })

  it('returns [] when nearbyEventsLookup is not a function', () => {
    expect(evaluateLateralRisks(quake, null)).toEqual([])
  })

  it('returns [] when no nearby condition matches (never a fabricated finding)', () => {
    const lookup = () => []
    expect(evaluateLateralRisks(quake, lookup)).toEqual([])
  })

  it('produces the fire-spread finding when a nearby drought event exists', () => {
    const lookup = (hazardType) => (hazardType === 'drought' ? [{ id: 'drought-1' }] : [])
    const findings = evaluateLateralRisks(quake, lookup)
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('fire-from-quake-drought-heat')
    expect(findings[0].riskId).toBe('fire_spread_potential')
    expect(findings[0].institutionCategories).toContain('fire_department')
  })

  it('produces the fire-spread finding when a nearby heatwave event exists', () => {
    const lookup = (hazardType, subtype) => (hazardType === 'disaster' && subtype === 'heatwave' ? [{ id: 'hw-1' }] : [])
    const findings = evaluateLateralRisks(quake, lookup)
    expect(findings).toHaveLength(1)
    expect(findings[0].matchedConditions).toContain('heatwave')
  })

  it('does not evaluate rules whose triggerTypes do not include the source event type', () => {
    const wildfire = { id: 'fire-1', type: 'wildfire', h3_id: quakeH3Id }
    const lookup = () => [{ id: 'drought-1' }]
    expect(evaluateLateralRisks(wildfire, lookup)).toEqual([])
  })

  it('flood epidemic rule matches on the flood event itself (includeSelf)', () => {
    const flood = { id: 'flood-1', type: 'flood', h3_id: quakeH3Id }
    const lookup = (hazardType) => (hazardType === 'flood' ? [flood] : [])
    const findings = evaluateLateralRisks(flood, lookup)
    expect(findings.some((f) => f.riskId === 'epidemic_risk_potential')).toBe(true)
  })
})

describe('accessRiskFinding', () => {
  it('returns null when no access risk detected', () => {
    expect(accessRiskFinding(false)).toBeNull()
  })

  it('returns a finding referencing the access-risk rule when detected', () => {
    const finding = accessRiskFinding(true)
    expect(finding.riskId).toBe('access_capacity_risk_potential')
    expect(finding.institutionCategories.length).toBeGreaterThan(0)
  })
})

describe('windSpreadAsFinding (FR-005 adapter)', () => {
  it('returns null for a null/empty projection', () => {
    expect(windSpreadAsFinding(null)).toBeNull()
    expect(windSpreadAsFinding({ projectedHexIds: [] })).toBeNull()
  })

  it('adapts a real spread projection without recomputing it', () => {
    const projection = { projectedHexIds: ['a', 'b', 'c'] }
    const finding = windSpreadAsFinding(projection)
    expect(finding.riskId).toBe('wind_spread_potential')
  })

  it('surfaces the real decoded direction/speed as interpolation data (2026-08-19 ask)', () => {
    const projection = { projectedHexIds: ['a'], windCondition: { windDirectionDeg: 271.4, windSpeed: 6.28 } }
    const finding = windSpreadAsFinding(projection)
    expect(finding.data).toEqual({ deg: 271, speed: '6.3' })
  })

  it('data is an empty object when windCondition is missing (never fabricates numbers)', () => {
    const finding = windSpreadAsFinding({ projectedHexIds: ['a'] })
    expect(finding.data).toEqual({})
  })
})

describe('coastalDistanceKm', () => {
  const squareBoundary = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]], // lng,lat pairs
        },
      },
    ],
  }

  it('returns null when there is no boundary geometry', () => {
    expect(coastalDistanceKm(10, 10, null)).toBeNull()
    expect(coastalDistanceKm(10, 10, { features: [] })).toBeNull()
  })

  it('returns ~0 for a point on the boundary itself', () => {
    expect(coastalDistanceKm(0, 0.5, squareBoundary)).toBeCloseTo(0, 0)
  })

  it('returns a larger distance for a point far from any boundary segment', () => {
    const near = coastalDistanceKm(0, 0.5, squareBoundary)
    const far = coastalDistanceKm(20, 20, squareBoundary)
    expect(far).toBeGreaterThan(near)
  })
})

describe('computeTsunamiRiskFinding', () => {
  const quake = { type: 'earthquake', magnitude: 7.2 }

  it('returns null for a non-earthquake event', () => {
    expect(computeTsunamiRiskFinding({ type: 'flood', magnitude: 7.2 }, 5)).toBeNull()
  })

  it('returns null when distance is unknown', () => {
    expect(computeTsunamiRiskFinding(quake, null)).toBeNull()
  })

  it('returns null when far from the coast even at high magnitude', () => {
    expect(computeTsunamiRiskFinding(quake, 500)).toBeNull()
  })

  it('returns null when coastal but below the magnitude threshold', () => {
    expect(computeTsunamiRiskFinding({ type: 'earthquake', magnitude: 4.0 }, 5)).toBeNull()
  })

  it('returns a finding when coastal AND above the magnitude threshold', () => {
    const finding = computeTsunamiRiskFinding(quake, 5)
    expect(finding.riskId).toBe('tsunami_risk_potential')
  })

  it('respects custom thresholds', () => {
    expect(computeTsunamiRiskFinding(quake, 80, { coastalThresholdKm: 100 })).not.toBeNull()
  })
})

describe('LATERAL_RISK_RULES', () => {
  it('is the single source of truth — every rule has a unique id', () => {
    const ids = LATERAL_RISK_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
