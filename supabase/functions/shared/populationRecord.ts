/**
 * Shared transient shape for population records, produced in-memory by each
 * source's fetch module (konturFetch.ts, ghslFetch.ts, metaHdxFetch.ts)
 * before validation and storage. See spec 038 data-model.md.
 */
export interface PopulationRecord {
  geometry: { type: 'Point' | 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  population: number
  countryCode: string
  properties: Record<string, unknown>
}
