import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  computeSeverityAndHazardBreakdown,
  computeAverageTimeToCloseHours,
  computeFalseAlarmRate,
} from './incidentReportSummary.ts'

const base = { severity: 'moderate', hazard_type: 'flood', status: 'open', opened_at: '2026-01-01T00:00:00Z', closed_at: null, linked_cap_id: null }

Deno.test('computeSeverityAndHazardBreakdown: empty input returns empty breakdowns', () => {
  assertEquals(computeSeverityAndHazardBreakdown([]), { by_severity: {}, by_hazard_type: {} })
})

Deno.test('computeSeverityAndHazardBreakdown: counts incidents by severity and hazard type', () => {
  const incidents = [
    { ...base, severity: 'high', hazard_type: 'earthquake' },
    { ...base, severity: 'high', hazard_type: 'earthquake' },
    { ...base, severity: 'low', hazard_type: 'flood' },
  ]
  assertEquals(computeSeverityAndHazardBreakdown(incidents), {
    by_severity: { high: 2, low: 1 },
    by_hazard_type: { earthquake: 2, flood: 1 },
  })
})

Deno.test('computeAverageTimeToCloseHours: returns null when no incidents closed in the period', () => {
  const incidents = [
    { ...base, status: 'open' },
    { ...base, status: 'in_progress' },
  ]
  assertEquals(computeAverageTimeToCloseHours(incidents), null)
})

Deno.test('computeAverageTimeToCloseHours: averages only closed/archived incidents with a closed_at', () => {
  const incidents = [
    { ...base, status: 'closed', opened_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T12:00:00Z' }, // 12h
    { ...base, status: 'archived', opened_at: '2026-01-02T00:00:00Z', closed_at: '2026-01-03T00:00:00Z' }, // 24h
    { ...base, status: 'open' }, // excluded — still open
  ]
  assertEquals(computeAverageTimeToCloseHours(incidents), 18)
})

Deno.test('computeFalseAlarmRate: returns null when no incident has a linked, terminal-status CAP alert', () => {
  const incidents = [
    { ...base, linked_cap_id: null },
    { ...base, linked_cap_id: 'cap-1' }, // no matching status in the map below
  ]
  assertEquals(computeFalseAlarmRate(incidents, {}), null)
})

Deno.test('computeFalseAlarmRate: excludes incidents with no linked CAP alert from numerator and denominator', () => {
  const incidents = [
    { ...base, linked_cap_id: null },
    { ...base, linked_cap_id: 'cap-1' },
    { ...base, linked_cap_id: 'cap-2' },
  ]
  const statusByCapId = { 'cap-1': 'false_alarm', 'cap-2': 'broadcast' }
  assertEquals(computeFalseAlarmRate(incidents, statusByCapId), 0.5)
})

Deno.test('computeFalseAlarmRate: all false alarms yields a rate of 1', () => {
  const incidents = [
    { ...base, linked_cap_id: 'cap-1' },
    { ...base, linked_cap_id: 'cap-2' },
  ]
  const statusByCapId = { 'cap-1': 'false_alarm', 'cap-2': 'false_alarm' }
  assertEquals(computeFalseAlarmRate(incidents, statusByCapId), 1)
})
