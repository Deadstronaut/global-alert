/**
 * Pure structural/WGS84-bounds validation for exposure-dataset GeoJSON
 * uploads (spec 008, research.md §4). Extracted for unit testing without a
 * live Supabase/network call, mirroring createUserAuthorization.ts's pattern.
 */

export interface ValidationResult {
  valid: boolean
  error?: string
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function collectCoordinates(geometry: any, out: number[][]): void {
  if (!geometry || typeof geometry !== 'object') return
  const coords = geometry.coordinates
  if (!coords) return
  const walk = (node: any): void => {
    if (Array.isArray(node) && node.length >= 2 && typeof node[0] === 'number') {
      out.push(node as number[])
    } else if (Array.isArray(node)) {
      node.forEach(walk)
    }
  }
  walk(coords)
}

export function validateGeojson(geojson: any, metricPropertyName: string): ValidationResult {
  if (!geojson || typeof geojson !== 'object') {
    return { valid: false, error: 'invalid_input: not an object' }
  }
  if (geojson.type !== 'FeatureCollection') {
    return { valid: false, error: 'invalid_type: expected a FeatureCollection' }
  }
  if (geojson.crs && JSON.stringify(geojson.crs).indexOf('4326') === -1 && JSON.stringify(geojson.crs).toUpperCase().indexOf('WGS84') === -1) {
    return { valid: false, error: 'invalid_crs: only WGS84 (EPSG:4326) is supported' }
  }
  if (!Array.isArray(geojson.features) || geojson.features.length === 0) {
    return { valid: false, error: 'empty_collection: at least one feature is required' }
  }
  if (!metricPropertyName || typeof metricPropertyName !== 'string') {
    return { valid: false, error: 'missing_metric_property: metricPropertyName is required' }
  }

  for (const feature of geojson.features) {
    if (!feature || typeof feature !== 'object' || feature.type !== 'Feature') {
      return { valid: false, error: 'invalid_feature: every entry must be a Feature' }
    }
    if (!feature.geometry) {
      return { valid: false, error: 'invalid_feature: missing geometry' }
    }
    if (!feature.properties || typeof feature.properties !== 'object') {
      return { valid: false, error: 'invalid_feature: missing properties' }
    }
    const metricValue = feature.properties[metricPropertyName]
    if (!isFiniteNumber(metricValue)) {
      return { valid: false, error: `invalid_metric: property "${metricPropertyName}" is not numeric on every feature` }
    }

    const coords: number[][] = []
    collectCoordinates(feature.geometry, coords)
    if (coords.length === 0) {
      return { valid: false, error: 'invalid_feature: geometry has no coordinates' }
    }
    for (const [lng, lat] of coords) {
      if (!isFiniteNumber(lng) || !isFiniteNumber(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return { valid: false, error: 'out_of_bounds: coordinates must be valid WGS84 longitude/latitude' }
      }
    }
  }

  return { valid: true }
}
