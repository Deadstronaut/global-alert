/**
 * Shared transient shape for critical-facility building records, produced
 * in-memory by osmBuildingsFetch.ts before validation and storage.
 *
 * Scoped to critical facilities (hospitals, schools, emergency services),
 * not every building footprint — see osmBuildingsFetch.ts's HIGHWAY_FILTER-
 * style comment for why "every OSM building" was rejected as an import
 * scope (same WORKER_RESOURCE_LIMIT risk osmRoadsFetch.ts already hit and
 * documented, at a much larger scale: buildings outnumber roads by 1-2
 * orders of magnitude in a typical OSM extract).
 */
export interface BuildingRecord {
  // OSM ways (closed, with a footprint) come through as Polygon; bare nodes
  // (a POI with no traced footprint — common for amenity=hospital in
  // less-mapped areas) come through as Point.
  geometry: { type: 'Polygon' | 'Point'; coordinates: unknown }
  countryCode: string
  assetCategory: 'critical_infrastructure_health' | 'critical_infrastructure_education' | 'critical_infrastructure_emergency'
  properties: { facilityType: string; name?: string; osmId: number; osmType: 'node' | 'way' }
}
