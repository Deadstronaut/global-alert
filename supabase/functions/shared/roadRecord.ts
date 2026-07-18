/**
 * Shared transient shape for road-segment records, produced in-memory by
 * osmRoadsFetch.ts before validation and storage. See spec 040 data-model.md.
 */
export interface RoadRecord {
  geometry: { type: 'LineString' | 'MultiLineString'; coordinates: unknown }
  lengthMeters: number
  countryCode: string
  properties: { highway: string; name?: string; osmId: number }
}
