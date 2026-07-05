/**
 * Pure hierarchy-scoping logic for create-user, extracted for unit testing
 * without a live Supabase/network call (mirrors suspendAuthorization.ts's
 * pattern — see also gdacsSplit.ts/.test.ts for the codebase convention of
 * testing pure `shared/` logic rather than the `Deno.serve` handler itself).
 */

const ROLES = ['super_admin', 'country_admin', 'org_admin', 'viewer']

export interface CallerScope {
  role: string
  country_code: string | null
  org_id: string | null
}

export interface RequestedAccount {
  role: string
  country_code: string | null
  org_id: string | null
}

export type ResolveCreateUserScopeResult =
  | { ok: true; role: string; country_code: string | null; org_id: string | null }
  | { ok: false; error: string }

/**
 * Mirrors docs/security_roles_protocol.md §2-3:
 *   - super_admin: may create any role, any country_code/org_id as requested
 *   - country_admin: only org_admin/viewer, forced to their OWN country_code
 *   - org_admin: only viewer, forced to their OWN country_code AND org_id
 */
export function resolveCreateUserScope(
  caller: CallerScope,
  requested: RequestedAccount,
): ResolveCreateUserScopeResult {
  if (!ROLES.includes(requested.role)) {
    return { ok: false, error: `role must be one of ${ROLES.join(', ')}` }
  }

  if (caller.role === 'country_admin') {
    if (!['org_admin', 'viewer'].includes(requested.role)) {
      return { ok: false, error: 'country_admin may only create org_admin or viewer accounts' }
    }
    return { ok: true, role: requested.role, country_code: caller.country_code, org_id: requested.org_id ?? null }
  }

  if (caller.role === 'org_admin') {
    if (requested.role !== 'viewer') {
      return { ok: false, error: 'org_admin may only create viewer accounts' }
    }
    return { ok: true, role: requested.role, country_code: caller.country_code, org_id: caller.org_id }
  }

  if (caller.role === 'super_admin') {
    return { ok: true, role: requested.role, country_code: requested.country_code, org_id: requested.org_id ?? null }
  }

  return { ok: false, error: 'Only super_admin, country_admin or org_admin may create accounts' }
}
