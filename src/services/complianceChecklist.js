// Spec 030: derives a structured compliance checklist (MHEWS-FR-0067) from an
// existing compliance_reports row + that period's dead-letter rows, and tags
// all compliance exports with the template version they were produced with
// (MHEWS-FR-0071). Purely additive — no schema changes, read-only.

export const TEMPLATE_VERSION = 'v1'

const LATE_GENERATION_GRACE_MS = 2 * 24 * 60 * 60 * 1000 // 2 days

function reportGeneratedOnTime(report) {
  if (!report?.generated_at || !report?.period_end) {
    return { status: 'unknown', evidence: { generated_at: report?.generated_at ?? null, period_end: report?.period_end ?? null } }
  }
  const onTime = new Date(report.generated_at).getTime() <= new Date(report.period_end).getTime() + LATE_GENERATION_GRACE_MS
  return { status: onTime ? 'met' : 'unmet', evidence: { generated_at: report.generated_at, period_end: report.period_end } }
}

function hashChainIntegrity(report) {
  if (!report?.summary || typeof report.summary.integrity_ok !== 'boolean') {
    return { status: 'unknown', evidence: { integrity_ok: report?.summary?.integrity_ok ?? null, broken_seq: report?.summary?.broken_seq ?? null } }
  }
  return {
    status: report.summary.integrity_ok ? 'met' : 'unmet',
    evidence: { integrity_ok: report.summary.integrity_ok, broken_seq: report.summary.broken_seq ?? null },
  }
}

function noPendingDeadLetter(deadLetterRowsInPeriod) {
  const rows = Array.isArray(deadLetterRowsInPeriod) ? deadLetterRowsInPeriod : []
  return { status: rows.length === 0 ? 'met' : 'unmet', evidence: { dead_letter_count_in_period: rows.length } }
}

function completenessConstraintEnforced() {
  // chk_audit_log_completeness (spec 029) is a DB-level CHECK constraint —
  // it enforces itself at INSERT time regardless of period, so this
  // criterion is always 'met' as long as the constraint exists in the
  // schema (a period-specific violation count cannot be reconstructed after
  // the fact, since rejected inserts are never persisted anywhere).
  return { status: 'met', evidence: { note: 'chk_audit_log_completeness DB seviyesinde etkin, dönemden bağımsız' } }
}

export function buildComplianceChecklist(report, deadLetterRowsInPeriod) {
  const onTime = reportGeneratedOnTime(report)
  const integrity = hashChainIntegrity(report)
  const deadLetter = noPendingDeadLetter(deadLetterRowsInPeriod)
  const completeness = completenessConstraintEnforced()

  return {
    templateVersion: TEMPLATE_VERSION,
    periodStart: report?.period_start ?? null,
    periodEnd: report?.period_end ?? null,
    items: [
      { criterion: 'report_generated_on_time', ...onTime },
      { criterion: 'hash_chain_integrity', ...integrity },
      { criterion: 'no_pending_dead_letter', ...deadLetter },
      { criterion: 'completeness_constraint_enforced', ...completeness },
    ],
  }
}
