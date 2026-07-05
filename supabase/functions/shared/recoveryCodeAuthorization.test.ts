import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { checkRecoveryCodeEligibility } from './recoveryCodeAuthorization.ts'

Deno.test('checkRecoveryCodeEligibility: rejects a suspended account', () => {
  const result = checkRecoveryCodeEligibility({ is_active: false })
  assertEquals(result.allowed, false)
})

Deno.test('checkRecoveryCodeEligibility: allows an active account', () => {
  const result = checkRecoveryCodeEligibility({ is_active: true })
  assertEquals(result.allowed, true)
})
