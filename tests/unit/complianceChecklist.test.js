import { describe, it, expect } from 'vitest'
import { buildComplianceChecklist, TEMPLATE_VERSION } from '@/services/complianceChecklist.js'

function makeReport(overrides = {}) {
  return {
    period_start: '2026-06-29T00:00:00.000Z',
    period_end: '2026-07-06T00:00:00.000Z',
    generated_at: '2026-07-06T00:05:00.000Z',
    summary: { integrity_ok: true, broken_seq: null, by_action: {}, by_table: {} },
    ...overrides,
  }
}

describe('buildComplianceChecklist', () => {
  it('marks all criteria as met for a normal, healthy report', () => {
    const result = buildComplianceChecklist(makeReport(), [])
    expect(result.templateVersion).toBe(TEMPLATE_VERSION)
    expect(result.items).toHaveLength(4)
    expect(result.items.every((item) => item.status === 'met')).toBe(true)
  })

  it('marks hash_chain_integrity as unmet when integrity_ok is false', () => {
    const report = makeReport({ summary: { integrity_ok: false, broken_seq: 42, by_action: {}, by_table: {} } })
    const result = buildComplianceChecklist(report, [])
    const item = result.items.find((i) => i.criterion === 'hash_chain_integrity')
    expect(item.status).toBe('unmet')
    expect(item.evidence.broken_seq).toBe(42)
  })

  it('marks no_pending_dead_letter as unmet when dead-letter rows exist in period', () => {
    const result = buildComplianceChecklist(makeReport(), [{ id: '1', failed_at: '2026-07-01T00:00:00.000Z' }])
    const item = result.items.find((i) => i.criterion === 'no_pending_dead_letter')
    expect(item.status).toBe('unmet')
    expect(item.evidence.dead_letter_count_in_period).toBe(1)
  })

  it('marks report_generated_on_time as unmet when generated_at is far after period_end', () => {
    const report = makeReport({ generated_at: '2026-07-15T00:00:00.000Z' })
    const result = buildComplianceChecklist(report, [])
    const item = result.items.find((i) => i.criterion === 'report_generated_on_time')
    expect(item.status).toBe('unmet')
  })

  it('marks affected criteria as unknown instead of throwing when report.summary is missing', () => {
    const report = { period_start: '2026-06-29T00:00:00.000Z', period_end: '2026-07-06T00:00:00.000Z', generated_at: null, summary: null }
    expect(() => buildComplianceChecklist(report, [])).not.toThrow()
    const result = buildComplianceChecklist(report, [])
    expect(result.items.find((i) => i.criterion === 'hash_chain_integrity').status).toBe('unknown')
    expect(result.items.find((i) => i.criterion === 'report_generated_on_time').status).toBe('unknown')
  })

  it('always marks completeness_constraint_enforced as met (schema-level, period-independent)', () => {
    const result = buildComplianceChecklist(makeReport(), [])
    expect(result.items.find((i) => i.criterion === 'completeness_constraint_enforced').status).toBe('met')
  })
})
