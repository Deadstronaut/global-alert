import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeDrillReportSummary, DrillForSummary } from './drillReportSummary.ts'

Deno.test('computes totals, averages, and scenario breakdown for a normal mix of drills', () => {
  const drills: DrillForSummary[] = [
    { scenario_type: 'earthquake', summary: { response_time_seconds: 120, ack_rate: { sent: 10, acknowledged: 5 } } },
    { scenario_type: 'earthquake', summary: { response_time_seconds: 180, ack_rate: { sent: 20, acknowledged: 20 } } },
    { scenario_type: 'flood', summary: { response_time_seconds: 300, ack_rate: { sent: 4, acknowledged: 2 } } },
  ]
  const result = computeDrillReportSummary(drills)
  assertEquals(result.total_drills, 3)
  assertEquals(result.avg_response_time_seconds, 200)
  assertEquals(result.avg_ack_rate, (0.5 + 1 + 0.5) / 3)
  assertEquals(result.by_scenario_type, { earthquake: 2, flood: 1 })
})

Deno.test('returns null average response time when no drill has response data', () => {
  const drills: DrillForSummary[] = [
    { scenario_type: 'flood', summary: { response_time_seconds: null, ack_rate: null } },
  ]
  assertEquals(computeDrillReportSummary(drills).avg_response_time_seconds, null)
})

Deno.test('returns null average ack rate when no drill has ack data', () => {
  const drills: DrillForSummary[] = [
    { scenario_type: 'flood', summary: { response_time_seconds: 60, ack_rate: null } },
  ]
  assertEquals(computeDrillReportSummary(drills).avg_ack_rate, null)
})

Deno.test('excludes drills with no data from averages instead of counting them as zero', () => {
  const drills: DrillForSummary[] = [
    { scenario_type: 'earthquake', summary: { response_time_seconds: 100, ack_rate: { sent: 10, acknowledged: 10 } } },
    { scenario_type: 'earthquake', summary: { response_time_seconds: null, ack_rate: null } },
  ]
  const result = computeDrillReportSummary(drills)
  assertEquals(result.avg_response_time_seconds, 100)
  assertEquals(result.avg_ack_rate, 1)
})

Deno.test('groups drills with a null scenario_type under "unknown"', () => {
  const drills: DrillForSummary[] = [
    { scenario_type: null, summary: null },
    { scenario_type: 'flood', summary: null },
  ]
  assertEquals(computeDrillReportSummary(drills).by_scenario_type, { unknown: 1, flood: 1 })
})

Deno.test('returns zeroed/null summary for an empty list', () => {
  const result = computeDrillReportSummary([])
  assertEquals(result.total_drills, 0)
  assertEquals(result.avg_response_time_seconds, null)
  assertEquals(result.avg_ack_rate, null)
  assertEquals(result.by_scenario_type, {})
})
