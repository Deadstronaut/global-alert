import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveCreateUserScope, type CallerScope, type RequestedAccount } from './createUserAuthorization.ts'

function caller(overrides: Partial<CallerScope>): CallerScope {
  return { role: 'viewer', country_code: null, org_id: null, ...overrides }
}
function requested(overrides: Partial<RequestedAccount>): RequestedAccount {
  return { role: 'viewer', country_code: null, org_id: null, ...overrides }
}

Deno.test('resolveCreateUserScope: rejects an unknown role', () => {
  const result = resolveCreateUserScope(caller({ role: 'super_admin' }), requested({ role: 'nope' }))
  assertEquals(result.ok, false)
})

Deno.test('resolveCreateUserScope: viewer/org_admin/country_admin/super_admin caller with no matching branch rejects', () => {
  const result = resolveCreateUserScope(caller({ role: 'viewer' }), requested({ role: 'viewer' }))
  assertEquals(result.ok, false)
})

Deno.test('resolveCreateUserScope: super_admin may create any role with the requested scope', () => {
  const result = resolveCreateUserScope(
    caller({ role: 'super_admin' }),
    requested({ role: 'country_admin', country_code: 'fr', org_id: null }),
  )
  assertEquals(result, { ok: true, role: 'country_admin', country_code: 'fr', org_id: null })
})

Deno.test('resolveCreateUserScope: country_admin cannot create a super_admin or country_admin', () => {
  const c = caller({ role: 'country_admin', country_code: 'tr' })
  assertEquals(resolveCreateUserScope(c, requested({ role: 'super_admin' })).ok, false)
  assertEquals(resolveCreateUserScope(c, requested({ role: 'country_admin' })).ok, false)
})

Deno.test('resolveCreateUserScope: country_admin creating org_admin/viewer is forced to their own country', () => {
  const c = caller({ role: 'country_admin', country_code: 'tr' })
  const result = resolveCreateUserScope(c, requested({ role: 'org_admin', country_code: 'fr', org_id: 'org-x' }))
  assertEquals(result, { ok: true, role: 'org_admin', country_code: 'tr', org_id: 'org-x' })
})

Deno.test('resolveCreateUserScope: org_admin can only create viewer accounts', () => {
  const c = caller({ role: 'org_admin', country_code: 'tr', org_id: 'org-a' })
  assertEquals(resolveCreateUserScope(c, requested({ role: 'org_admin' })).ok, false)
})

Deno.test('resolveCreateUserScope: org_admin creating a viewer is forced to their own country AND org', () => {
  const c = caller({ role: 'org_admin', country_code: 'tr', org_id: 'org-a' })
  const result = resolveCreateUserScope(c, requested({ role: 'viewer', country_code: 'fr', org_id: 'org-b' }))
  assertEquals(result, { ok: true, role: 'viewer', country_code: 'tr', org_id: 'org-a' })
})
