/**
 * Spatial clip of continent-scale HydroSHEDS features to a single served
 * country's boundary (spec 041 research.md §4). Pure — no I/O — takes
 * already-parsed features and an already-fetched boundary; the caller is
 * responsible for downloading/parsing/fetching both.
 *
 * Two-stage filter: a cheap bounding-box overlap pre-filter discards the
 * vast majority of a continent's features before the more expensive precise
 * intersects check ever runs — important given a continent file may contain
 * orders of magnitude more features than a single country needs.
 */

// deno-lint-ignore no-explicit-any
type GeoJSONFeature = any
// deno-lint-ignore no-explicit-any
type GeoJSONGeometry = any

import bbox from 'https://esm.sh/@turf/bbox@7'
import booleanIntersects from 'https://esm.sh/@turf/boolean-intersects@7'

function bboxesOverlap(a: number[], b: number[]): boolean {
  const [aMinX, aMinY, aMaxX, aMaxY] = a
  const [bMinX, bMinY, bMaxX, bMaxY] = b
  return aMinX <= bMaxX && aMaxX >= bMinX && aMinY <= bMaxY && aMaxY >= bMinY
}

export function clipToCountryBoundary(
  features: GeoJSONFeature[],
  countryBoundary: GeoJSONGeometry,
): GeoJSONFeature[] {
  if (!features || features.length === 0) return []

  const boundaryBbox = bbox(countryBoundary)
  const boundaryFeature = { type: 'Feature' as const, properties: {}, geometry: countryBoundary }

  const kept: GeoJSONFeature[] = []
  for (const feature of features) {
    if (!feature?.geometry) continue
    let featureBbox: number[]
    try {
      featureBbox = bbox(feature)
    } catch {
      continue // unparseable/degenerate geometry — not this module's job to validate, just skip
    }
    if (!bboxesOverlap(featureBbox, boundaryBbox)) continue

    try {
      if (booleanIntersects(feature, boundaryFeature)) {
        kept.push(feature)
      }
    } catch {
      // A precise-intersects failure on a genuinely malformed geometry
      // shouldn't abort the whole clip — skip this one feature.
      continue
    }
  }
  return kept
}
