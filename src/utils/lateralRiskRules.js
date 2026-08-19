/**
 * Spec 071 (Çapraz-Afet Risk Çıkarımı ve Öngörü Raporu) — given a selected
 * hazard event, cross-references it against OTHER data already present in
 * the system (drought/heatwave/coldwave/dust_storm hazard proximity,
 * coastal proximity derived from already-loaded country boundaries) to
 * produce heuristic "potential secondary risk" findings. Deliberately rule-
 * based, not a real physics/statistical model — see research.md R1-R3 and
 * spec.md's Assumptions/FR-010 (every finding must carry the "sezgisel
 * öngörü" disclaimer at render time). This generalizes spec 070's
 * "hazard + wind direction = spread" pattern into "hazard + surrounding
 * layers = secondary risk".
 */
import { gridDisk, cellToLatLng } from 'h3-js'

// research.md R1/R3 — the ONE place this rule list lives (Constitution I):
// adding a new secondary-risk rule or hazard type is a one-line addition
// here, nothing else in the codebase needs to change. `nearbyConditions` are
// OR'd together — any one matching (via the caller-supplied
// nearbyEventsLookup) triggers the rule.
export const LATERAL_RISK_RULES = [
  {
    id: 'fire-from-quake-drought-heat',
    triggerTypes: ['earthquake'],
    nearbyConditions: [
      { hazardType: 'drought' },
      { hazardType: 'disaster', subtype: 'heatwave' },
    ],
    riskId: 'fire_spread_potential',
    institutionCategories: ['fire_department', 'disaster_management'],
  },
  {
    id: 'epidemic-from-flood',
    triggerTypes: ['flood'],
    // A flood itself is the condition here — no *additional* nearby layer
    // needed (standing water/sanitation risk follows directly from the
    // flood event itself, per the user's own "sel oldu + zaman geçtikçe
    // salgın riski" example) — modeled as a nearbyCondition matching the
    // trigger event's own type so the SAME lookup mechanism applies
    // uniformly (no special-cased "self-trigger" branch elsewhere).
    nearbyConditions: [{ hazardType: 'flood', includeSelf: true }],
    riskId: 'epidemic_risk_potential',
    institutionCategories: ['health', 'disaster_management'],
  },
  {
    id: 'access-risk-quake-or-flood',
    triggerTypes: ['earthquake', 'flood'],
    // Access/capacity risk (FR-004) is evaluated separately via critical-
    // infrastructure + road-network proximity (research.md R4), not via
    // nearbyEventsLookup — this rule's nearbyConditions are intentionally
    // empty; MapView.vue's T010 helper decides whether to attach this
    // riskId based on that RPC-driven check instead.
    nearbyConditions: [],
    riskId: 'access_capacity_risk_potential',
    institutionCategories: ['disaster_management', 'health'],
  },
]

// research.md R3/R6 defaults — small and fixed for v1 (not user-adjustable
// yet, same posture as spec 070's DEFAULT_HEX_RINGS/DEFAULT_CONE_ANGLE_DEG).
export const DEFAULT_HEX_RINGS = 2
export const DEFAULT_WITHIN_HOURS = 72

/**
 * @param {{ id: string, type: string, h3_id: string }} sourceEvent
 * @param {(hazardType: string, subtype?: string) => Array<{ id: string, type: string, h3_id: string, time?: string }>} nearbyEventsLookup
 *   Caller-supplied (MapView.vue, T008) — given a hazard type/subtype,
 *   returns events already within DEFAULT_HEX_RINGS/DEFAULT_WITHIN_HOURS of
 *   sourceEvent. Injected so this function stays pure/testable, same
 *   DOM-free-core pattern as windDirectionAtPoint.js.
 * @param {{ hexRings?: number, withinHours?: number }} [options]
 * @returns {{ ruleId: string, riskId: string, matchedConditions: string[], institutionCategories: string[] }[]}
 *   Empty when: no h3_id, no rule's triggerTypes match, or no
 *   nearbyCondition matched — NEVER a fabricated finding (FR-003).
 */
export function evaluateLateralRisks(sourceEvent, nearbyEventsLookup, options = {}) {
  if (!sourceEvent?.h3_id || typeof nearbyEventsLookup !== 'function') return []

  const findings = []
  for (const rule of LATERAL_RISK_RULES) {
    if (!rule.triggerTypes.includes(sourceEvent.type)) continue
    if (rule.nearbyConditions.length === 0) continue // access-risk rule: attached separately (see rule comment)

    const matchedConditions = []
    for (const condition of rule.nearbyConditions) {
      const nearby = nearbyEventsLookup(condition.hazardType, condition.subtype) ?? []
      const relevant = condition.includeSelf ? nearby : nearby.filter((e) => e.id !== sourceEvent.id)
      if (relevant.length > 0) matchedConditions.push(condition.subtype ?? condition.hazardType)
    }
    if (matchedConditions.length === 0) continue

    findings.push({
      ruleId: rule.id,
      riskId: rule.riskId,
      matchedConditions,
      institutionCategories: rule.institutionCategories,
    })
  }
  return findings
}

/**
 * research.md R4 — attaches the access/capacity-risk finding when a
 * RPC-driven check (MapView.vue's T010 helper, low road density near
 * critical infrastructure) determined it applies. Kept separate from
 * evaluateLateralRisks() because its input is an RPC result, not a nearby-
 * event lookup — same "adapter, don't duplicate" reasoning as
 * WIND_SPREAD_AS_FINDING below.
 * @param {boolean} accessRiskDetected
 * @returns {ReturnType<typeof evaluateLateralRisks>[number] | null}
 */
export function accessRiskFinding(accessRiskDetected) {
  if (!accessRiskDetected) return null
  const rule = LATERAL_RISK_RULES.find((r) => r.id === 'access-risk-quake-or-flood')
  return {
    ruleId: rule.id,
    riskId: rule.riskId,
    matchedConditions: ['critical_infrastructure_road_density'],
    institutionCategories: rule.institutionCategories,
  }
}

/**
 * FR-005 — adapts spec 070's own SpreadProjection into this feature's
 * SecondaryRiskFinding shape WITHOUT recomputing anything; the wind-spread
 * hex projection itself still comes entirely from windSpreadPrediction.js.
 * `data` carries the real decoded direction/speed (already present on
 * `spreadProjection.windCondition`) so the UI can show the actual numbers
 * instead of a generic "wind is involved" sentence (2026-08-19 ask).
 * @param {{ projectedHexIds: string[], windCondition?: { windDirectionDeg: number, windSpeed: number } } | null} spreadProjection
 * @returns {ReturnType<typeof evaluateLateralRisks>[number] | null}
 */
export function windSpreadAsFinding(spreadProjection) {
  if (!spreadProjection?.projectedHexIds?.length) return null
  const wc = spreadProjection.windCondition
  return {
    ruleId: 'wind-spread-070',
    riskId: 'wind_spread_potential',
    matchedConditions: ['wind_direction'],
    institutionCategories: ['fire_department', 'disaster_management'],
    data: wc ? { deg: Math.round(wc.windDirectionDeg), speed: wc.windSpeed.toFixed(1) } : {},
  }
}

// ── Coastal proximity (research.md R2) — derived entirely from country
// boundary polygons already loaded for the map, NOT a new bathymetry data
// source. Deliberately a rough distance-to-nearest-boundary-segment
// heuristic, not real coastline/bathymetry data. ──────────────────────────

const EARTH_RADIUS_KM = 6371

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Perpendicular (or nearest-endpoint) distance from a point to a lat/lng
// segment, in plain equirectangular-approx degrees first (cheap), then
// converted to km via haversine from the point to the closest point found —
// exact geodesics aren't needed for a "kaba sezgi" threshold check.
function pointToSegmentKm(lat, lng, [lat1, lng1], [lat2, lng2]) {
  const dx = lng2 - lng1
  const dy = lat2 - lat1
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((lng - lng1) * dx + (lat - lat1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const closestLat = lat1 + t * dy
  const closestLng = lng1 + t * dx
  return haversineKm(lat, lng, closestLat, closestLng)
}

function ringMinDistanceKm(lat, lng, ring) {
  let min = Infinity
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[i + 1]
    const d = pointToSegmentKm(lat, lng, [lat1, lng1], [lat2, lng2])
    if (d < min) min = d
  }
  return min
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {GeoJSON.FeatureCollection|null} countryBoundaryFeatures MapView's
 *   already-loaded world-countries GeoJSON.
 * @returns {number|null} rough km distance to the nearest country boundary
 *   segment (a usable proxy for "distance to coast" at this feature's
 *   heuristic resolution — see research.md R2), or null if no geometry.
 */
export function coastalDistanceKm(lat, lng, countryBoundaryFeatures) {
  const features = countryBoundaryFeatures?.features
  if (!Array.isArray(features) || features.length === 0) return null

  let min = Infinity
  for (const feature of features) {
    const geometry = feature?.geometry
    if (!geometry) continue
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
    for (const polygon of polygons) {
      for (const ring of polygon) {
        const d = ringMinDistanceKm(lat, lng, ring)
        if (d < min) min = d
      }
    }
  }
  return Number.isFinite(min) ? min : null
}

const TSUNAMI_COASTAL_THRESHOLD_KM = 50
const TSUNAMI_MAGNITUDE_THRESHOLD = 6.5

/**
 * FR-012 — a coarse geographic heuristic, explicitly NOT a real wave
 * simulation (no bathymetry/wave model involved — see research.md R2).
 * @param {{ type: string, magnitude?: number }} sourceEvent
 * @param {number|null} distanceKm
 * @param {{ coastalThresholdKm?: number, magnitudeThreshold?: number }} [options]
 * @returns {ReturnType<typeof evaluateLateralRisks>[number] | null}
 */
export function computeTsunamiRiskFinding(sourceEvent, distanceKm, options = {}) {
  if (sourceEvent?.type !== 'earthquake') return null
  if (distanceKm == null) return null
  const coastalThresholdKm = options.coastalThresholdKm ?? TSUNAMI_COASTAL_THRESHOLD_KM
  const magnitudeThreshold = options.magnitudeThreshold ?? TSUNAMI_MAGNITUDE_THRESHOLD
  if (distanceKm > coastalThresholdKm) return null
  if ((sourceEvent.magnitude ?? 0) < magnitudeThreshold) return null

  return {
    ruleId: 'tsunami-coastal-quake',
    riskId: 'tsunami_risk_potential',
    matchedConditions: ['coastal_proximity'],
    institutionCategories: ['disaster_management', 'health'],
  }
}

// Re-exported for MapView.vue's nearbyEventsLookup implementation (T008) —
// keeps the h3 proximity math in one place, matching windSpreadPrediction.js's
// own gridDisk usage.
export { gridDisk, cellToLatLng }
