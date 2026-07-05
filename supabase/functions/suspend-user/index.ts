/**
 * Edge Function: suspend-user
 * Suspends or reactivates an existing account, distinct from a role change
 * (spec 004, gap 3 — replaces revokeAccess()'s role-downgrade-only behavior
 * with a real access cutoff). Mirrors create-user's caller-resolution and
 * hierarchy-enforcement pattern:
 *   - super_admin: may suspend/reactivate anyone except themself
 *   - country_admin: only org_admin/viewer accounts in their OWN country_code
 *   - org_admin: only viewer accounts in their OWN country_code AND org_id
 * Called by: AdminView.vue Users tab "Suspend"/"Reactivate" row actions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { checkSuspendAuthorization } from '../shared/suspendAuthorization.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
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
    .select('id, role, country_code, org_id')
    .eq('id', callerAuth.user.id)
    .maybeSingle()
  if (callerProfileError || !callerProfile) return json({ error: 'Caller profile not found' }, 403)

  let body: { target_user_id?: string; action?: 'suspend' | 'reactivate' }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { target_user_id, action } = body
  if (!target_user_id || !action) return json({ error: 'target_user_id and action are required' }, 400)
  if (!['suspend', 'reactivate'].includes(action)) return json({ error: "action must be 'suspend' or 'reactivate'" }, 400)

  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, role, country_code, org_id')
    .eq('id', target_user_id)
    .maybeSingle()
  if (targetError || !target) return json({ error: 'Target user not found' }, 404)

  const authResult = checkSuspendAuthorization(callerProfile, target)
  if (!authResult.allowed) return json({ error: authResult.error }, 403)

  const isActive = action === 'reactivate'
  const banDuration = isActive ? 'none' : '87600h' // ~10 years, Supabase's documented "effectively permanent" ban pattern

  const { error: updateError } = await admin
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', target_user_id)
  if (updateError) return json({ error: updateError.message }, 500)

  const { error: banError } = await admin.auth.admin.updateUserById(target_user_id, { ban_duration: banDuration })
  if (banError) return json({ error: banError.message }, 500)

  return json({ id: target_user_id, is_active: isActive })
})
