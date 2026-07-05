/**
 * Edge Function: create-user
 * Admin-created accounts for the country/org hierarchy — replaces open
 * self-registration. Only super_admin and country_admin may call this:
 *   - super_admin: may create any role, any country_code (incl. another super_admin)
 *   - country_admin: may only create org_admin/viewer, scoped to their OWN country_code
 * Called by: AdminView.vue "Kullanıcı Oluştur" form
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

const ROLES = ['super_admin', 'country_admin', 'org_admin', 'viewer']

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

  if (!['super_admin', 'country_admin', 'org_admin'].includes(callerProfile.role)) {
    return json({ error: 'Only super_admin, country_admin or org_admin may create accounts' }, 403)
  }

  let body: { email?: string; password?: string; role?: string; country_code?: string | null; org_id?: string | null; region_code?: string | null; full_name?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { email, password, role, full_name } = body
  let country_code = body.country_code ? body.country_code.trim().toLowerCase() : null
  let org_id = body.org_id ?? null
  // region_code is just an optional map view-filter preference, not a security
  // scope (country_code/org_id already handle access control) — never forced
  // by caller role, freely settable by whoever is allowed to touch this row.
  const region_code = body.region_code || null

  if (!email || !password || !role) return json({ error: 'email, password, role are required' }, 400)
  if (password.length < 6) return json({ error: 'password must be at least 6 characters' }, 400)
  if (!ROLES.includes(role)) return json({ error: `role must be one of ${ROLES.join(', ')}` }, 400)

  // Hierarchy enforcement (docs/security_roles_protocol.md §2-3):
  //   - country_admin -> org_admin/viewer, forced to their own country
  //   - org_admin     -> viewer only, forced to their own country AND org
  if (callerProfile.role === 'country_admin') {
    if (!['org_admin', 'viewer'].includes(role)) {
      return json({ error: 'country_admin may only create org_admin or viewer accounts' }, 403)
    }
    country_code = callerProfile.country_code
  } else if (callerProfile.role === 'org_admin') {
    if (role !== 'viewer') {
      return json({ error: 'org_admin may only create viewer accounts' }, 403)
    }
    country_code = callerProfile.country_code
    org_id = callerProfile.org_id
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // admin-provisioned accounts skip the confirmation-email step entirely
    user_metadata: country_code ? { country_code } : undefined,
  })
  if (createError || !created.user) return json({ error: createError?.message ?? 'Failed to create user' }, 400)

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
