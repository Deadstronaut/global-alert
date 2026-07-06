import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { canRetryDispatchJob } from './dispatchRetryAuthorization.ts'

Deno.test('super_admin can retry any job', () => {
  assertEquals(canRetryDispatchJob({ role: 'super_admin', country_code: null, org_id: null }, 'tr', null), true)
})

Deno.test('country_admin can retry a job in their own country', () => {
  assertEquals(canRetryDispatchJob({ role: 'country_admin', country_code: 'tr', org_id: null }, 'tr', null), true)
})

Deno.test('country_admin cannot retry a job in a different country', () => {
  assertEquals(canRetryDispatchJob({ role: 'country_admin', country_code: 'tr', org_id: null }, 'my', null), false)
})

Deno.test('org_admin can retry a job matching both country and org', () => {
  assertEquals(canRetryDispatchJob({ role: 'org_admin', country_code: 'tr', org_id: 'org-1' }, 'tr', 'org-1'), true)
})

Deno.test('org_admin cannot retry a job with a different org_id, even same country', () => {
  assertEquals(canRetryDispatchJob({ role: 'org_admin', country_code: 'tr', org_id: 'org-1' }, 'tr', 'org-2'), false)
})

Deno.test('viewer is always denied (no separate auditor role exists)', () => {
  assertEquals(canRetryDispatchJob({ role: 'viewer', country_code: 'tr', org_id: null }, 'tr', null), false)
})
