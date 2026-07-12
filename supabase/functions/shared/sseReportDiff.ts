// Pure diffing logic for the live SSE community-report notification stream
// (spec 036 remaining item — "canlı SSE bildirim akışı"). Kept separate from
// the DB-polling/streaming Edge Function so the cursor-advancement logic —
// only rows strictly newer than the last-seen cursor are emitted, and the
// cursor only ever moves forward — is testable without a live connection.

export interface CursoredRow {
  id: string
  updated_at: string
}

export interface DiffResult<T extends CursoredRow> {
  newRows: T[]
  nextCursor: string | null
}

export function selectNewerRows<T extends CursoredRow>(rows: T[], sinceCursor: string | null): DiffResult<T> {
  const sinceMs = sinceCursor ? new Date(sinceCursor).getTime() : -Infinity
  const newer = rows.filter((r) => new Date(r.updated_at).getTime() > sinceMs)
  const sorted = [...newer].sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
  const nextCursor = sorted.length > 0 ? sorted[sorted.length - 1].updated_at : sinceCursor
  return { newRows: sorted, nextCursor }
}
