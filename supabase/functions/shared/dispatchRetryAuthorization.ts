// Authorization predicate for retrying a DispatchJob (spec 009, contracts/
// dispatch-alert.md Mode B). Mirrors suspendAuthorization.ts's shape. There
// is no separate "Auditor" role in this system — profiles.role only ever
// contains super_admin/country_admin/org_admin/viewer (spec 007 precedent:
// cross-tenant compliance visibility is a super_admin capability, not a
// fourth role) — so `viewer` is always denied here.

export interface CallerProfile {
  role: string
  country_code: string | null
  org_id: string | null
}

export function canRetryDispatchJob(
  caller: CallerProfile,
  jobCountryCode: string | null,
  jobOrgId: string | null,
): boolean {
  if (caller.role === 'super_admin') return true

  if (caller.role === 'country_admin') {
    return caller.country_code != null && caller.country_code === jobCountryCode
  }

  if (caller.role === 'org_admin') {
    return (
      caller.country_code != null &&
      caller.country_code === jobCountryCode &&
      caller.org_id != null &&
      caller.org_id === jobOrgId
    )
  }

  return false
}
