import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { checkSuspendAuthorization, type ProfileScope } from './suspendAuthorization.ts'

function profile(overrides: Partial<ProfileScope>): ProfileScope {
  return { id: 'id', role: 'viewer', country_code: null, org_id: null, ...overrides }
}

Deno.test('checkSuspendAuthorization: caller cannot target their own account', () => {
  const caller = profile({ id: 'u1', role: 'super_admin' })
  const target = profile({ id: 'u1', role: 'super_admin' })
  const result = checkSuspendAuthorization(caller, target)
  assertEquals(result.allowed, false)
})

Deno.test('checkSuspendAuthorization: viewer caller is never allowed', () => {
  const caller = profile({ id: 'u1', role: 'viewer' })
  const target = profile({ id: 'u2', role: 'viewer' })
  const result = checkSuspendAuthorization(caller, target)
  assertEquals(result.allowed, false)
})

Deno.test('checkSuspendAuthorization: super_admin may suspend anyone but self', () => {
  const caller = profile({ id: 'u1', role: 'super_admin' })
  const target = profile({ id: 'u2', role: 'country_admin', country_code: 'tr' })
  assertEquals(checkSuspendAuthorization(caller, target).allowed, true)
})

Deno.test('checkSuspendAuthorization: country_admin cannot suspend a super_admin', () => {
  const caller = profile({ id: 'u1', role: 'country_admin', country_code: 'tr' })
  const target = profile({ id: 'u2', role: 'super_admin' })
  assertEquals(checkSuspendAuthorization(caller, target).allowed, false)
})

Deno.test('checkSuspendAuthorization: country_admin cannot suspend another country_admin', () => {
  const caller = profile({ id: 'u1', role: 'country_admin', country_code: 'tr' })
  const target = profile({ id: 'u2', role: 'country_admin', country_code: 'tr' })
  assertEquals(checkSuspendAuthorization(caller, target).allowed, false)
})

Deno.test('checkSuspendAuthorization: country_admin cannot suspend org_admin in a different country', () => {
  const caller = profile({ id: 'u1', role: 'country_admin', country_code: 'tr' })
  const target = profile({ id: 'u2', role: 'org_admin', country_code: 'fr' })
  assertEquals(checkSuspendAuthorization(caller, target).allowed, false)
})

Deno.test('checkSuspendAuthorization: country_admin may suspend org_admin/viewer in their own country', () => {
  const caller = profile({ id: 'u1', role: 'country_admin', country_code: 'tr' })
  assertEquals(
    checkSuspendAuthorization(caller, profile({ id: 'u2', role: 'org_admin', country_code: 'tr' })).allowed,
    true,
  )
  assertEquals(
    checkSuspendAuthorization(caller, profile({ id: 'u3', role: 'viewer', country_code: 'tr' })).allowed,
    true,
  )
})

Deno.test('checkSuspendAuthorization: org_admin cannot suspend outside their own org', () => {
  const caller = profile({ id: 'u1', role: 'org_admin', country_code: 'tr', org_id: 'org-a' })
  const target = profile({ id: 'u2', role: 'viewer', country_code: 'tr', org_id: 'org-b' })
  assertEquals(checkSuspendAuthorization(caller, target).allowed, false)
})

Deno.test('checkSuspendAuthorization: org_admin cannot suspend a non-viewer in their own org', () => {
  const caller = profile({ id: 'u1', role: 'org_admin', country_code: 'tr', org_id: 'org-a' })
  const target = profile({ id: 'u2', role: 'org_admin', country_code: 'tr', org_id: 'org-a' })
  assertEquals(checkSuspendAuthorization(caller, target).allowed, false)
})

Deno.test('checkSuspendAuthorization: org_admin may suspend a viewer in their own org', () => {
  const caller = profile({ id: 'u1', role: 'org_admin', country_code: 'tr', org_id: 'org-a' })
  const target = profile({ id: 'u2', role: 'viewer', country_code: 'tr', org_id: 'org-a' })
  assertEquals(checkSuspendAuthorization(caller, target).allowed, true)
})
