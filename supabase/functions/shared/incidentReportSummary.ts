// Pure incident-report summarization (spec 026). Kept separate from the
// DB-touching caller (generate-incident-report/index.ts) so the edge cases —
// a period with no closures must yield null (not a misleading zero) for
// average time-to-close; incidents with no linked CAP alert must be excluded
// from both sides of the false-alarm rate, not silently counted as
// "not a false alarm" — are testable without mocking Supabase.

export interface IncidentRow {
  severity: string
  hazard_type: string
  status: string
  opened_at: string
  closed_at: string | null
  linked_cap_id: string | null
}

export function computeSeverityAndHazardBreakdown(
  incidents: IncidentRow[],
): { by_severity: Record<string, number>; by_hazard_type: Record<string, number> } {
  const by_severity: Record<string, number> = {}
  const by_hazard_type: Record<string, number> = {}

  for (const incident of incidents) {
    by_severity[incident.severity] = (by_severity[incident.severity] ?? 0) + 1
    by_hazard_type[incident.hazard_type] = (by_hazard_type[incident.hazard_type] ?? 0) + 1
  }

  return { by_severity, by_hazard_type }
}

// Only closed/archived incidents with a closed_at timestamp contribute —
// still-open incidents have no finished duration to measure (research.md
// Decision 5). Returns null (not 0) when nothing closed in the period.
export function computeAverageTimeToCloseHours(incidents: IncidentRow[]): number | null {
  const closedDurations: number[] = []

  for (const incident of incidents) {
    if ((incident.status === 'closed' || incident.status === 'archived') && incident.closed_at) {
      const openedMs = new Date(incident.opened_at).getTime()
      const closedMs = new Date(incident.closed_at).getTime()
      closedDurations.push((closedMs - openedMs) / (1000 * 60 * 60))
    }
  }

  if (closedDurations.length === 0) return null
  return closedDurations.reduce((sum, hours) => sum + hours, 0) / closedDurations.length
}

// Only incidents linked to a CAP alert whose status has reached a terminal
// outcome count toward the rate (research.md Decision 4) — an incident with
// no linked_cap_id has no alert outcome to judge, so it is excluded from
// both the numerator and the denominator rather than silently diluting the
// rate as an implicit "not a false alarm".
export function computeFalseAlarmRate(
  incidents: IncidentRow[],
  capDraftStatusByCapId: Record<string, string>,
): number | null {
  let terminalCount = 0
  let falseAlarmCount = 0

  for (const incident of incidents) {
    if (!incident.linked_cap_id) continue
    const status = capDraftStatusByCapId[incident.linked_cap_id]
    if (!status) continue
    terminalCount += 1
    if (status === 'false_alarm') falseAlarmCount += 1
  }

  if (terminalCount === 0) return null
  return falseAlarmCount / terminalCount
}
