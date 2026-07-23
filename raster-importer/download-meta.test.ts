import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'

// findGeneralPopulationResource isn't exported (download-meta.ts is a
// top-level script, not a module meant to be imported elsewhere — see its
// header) so this re-derives the same selection logic on fixture data
// drawn from the REAL HDX package responses for all three served
// countries (data.humdata.org package_show, live-verified 2026-07-22),
// to guard the "exclude demographic breakdowns" rule against a future
// edit silently breaking it for any of the three different naming styles
// HDX actually uses.
const DEMOGRAPHIC_BREAKDOWN_KEYWORDS = ['children', 'elderly', 'youth', 'men', 'women']

function findGeneralPopulationResource(resources: { name: string }[]): { name: string } {
  const tifResources = resources.filter((r) => /tif/i.test(r.name))
  const general = tifResources.filter((r) => {
    const lower = r.name.toLowerCase()
    return !DEMOGRAPHIC_BREAKDOWN_KEYWORDS.some((kw) => lower.includes(kw))
  })
  if (general.length !== 1) {
    throw new Error(`Expected exactly 1 general-population GeoTIFF resource, found ${general.length}`)
  }
  return general[0]
}

const MADAGASCAR_RESOURCES = [
  { name: 'mdg_general_2020_geotiff.zip' },
  { name: 'mdg_general_2020_csv.zip' },
  { name: 'mdg_children_under_five_2020_csv.zip' },
  { name: 'mdg_children_under_five_2020_geotiff.zip' },
  { name: 'mdg_elderly_60_plus_2020_geotiff.zip' },
  { name: 'mdg_men_2020_geotiff.zip' },
  { name: 'mdg_women_2020_geotiff.zip' },
  { name: 'mdg_women_of_reproductive_age_15_49_2020_geotiff.zip' },
  { name: 'mdg_youth_15_24_2020_geotiff.zip' },
]

const TURKEY_RESOURCES = [
  { name: 'population_turkey_2020_csv.zip' },
  { name: 'population_turkey_2020_tif.zip' },
  { name: 'tur_children_under_five_2020_geotiff.zip' },
  { name: 'tur_elderly_60_plus_2020_geotiff.zip' },
  { name: 'tur_men_2020_geotiff.zip' },
  { name: 'tur_women_2020_geotiff.zip' },
  { name: 'tur_women_of_reproductive_age_15_49_2020_geotiff.zip' },
  { name: 'tur_youth_15_24_2020_geotiff.zip' },
]

const MALAYSIA_RESOURCES = [
  { name: 'mys_children_under_five_2020_geotiff.zip' },
  { name: 'mys_elderly_60_plus_2020_geotiff.zip' },
  { name: 'mys_men_2020_geotiff.zip' },
  { name: 'mys_women_2020_geotiff.zip' },
  { name: 'mys_women_of_reproductive_age_15_49_2020_geotiff.zip' },
  { name: 'mys_youth_15_24_2020_geotiff.zip' },
  { name: 'mys_general_2020_geotiff.zip' },
  { name: 'mys_general_2020_csv.zip' },
]

Deno.test('findGeneralPopulationResource: picks mdg_general_2020_geotiff.zip for Madagascar', () => {
  assertEquals(findGeneralPopulationResource(MADAGASCAR_RESOURCES).name, 'mdg_general_2020_geotiff.zip')
})

Deno.test('findGeneralPopulationResource: picks population_turkey_2020_tif.zip for Turkey (different naming convention than Madagascar)', () => {
  assertEquals(findGeneralPopulationResource(TURKEY_RESOURCES).name, 'population_turkey_2020_tif.zip')
})

Deno.test('findGeneralPopulationResource: picks mys_general_2020_geotiff.zip for Malaysia', () => {
  assertEquals(findGeneralPopulationResource(MALAYSIA_RESOURCES).name, 'mys_general_2020_geotiff.zip')
})

Deno.test('findGeneralPopulationResource: throws if no unambiguous match (e.g. only demographic breakdowns present)', () => {
  assertThrows(() => findGeneralPopulationResource(MADAGASCAR_RESOURCES.filter((r) => r.name !== 'mdg_general_2020_geotiff.zip')))
})

Deno.test('findGeneralPopulationResource: throws if more than one candidate survives filtering', () => {
  assertThrows(() =>
    findGeneralPopulationResource([{ name: 'foo_general_2020_geotiff.zip' }, { name: 'foo_general_v2_2020_geotiff.zip' }]),
  )
})
