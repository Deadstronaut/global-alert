import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { ISO2_TO_ISO3, iso2ToIso3Lower, iso3ToIso2 } from './iso3166.ts'

Deno.test('iso2ToIso3Lower: known countries relevant to this project', () => {
  assertEquals(iso2ToIso3Lower('TR'), 'tur')
  assertEquals(iso2ToIso3Lower('MY'), 'mys')
  assertEquals(iso2ToIso3Lower('MG'), 'mdg')
  assertEquals(iso2ToIso3Lower('tr'), 'tur') // case-insensitive input
})

Deno.test('iso3ToIso2: known countries relevant to this project', () => {
  assertEquals(iso3ToIso2('tur'), 'TR')
  assertEquals(iso3ToIso2('mys'), 'MY')
  assertEquals(iso3ToIso2('mdg'), 'MG')
  assertEquals(iso3ToIso2('TUR'), 'TR') // case-insensitive input
})

Deno.test('iso2ToIso3Lower: unknown code returns null, does not guess', () => {
  assertEquals(iso2ToIso3Lower('ZZ'), null)
})

Deno.test('iso3ToIso2: unknown code returns null, does not guess', () => {
  assertEquals(iso3ToIso2('ZZZ'), null)
})

Deno.test('ISO2_TO_ISO3: every entry round-trips through iso3ToIso2', () => {
  for (const [iso2, iso3] of Object.entries(ISO2_TO_ISO3)) {
    assertEquals(iso3ToIso2(iso3), iso2, `round-trip failed for ${iso2}/${iso3}`)
  }
})

Deno.test('ISO2_TO_ISO3: no duplicate ISO3 values (would break the reverse map)', () => {
  const iso3Values = Object.values(ISO2_TO_ISO3)
  const uniqueIso3Values = new Set(iso3Values)
  assertEquals(iso3Values.length, uniqueIso3Values.size)
})
