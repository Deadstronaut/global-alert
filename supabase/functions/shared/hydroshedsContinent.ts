/**
 * Served country code -> HydroSHEDS continent-file code (spec 041 research.md
 * §1/§5). Data table, not a branch — mirrors iso3166.ts's existing
 * lookup-table convention. HydroSHEDS distributes HydroRIVERS/HydroBASINS as
 * continent-scale files only, not per-country, so this is required to know
 * which continent ZIP to download for a given served country.
 */

export const HYDROSHEDS_CONTINENT_BY_COUNTRY: Record<string, string> = {
  tr: 'eu', // Turkey — HydroSHEDS' "Europe & Middle East" hydrological region
  mg: 'af', // Madagascar — Africa
  my: 'as', // Malaysia — Asia
}

export function hydroshedsContinentForCountry(countryCode: string): string | null {
  return HYDROSHEDS_CONTINENT_BY_COUNTRY[countryCode] ?? null
}
