export interface PopulationRasterRecord {
  geometry: { type: 'Polygon'; coordinates: unknown }
  populationCount: number
  countryCode: string
  properties: { h3Cell: string; source: string }
}
