/**
 * Edge Function: verify-recovery-code
 * Accepts a one-time recovery code as an alternative to a TOTP code at the
 * login challenge step (spec 005 US3). Supabase Auth has no native concept of
 * a recovery code — this validates one against mfa_recovery_codes and then
 * removes the caller's TOTP factor (research.md §3), which is the only way to
 * settle the session back to aal1 without an unsupported "force aal2" API.
 * Called by: src/stores/auth.js's verifyRecoveryCode(), from LoginView.vue's
 * "use a recovery code instead" step.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { checkRecoveryCodeEligibility } from '../shared/recoveryCodeAuthorization.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const admin = adminClient()

  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (callerAuthError || !callerAuth.user) return json({ error: 'Invalid session' }, 401)

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('is_active')
    .eq('id', callerAuth.user.id)
    .maybeSingle()
  if (callerProfileError || !callerProfile) return json({ error: 'Caller profile not found' }, 403)

  const eligibility = checkRecoveryCodeEligibility(callerProfile)
  if (!eligibility.allowed) return json({ error: eligibility.error }, 403)

  let body: { code?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!body.code) return json({ error: 'code is required' }, 400)

  const codeHash = await sha256Hex(body.code)

  const { data: matched, error: matchError } = await admin
    .from('mfa_recovery_codes')
    .select('id')
    .eq('user_id', callerAuth.user.id)
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .maybeSingle()
  if (matchError) return json({ error: matchError.message }, 500)
  if (!matched) return json({ error: 'Invalid or already-used recovery code' }, 400)

  const { error: markUsedError } = await admin
    .from('mfa_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', matched.id)
  if (markUsedError) return json({ error: markUsedError.message }, 500)

  const { data: factorsData, error: factorsError } = await admin.auth.admin.mfa.listFactors({
    userId: callerAuth.user.id,
  })
  if (factorsError) return json({ error: factorsError.message }, 500)
  const activeFactor = factorsData?.factors?.find((f: { status: string }) => f.status === 'verified')
  if (activeFactor) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
      id: activeFactor.id,
      userId: callerAuth.user.id,
    })
    if (deleteError) return json({ error: deleteError.message }, 500)
  }

  return json({ ok: true })
})
