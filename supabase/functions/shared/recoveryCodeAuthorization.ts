/**
 * Pure eligibility check for verify-recovery-code (spec 005, US3), extracted
 * for unit testing without a live Supabase/network call (mirrors spec 004's
 * suspendAuthorization.ts / createUserAuthorization.ts pattern).
 */

export interface RecoveryCodeCaller {
  is_active: boolean
}

export type RecoveryCodeEligibility =
  | { allowed: true }
  | { allowed: false; error: string }

/**
 * A suspended account (spec 004) must not be able to use a recovery code to
 * regain access, regardless of whether the code itself is valid (spec 005 FR-010).
 */
export function checkRecoveryCodeEligibility(caller: RecoveryCodeCaller): RecoveryCodeEligibility {
  if (!caller.is_active) {
    return { allowed: false, error: 'Account suspended' }
  }
  return { allowed: true }
}
