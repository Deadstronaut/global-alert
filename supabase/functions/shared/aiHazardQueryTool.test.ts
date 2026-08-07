import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveHazardQuery } from './aiHazardQueryTool.ts'

const NOW = new Date('2026-08-05T00:00:00Z')

Deno.test('resolveHazardQuery: rejects an unknown/missing hazard_type', () => {
  const result = resolveHazardQuery({}, NOW)
  assertEquals(result.ok, false)

  const result2 = resolveHazardQuery({ hazard_type: 'tsunami' }, NOW)
  assertEquals(result2.ok, false)
})

Deno.test('resolveHazardQuery: resolves a known hazard_type to its table', () => {
  const result = resolveHazardQuery({ hazard_type: 'earthquake' }, NOW)
  assertEquals(result.ok, true)
  if (result.ok) assertEquals(result.table, 'earthquake')
})

Deno.test('resolveHazardQuery: normalizes country_code to lowercase 2-letter', () => {
  const result = resolveHazardQuery({ hazard_type: 'flood', country_code: 'TR' }, NOW)
  assertEquals(result.ok, true)
  if (result.ok) assertEquals(result.countryCode, 'tr')
})

Deno.test('resolveHazardQuery: omitted country_code stays null (search all countries)', () => {
  const result = resolveHazardQuery({ hazard_type: 'flood' }, NOW)
  assertEquals(result.ok, true)
  if (result.ok) assertEquals(result.countryCode, null)
})

Deno.test('resolveHazardQuery: default days is 14 when omitted', () => {
  const result = resolveHazardQuery({ hazard_type: 'wildfire' }, NOW)
  assertEquals(result.ok, true)
  if (result.ok) assertEquals(result.sinceIso, new Date(NOW.getTime() - 14 * 86400000).toISOString())
})

Deno.test('resolveHazardQuery: days is clamped to the 1-90 range', () => {
  const tooMany = resolveHazardQuery({ hazard_type: 'drought', days: 500 }, NOW)
  if (tooMany.ok) assertEquals(tooMany.sinceIso, new Date(NOW.getTime() - 90 * 86400000).toISOString())

  const tooFew = resolveHazardQuery({ hazard_type: 'drought', days: 0 }, NOW)
  if (tooFew.ok) assertEquals(tooFew.sinceIso, new Date(NOW.getTime() - 1 * 86400000).toISOString())
})

Deno.test('resolveHazardQuery: accepts a numeric string for days (model sometimes sends strings)', () => {
  const result = resolveHazardQuery({ hazard_type: 'earthquake', days: '30' }, NOW)
  assertEquals(result.ok, true)
  if (result.ok) assertEquals(result.sinceIso, new Date(NOW.getTime() - 30 * 86400000).toISOString())
})
