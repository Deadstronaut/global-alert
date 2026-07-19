export interface BasinRecord {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  areaKm2: number
  countryCode: string
  properties: { hybasId: number; pfafId: number }
}
