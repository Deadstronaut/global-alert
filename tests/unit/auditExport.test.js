import { describe, it, expect } from 'vitest'
import { rowsToCsv, rowsToJson } from '@/lib/auditExport.js'

describe('rowsToCsv', () => {
  it('returns an empty string for no rows', () => {
    expect(rowsToCsv([])).toBe('')
    expect(rowsToCsv(null)).toBe('')
  })

  it('produces a header row plus one line per row', () => {
    const rows = [
      { action: 'INSERT', table_name: 'profiles', record_id: '1' },
      { action: 'UPDATE', table_name: 'profiles', record_id: '2' },
    ]
    const csv = rowsToCsv(rows)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('action,table_name,record_id')
    expect(lines[1]).toBe('INSERT,profiles,1')
    expect(lines[2]).toBe('UPDATE,profiles,2')
  })

  it('escapes values containing commas, quotes, or newlines', () => {
    const rows = [{ action: 'UPDATE', note: 'has, a comma' }, { action: 'UPDATE', note: 'has "quotes"' }]
    const csv = rowsToCsv(rows)
    expect(csv).toContain('"has, a comma"')
    expect(csv).toContain('"has ""quotes"""')
  })

  it('serializes object/JSONB fields as JSON strings', () => {
    const rows = [{ action: 'UPDATE', new_data: { role: 'viewer' } }]
    const csv = rowsToCsv(rows)
    expect(csv).toContain('{""role"":""viewer""}')
  })
})

describe('rowsToJson', () => {
  it('round-trips row data exactly', () => {
    const rows = [{ id: '1', action: 'INSERT', new_data: { a: 1 } }]
    const json = rowsToJson(rows)
    expect(JSON.parse(json)).toEqual(rows)
  })

  it('handles an empty array without error', () => {
    expect(JSON.parse(rowsToJson([]))).toEqual([])
    expect(JSON.parse(rowsToJson(null))).toEqual([])
  })
})
