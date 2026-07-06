import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { summarizeAuditRows } from './complianceReport.ts'

Deno.test('summarizeAuditRows: empty input returns an empty, valid summary (FR-006)', () => {
  assertEquals(summarizeAuditRows([]), { by_action: {}, by_table: {} })
})

Deno.test('summarizeAuditRows: counts rows by action and table_name', () => {
  const rows = [
    { action: 'INSERT', table_name: 'cap_drafts' },
    { action: 'INSERT', table_name: 'cap_drafts' },
    { action: 'UPDATE', table_name: 'profiles' },
  ]
  assertEquals(summarizeAuditRows(rows), {
    by_action: { INSERT: 2, UPDATE: 1 },
    by_table: { cap_drafts: 2, profiles: 1 },
  })
})

Deno.test('summarizeAuditRows: rows with a null table_name are counted in by_action but excluded from by_table', () => {
  const rows = [
    { action: 'LOGIN', table_name: null },
    { action: 'LOGIN', table_name: null },
    { action: 'INSERT', table_name: 'profiles' },
  ]
  assertEquals(summarizeAuditRows(rows), {
    by_action: { LOGIN: 2, INSERT: 1 },
    by_table: { profiles: 1 },
  })
})

Deno.test('summarizeAuditRows: multiple rows sharing the same action and table aggregate correctly', () => {
  const rows = [
    { action: 'DELETE', table_name: 'contacts' },
    { action: 'DELETE', table_name: 'contacts' },
    { action: 'DELETE', table_name: 'contacts' },
  ]
  assertEquals(summarizeAuditRows(rows), {
    by_action: { DELETE: 3 },
    by_table: { contacts: 3 },
  })
})
