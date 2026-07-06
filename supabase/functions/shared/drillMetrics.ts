// Pure drill-summary metrics (spec 017). Kept separate from the DB-touching
// caller (AdminView.vue's endDrill()) so the edge cases — "no response"
// must never render as 0, "nothing sent" must never render as 0% — are
// testable without mocking Supabase.

export function computeResponseTimeSeconds(startedAt: string, firstAlertAt: string | null): number | null {
  if (firstAlertAt == null) return null
  const seconds = Math.round((new Date(firstAlertAt).getTime() - new Date(startedAt).getTime()) / 1000)
  return Math.max(0, seconds)
}

export interface AckRate {
  sent: number
  acknowledged: number
}

export function computeAckRate(sent: number, acknowledged: number): AckRate | null {
  if (sent === 0) return null
  return { sent, acknowledged }
}
