import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { selectHdxMatch } from './resolveHdxCountryDataset.ts'

Deno.test('selectHdxMatch: single unambiguous match is accepted', () => {
  const result = selectHdxMatch([{ id: 'abc-123', title: 'Türkiye: Population Density' }])
  assertEquals(result, { datasetId: 'abc-123', title: 'Türkiye: Population Density' })
})

Deno.test('selectHdxMatch: zero matches returns null, does not guess', () => {
  const result = selectHdxMatch([])
  assertEquals(result, null)
})

Deno.test('selectHdxMatch: multiple ambiguous matches returns null, does not guess', () => {
  const result = selectHdxMatch([
    { id: 'abc-123', title: 'Türkiye: Population Density' },
    { id: 'def-456', title: 'Türkiye: Administrative Division with Aggregated Population' },
  ])
  assertEquals(result, null)
})
