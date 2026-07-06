// Pure compliance-report summarization (spec 019). Kept separate from the
// DB-touching caller (generate-compliance-report/index.ts) so the edge
// cases — a zero-activity period must still produce a real, empty summary
// rather than being skipped; rows with no table_name must not invent a
// "null" bucket — are testable without mocking Supabase.

export interface AuditLogRow {
  action: string
  table_name: string | null
}

export interface ReportSummary {
  by_action: Record<string, number>
  by_table: Record<string, number>
}

export function summarizeAuditRows(rows: AuditLogRow[]): ReportSummary {
  const by_action: Record<string, number> = {}
  const by_table: Record<string, number> = {}

  for (const row of rows) {
    by_action[row.action] = (by_action[row.action] ?? 0) + 1
    if (row.table_name != null) {
      by_table[row.table_name] = (by_table[row.table_name] ?? 0) + 1
    }
  }

  return { by_action, by_table }
}
