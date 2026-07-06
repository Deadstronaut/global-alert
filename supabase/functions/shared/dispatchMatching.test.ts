import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { matchesContact, DispatchableContact, DispatchableCapDraft } from './dispatchMatching.ts'

const baseContact: DispatchableContact = {
  is_active: true,
  country_code: 'tr',
  region_code: null,
  hazard_type_filter: null,
  email: 'a@example.com',
  whatsapp_number: '+905551234567',
  email_opt_in: true,
  whatsapp_opt_in: true,
}

const draft: DispatchableCapDraft = {
  country_code: 'tr',
  region_code: null,
  hazard_type: 'earthquake',
}

Deno.test('matches: active, same country, null hazard filter, opted in', () => {
  assertEquals(matchesContact(baseContact, draft, 'email'), true)
})

Deno.test('matches: hazard_type_filter equal to draft.hazard_type', () => {
  assertEquals(matchesContact({ ...baseContact, hazard_type_filter: 'earthquake' }, draft, 'email'), true)
})

Deno.test('no match: wrong country', () => {
  assertEquals(matchesContact({ ...baseContact, country_code: 'my' }, draft, 'email'), false)
})

Deno.test('no match: hazard_type_filter set to a different hazard', () => {
  assertEquals(matchesContact({ ...baseContact, hazard_type_filter: 'flood' }, draft, 'email'), false)
})

Deno.test('no match: inactive contact', () => {
  assertEquals(matchesContact({ ...baseContact, is_active: false }, draft, 'email'), false)
})

Deno.test('no match: email channel but email_opt_in is false', () => {
  assertEquals(matchesContact({ ...baseContact, email_opt_in: false }, draft, 'email'), false)
})

Deno.test('no match: email channel but email is null', () => {
  assertEquals(matchesContact({ ...baseContact, email: null }, draft, 'email'), false)
})

Deno.test('no match: whatsapp channel but whatsapp_opt_in is false', () => {
  assertEquals(matchesContact({ ...baseContact, whatsapp_opt_in: false }, draft, 'whatsapp'), false)
})

Deno.test('no match: draft has no country_code (malformed draft edge case)', () => {
  assertEquals(matchesContact(baseContact, { ...draft, country_code: null }, 'email'), false)
})

// Region-aware matching (spec 015)

Deno.test('region: matches when both contact and draft have no region set', () => {
  assertEquals(matchesContact(baseContact, draft, 'email'), true)
})

Deno.test('region: matches when contact has a region but draft has none (country-wide alert)', () => {
  assertEquals(matchesContact({ ...baseContact, region_code: 'Istanbul' }, draft, 'email'), true)
})

Deno.test('region: matches when draft has a region but contact has none (no region opt-in)', () => {
  assertEquals(matchesContact(baseContact, { ...draft, region_code: 'Istanbul' }, 'email'), true)
})

Deno.test('region: matches on exact region equality', () => {
  assertEquals(
    matchesContact({ ...baseContact, region_code: 'Istanbul' }, { ...draft, region_code: 'Istanbul' }, 'email'),
    true,
  )
})

Deno.test('region: matches case-insensitively and ignores surrounding whitespace', () => {
  assertEquals(
    matchesContact({ ...baseContact, region_code: 'istanbul' }, { ...draft, region_code: ' Istanbul ' }, 'email'),
    true,
  )
})

Deno.test('region: no match on a genuine region mismatch', () => {
  assertEquals(
    matchesContact({ ...baseContact, region_code: 'Ankara' }, { ...draft, region_code: 'Istanbul' }, 'email'),
    false,
  )
})

Deno.test('region: empty string on contact region is treated as unset (always matches)', () => {
  assertEquals(
    matchesContact({ ...baseContact, region_code: '' }, { ...draft, region_code: 'Istanbul' }, 'email'),
    true,
  )
})
