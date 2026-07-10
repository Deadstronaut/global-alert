/**
 * Deterministic, per-hazard-type footprint formulas for hypothetical
 * scenario simulation (spec 039, US3). Mirrors src/lib/hazardBuffer.js's
 * existing strategy-table pattern and reuses its exact earthquake formula
 * (radius_km = 2^magnitude) so a hypothetical scenario and a real event of
 * the same magnitude produce the same footprint (research.md §5).
 *
 * Hazard types with no entry here return { footprint: null,
 * reason: 'no_formula_available' } (FR-010) rather than a fabricated
 * result — other hazard types (cyclone: Holland wind-profile, flood:
 * DEM-based extent) are explicitly deferred, each requiring its own
 * physical-formula research pass before being added (plan.md §5).
 */

export interface EarthquakeScenarioParams {
  magnitude: number
  epicenterLat: number
  epicenterLng: number
}

export interface ScenarioFootprintResult {
  footprint: { type: 'Point'; coordinates: [number, number]; radiusKm: number } | null
  reason?: 'no_formula_available'
  formulaRangeWarning: boolean
}

// Same formula as src/lib/hazardBuffer.js's BUFFER_STRATEGIES.earthquake.
function earthquakeRadiusKm(magnitude: number): number {
  return 2 ** magnitude
}

// Magnitudes outside this range have never been used to validate the
// formula against real event data (research.md §5) — results outside it
// are flagged, not blocked (Edge Cases: still show the estimate, but
// clearly marked as outside the validated range).
const EARTHQUAKE_VALIDATED_MAGNITUDE_RANGE: [number, number] = [0, 9.5]

type FootprintStrategy = (params: Record<string, unknown>) => ScenarioFootprintResult

const FOOTPRINT_STRATEGIES: Record<string, FootprintStrategy> = {
  earthquake: (params) => {
    const { magnitude, epicenterLat, epicenterLng } = params as unknown as EarthquakeScenarioParams
    const radiusKm = earthquakeRadiusKm(Number(magnitude))
    const [min, max] = EARTHQUAKE_VALIDATED_MAGNITUDE_RANGE
    return {
      footprint: {
        type: 'Point',
        coordinates: [Number(epicenterLng), Number(epicenterLat)],
        radiusKm,
      },
      formulaRangeWarning: Number(magnitude) < min || Number(magnitude) > max,
    }
  },
}

export function simulateHazardFootprint(
  hazardType: string,
  params: Record<string, unknown>,
): ScenarioFootprintResult {
  const strategy = FOOTPRINT_STRATEGIES[hazardType]
  if (!strategy) {
    return { footprint: null, reason: 'no_formula_available', formulaRangeWarning: false }
  }
  return strategy(params)
}

export { earthquakeRadiusKm, EARTHQUAKE_VALIDATED_MAGNITUDE_RANGE }
