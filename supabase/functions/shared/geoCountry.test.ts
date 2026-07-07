// Parity tests for the Deno port of src/utils/geoCountry.js (spec 036,
// research.md Decision 1) — same bbox data, same smallest-area-wins rule.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveCountryCode } from './geoCountry.ts'

Deno.test('resolveCountryCode: a point clearly inside one country resolves to that country', () => {
  // Ankara, Turkey
  assertEquals(resolveCountryCode(39.92, 32.85), 'tr')
})

Deno.test('resolveCountryCode: bbox overlap resolves to the smallest-area match', () => {
  // Singapore's bbox sits entirely inside Malaysia's and Indonesia's larger
  // bboxes; the smallest-area rule must pick Singapore.
  assertEquals(resolveCountryCode(1.3, 103.82), 'sg')
})

Deno.test('resolveCountryCode: a point matching no country bbox returns null', () => {
  // Gulf of Guinea — open ocean, no country bbox covers this point.
  assertEquals(resolveCountryCode(0, 0), null)
})

Deno.test('resolveCountryCode: non-finite input returns null', () => {
  assertEquals(resolveCountryCode(NaN, 32.85), null)
  assertEquals(resolveCountryCode(39.92, Infinity), null)
})
