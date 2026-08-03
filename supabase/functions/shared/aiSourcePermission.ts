// Sandboxed AI Assistance (spec 051) — pure permission-gating logic for
// ai-translate/ai-summarize, extracted for unit testing without a live
// Supabase/network call (mirrors createUserAuthorization.ts's pattern).
//
// Design note (research.md Decision 6): the source text is passed directly
// in the request body by a client that already read it under the source
// table's own existing RLS policy — this check exists only to avoid
// wasting AI-provider calls on a role that could never plausibly edit that
// table, NOT to re-derive row-level access. The consequential, persisted
// effect of an approved suggestion (FR-004) is written back to the source
// entity through that entity's OWN existing RLS-protected update path
// (see src/stores/aiAssistance.js docstring) — RLS remains the real
// enforcement boundary for any actual mutation.

const EDITABLE_BY: Record<string, ('super_admin' | 'country_admin')[]> = {
  cap_drafts: ['super_admin', 'country_admin'],
  incidents: ['super_admin', 'country_admin'],
  sop_documents: ['super_admin'], // sop_documents has no country_code — super_admin-only, matches its own RLS
}

export interface AiSourcePermissionCaller {
  role: string
  country_code: string | null
}

export type AiSourcePermissionResult = { ok: true } | { ok: false; reason: string }

export function canRequestAiAssistance(
  sourceTable: string,
  caller: AiSourcePermissionCaller,
  requestCountryCode: string,
): AiSourcePermissionResult {
  const allowedRoles = EDITABLE_BY[sourceTable]
  if (!allowedRoles) {
    return { ok: false, reason: `unsupported source_table: ${sourceTable}` }
  }
  if (!allowedRoles.includes(caller.role as 'super_admin' | 'country_admin')) {
    return { ok: false, reason: 'unauthorized' }
  }
  if (caller.role === 'super_admin') {
    return { ok: true }
  }
  // country_admin: may only request assistance scoped to their own country
  if (caller.country_code !== requestCountryCode) {
    return { ok: false, reason: 'unauthorized' }
  }
  return { ok: true }
}
