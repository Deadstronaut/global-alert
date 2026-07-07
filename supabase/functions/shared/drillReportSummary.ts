// Pure aggregation helper (spec 032, MHEWS-FR-0033) — structural twin of
// incidentReportSummary.ts. Averages exclude drills with no data (null
// response_time_seconds / no ack_rate) rather than counting them as 0,
// preserving drillMetrics.ts's "no data" vs "genuine zero" distinction at
// the aggregate level too.

export interface DrillForSummary {
  scenario_type: string | null
  summary: { response_time_seconds?: number | null; ack_rate?: { sent: number; acknowledged: number } | null } | null
}

export function computeDrillReportSummary(drills: DrillForSummary[]): {
  total_drills: number
  avg_response_time_seconds: number | null
  avg_ack_rate: number | null
  by_scenario_type: Record<string, number>
} {
  const responseTimes = drills
    .map((d) => d.summary?.response_time_seconds)
    .filter((v): v is number => v != null)

  const ackRates = drills
    .map((d) => d.summary?.ack_rate)
    .filter((v): v is { sent: number; acknowledged: number } => v != null && v.sent > 0)
    .map((v) => v.acknowledged / v.sent)

  const by_scenario_type: Record<string, number> = {}
  for (const d of drills) {
    const key = d.scenario_type ?? 'unknown'
    by_scenario_type[key] = (by_scenario_type[key] ?? 0) + 1
  }

  return {
    total_drills: drills.length,
    avg_response_time_seconds: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null,
    avg_ack_rate: ackRates.length > 0 ? ackRates.reduce((a, b) => a + b, 0) / ackRates.length : null,
    by_scenario_type,
  }
}
