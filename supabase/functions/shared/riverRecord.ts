export interface RiverRecord {
  geometry: { type: 'LineString' | 'MultiLineString'; coordinates: unknown }
  lengthMeters: number
  countryCode: string
  properties: { riverName?: string; strahlerOrder?: number; hybasId: number }
}
