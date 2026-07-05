/**
 * Edge Function: create-user
 * Admin-created accounts for the country/org hierarchy — replaces open
 * self-registration. Only super_admin and country_admin may call this:
 *   - super_admin: may create any role, any country_code (incl. another super_admin)
 *   - country_admin: may only create org_admin/viewer, scoped to their OWN country_code
 * The new account is provisioned via Supabase's invite flow (spec 004 gap 4) —
 * no password is chosen by the admin; the invited user sets their own via a
 * secure emailed link (expiry controlled by the project's Auth "Mailer OTP
 * Expiry" setting, see quickstart.md §0 for the 48h configuration step).
 * Called by: AdminView.vue "Kullanıcı Oluştur" form
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { resolveCreateUserScope } from '../shared/createUserAuthorization.ts'

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

  // Identify the caller from their own JWT (the anon-key-signed access token).
  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (callerAuthError || !callerAuth.user) return json({ error: 'Invalid session' }, 401)

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('role, country_code, org_id')
    .eq('id', callerAuth.user.id)
    .maybeSingle()
  if (callerProfileError || !callerProfile) return json({ error: 'Caller profile not found' }, 403)

  let body: { email?: string; role?: string; country_code?: string | null; org_id?: string | null; region_code?: string | null; full_name?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { email, full_name } = body
  const requestedCountryCode = body.country_code ? body.country_code.trim().toLowerCase() : null
  // region_code is just an optional map view-filter preference, not a security
  // scope (country_code/org_id already handle access control) — never forced
  // by caller role, freely settable by whoever is allowed to touch this row.
  const region_code = body.region_code || null

  if (!email || !body.role) return json({ error: 'email, role are required' }, 400)

  const scope = resolveCreateUserScope(callerProfile, {
    role: body.role,
    country_code: requestedCountryCode,
    org_id: body.org_id ?? null,
  })
  if (!scope.ok) {
    const status = scope.error.startsWith('role must be one of') ? 400 : 403
    return json({ error: scope.error }, status)
  }
  const { role, country_code, org_id } = scope

  const { data: created, error: createError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: country_code ? { country_code } : undefined,
  })
  if (createError || !created.user) return json({ error: createError?.message ?? 'Failed to invite user' }, 400)

  // handle_new_user() trigger already inserted a default 'viewer' profile row;
  // now set the actual requested role/country_code/org_id/full_name via
  // service_role (bypasses RLS and the self-escalation trigger, which only
  // guards client-authenticated sessions, not admin-provisioned service calls).
  const { error: updateError } = await admin
    .from('profiles')
    .update({ role, country_code, org_id, region_code, full_name: full_name ?? null })
    .eq('id', created.user.id)
  if (updateError) return json({ error: updateError.message }, 500)

  return json({
    id: created.user.id,
    email: created.user.email,
    role,
    country_code,
    org_id,
    region_code,
  })
})
