// Pure backoff-eligibility helper (spec 031, MHEWS-FR-0119). The auto-retry
// cron job runs every 15 minutes (contracts/dispatch-alert-auto-retry.md),
// so backoff tiers are defined as multiples of that same interval — there is
// no value in a finer-grained timer than the cron's own cadence.

export interface RetriableReceipt {
  status: string
  retry_count: number
  last_attempted_at: string | null
}

export const MAX_AUTO_RETRIES = 4
export const BASE_BACKOFF_MINUTES = 15

export function shouldAutoRetryNow(receipt: RetriableReceipt, now: Date): boolean {
  if (receipt.status !== 'failed') return false
  if (receipt.retry_count >= MAX_AUTO_RETRIES) return false
  if (!receipt.last_attempted_at) return true

  const requiredBackoffMinutes = BASE_BACKOFF_MINUTES * 2 ** receipt.retry_count
  const elapsedMinutes = (now.getTime() - new Date(receipt.last_attempted_at).getTime()) / 60_000
  return elapsedMinutes >= requiredBackoffMinutes
}
