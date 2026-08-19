/**
 * Spec 070 (Rüzgar Yönüne Dayalı Yayılım Tahmini) — given a wind-affected
 * hazard event and the wind condition at its own hex (from
 * windDirectionAtPoint.js), projects a small "olası etki alanı" (possible
 * impact area) into the neighboring hexes that lie in the wind's downwind
 * direction. Deliberately a simple neighbor/cone heuristic, not a real
 * fire-physics simulation — see research.md R5 and spec.md's Assumptions.
 */
import { gridDisk, cellToLatLng } from 'h3-js'
import { uvToCompassBearingDeg } from './windDirectionAtPoint.js'

// research.md R4 / data-model.md — the ONE place this list lives (Constitution
// I: hazard types are data, not structural branches — adding a new wind-
// affected type is a one-line addition here, nothing else in the codebase
// needs to change). Deliberately excludes tsunami (wave physics, not wind)
// and every other hazard type with no wind-driven point-source spread
// concept (earthquake, flood, drought, food_security, epidemic,
// heatwave/coldwave) — see spec.md Assumptions for the full rationale.
export const WIND_AFFECTED_HAZARD_TYPES = new Set(['wildfire', 'dust_storm', 'volcano', 'cyclone'])

// Below this speed, "downwind direction" isn't a meaningful signal — near-
// calm air doesn't push a fire/dust cloud in any one direction reliably.
// Same order of magnitude as the "low" end of WIND_SPEED_RAMP in
// windLayerData.js, not a formally derived meteorological threshold.
const CALM_WIND_THRESHOLD_MS = 1

// research.md R5 defaults — small and fixed for v1 (spec Assumptions: not
// user-adjustable yet).
const DEFAULT_HEX_RINGS = 2
const DEFAULT_CONE_ANGLE_DEG = 45

function angleDiffDeg(a, b) {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

/**
 * @param {{ id: string, type: string, h3_id: string }} sourceEvent
 * @param {{ windSpeed: number, windDirectionDeg: number, issuedAt: string } | null} windCondition
 * @param {{ hexRings?: number, coneAngleDeg?: number }} [options]
 * @returns {{
 *   sourceEventId: string,
 *   sourceHazardType: string,
 *   sourceH3Id: string,
 *   windCondition: object,
 *   projectedHexIds: string[],
 * } | null}
 *   null when: the hazard type isn't wind-affected (FR-009), windCondition
 *   is missing, or wind speed is below the calm threshold (FR-005) — never
 *   a fabricated direction.
 */
export function computeSpreadProjection(sourceEvent, windCondition, options = {}) {
  if (!sourceEvent?.h3_id || !WIND_AFFECTED_HAZARD_TYPES.has(sourceEvent.type)) return null
  if (!windCondition || windCondition.windSpeed < CALM_WIND_THRESHOLD_MS) return null

  const hexRings = options.hexRings ?? DEFAULT_HEX_RINGS
  const coneAngleDeg = options.coneAngleDeg ?? DEFAULT_CONE_ANGLE_DEG

  const [sourceLat, sourceLng] = cellToLatLng(sourceEvent.h3_id)
  const candidates = gridDisk(sourceEvent.h3_id, hexRings).filter((h3Id) => h3Id !== sourceEvent.h3_id)

  const projectedHexIds = candidates.filter((h3Id) => {
    const [lat, lng] = cellToLatLng(h3Id)
    // Same eastward/northward-component-to-compass-bearing math
    // windDirectionAtPoint.js uses for u/v — here dx/dy stand in for u/v,
    // scaled by cos(lat) so a degree of longitude near the poles doesn't
    // read as "further" than a degree of latitude (fine at this hex-scale
    // "basit sezgisel" resolution, not meant to be geodesically exact).
    const dx = (lng - sourceLng) * Math.cos((sourceLat * Math.PI) / 180)
    const dy = lat - sourceLat
    const bearingToNeighbor = uvToCompassBearingDeg(dx, dy)
    return angleDiffDeg(bearingToNeighbor, windCondition.windDirectionDeg) <= coneAngleDeg
  })

  return {
    sourceEventId: sourceEvent.id,
    sourceHazardType: sourceEvent.type,
    sourceH3Id: sourceEvent.h3_id,
    windCondition,
    projectedHexIds,
  }
}

const EARTH_RADIUS_KM = 6371

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Spec 070 (US3/T014) — a single covering-radius number (km) around the
// source event that the existing ImpactPanel.vue radiusOverride mechanism
// (a plain manual km input, spec 050) already understands directly. No new
// bbox/hex-aware query path — this is the ONLY bridge between a
// SpreadProjection and Impact Analysis (Constitution VIII: reuse existing
// analysis machinery, don't build a parallel one).
export function computeCoveringRadiusKm(projection) {
  if (!projection?.projectedHexIds?.length) return null
  const [sourceLat, sourceLng] = cellToLatLng(projection.sourceH3Id)
  let maxKm = 0
  for (const h3Id of projection.projectedHexIds) {
    const [lat, lng] = cellToLatLng(h3Id)
    maxKm = Math.max(maxKm, haversineKm(sourceLat, sourceLng, lat, lng))
  }
  // Small margin so the override radius covers the far hex's own footprint,
  // not just its centroid point.
  return Math.ceil(maxKm + 2)
}
