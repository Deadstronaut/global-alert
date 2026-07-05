/**
 * Pure hierarchy-check logic for suspend-user (spec 004, gap 3), extracted so
 * it can be unit-tested without a live Supabase/network call (mirrors this
 * codebase's existing pattern of testing pure `shared/` helpers rather than
 * the Deno.serve handler itself — see gdacsSplit.ts/.test.ts).
 */

export interface ProfileScope {
  id: string
  role: string
  country_code: string | null
  org_id: string | null
}

export interface AuthorizationResult {
  allowed: boolean
  error?: string
}

/**
 * Mirrors create-user's hierarchy enforcement (docs/security_roles_protocol.md §2-3):
 *   - super_admin: may target anyone except themself
 *   - country_admin: only org_admin/viewer accounts in their own country_code
 *   - org_admin: only viewer accounts in their own country_code AND org_id
 */
export function checkSuspendAuthorization(caller: ProfileScope, target: ProfileScope): AuthorizationResult {
  if (!['super_admin', 'country_admin', 'org_admin'].includes(caller.role)) {
    return { allowed: false, error: 'Only super_admin, country_admin or org_admin may suspend/reactivate accounts' }
  }

  if (target.id === caller.id) {
    return { allowed: false, error: 'You cannot suspend or reactivate your own account' }
  }

  if (caller.role === 'country_admin') {
    if (!['org_admin', 'viewer'].includes(target.role) || target.country_code !== caller.country_code) {
      return { allowed: false, error: 'country_admin may only suspend org_admin/viewer accounts in their own country' }
    }
  } else if (caller.role === 'org_admin') {
    if (
      target.role !== 'viewer' ||
      target.country_code !== caller.country_code ||
      target.org_id !== caller.org_id
    ) {
      return { allowed: false, error: 'org_admin may only suspend viewer accounts in their own organization' }
    }
  }
  // super_admin: no additional scope restriction beyond the self-targeting check above.

  return { allowed: true }
}
