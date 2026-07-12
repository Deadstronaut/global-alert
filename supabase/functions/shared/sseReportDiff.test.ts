import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { selectNewerRows } from './sseReportDiff.ts'

const rowA = { id: 'a', updated_at: '2026-07-15T00:00:00.000Z' }
const rowB = { id: 'b', updated_at: '2026-07-15T00:00:05.000Z' }
const rowC = { id: 'c', updated_at: '2026-07-15T00:00:10.000Z' }

Deno.test('selectNewerRows: with no cursor, returns all rows sorted ascending and advances cursor to the latest', () => {
  const result = selectNewerRows([rowC, rowA, rowB], null)
  assertEquals(result.newRows.map((r) => r.id), ['a', 'b', 'c'])
  assertEquals(result.nextCursor, rowC.updated_at)
})

Deno.test('selectNewerRows: only rows strictly newer than the cursor are returned', () => {
  const result = selectNewerRows([rowA, rowB, rowC], rowA.updated_at)
  assertEquals(result.newRows.map((r) => r.id), ['b', 'c'])
  assertEquals(result.nextCursor, rowC.updated_at)
})

Deno.test('selectNewerRows: no new rows leaves the cursor unchanged', () => {
  const result = selectNewerRows([rowA, rowB], rowC.updated_at)
  assertEquals(result.newRows, [])
  assertEquals(result.nextCursor, rowC.updated_at)
})

Deno.test('selectNewerRows: empty input leaves a null cursor null', () => {
  const result = selectNewerRows([], null)
  assertEquals(result.newRows, [])
  assertEquals(result.nextCursor, null)
})
