// Pure transition-validity checks for DispatchJob/DispatchReceipt (spec 009).
// Mirrors the same rules encoded in the guard_dispatch_transition() Postgres
// trigger (20260707120100_dispatch_jobs_and_receipts.sql) so the Edge
// Function and the DB guard agree by construction.

export type DispatchJobStatus = 'queued' | 'running' | 'completed' | 'failed'
export type DispatchReceiptStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced'

const JOB_TRANSITIONS: Record<DispatchJobStatus, DispatchJobStatus[]> = {
  queued: ['running'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
}

const RECEIPT_TRANSITIONS: Record<DispatchReceiptStatus, DispatchReceiptStatus[]> = {
  queued: ['sent', 'failed'],
  sent: ['delivered', 'failed', 'bounced'],
  delivered: [],
  // 'failed'/'bounced' are terminal for the ORIGINAL send attempt, but a
  // retry (spec 009 US3/FR-011) legitimately reopens the same receipt row
  // back to 'queued' rather than creating a duplicate row — retry_count is
  // incremented at that point to distinguish this from the first attempt.
  failed: ['queued'],
  bounced: ['queued'],
}

export function isValidJobTransition(from: DispatchJobStatus, to: DispatchJobStatus): boolean {
  if (from === to) return false
  return JOB_TRANSITIONS[from]?.includes(to) ?? false
}

export function isValidReceiptTransition(from: DispatchReceiptStatus, to: DispatchReceiptStatus): boolean {
  if (from === to) return false
  return RECEIPT_TRANSITIONS[from]?.includes(to) ?? false
}
