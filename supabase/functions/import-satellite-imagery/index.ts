/**
 * Edge Function: import-satellite-imagery (spec 066, unblocked)
 *
 * Fetches a Sentinel-2 L2A true-color image for an admin-specified bounding
 * box from Copernicus Data Space Ecosystem's free Sentinel Hub Process API
 * (no per-request cost within CDSE's free processing-unit quota), stores it
 * in the satellite-imagery bucket, and records it in satellite_imagery.
 *
 * On-demand, admin-triggered (org_admin/country_admin/super_admin) — not a
 * scheduled cron import. A country's full extent at useful resolution would
 * burn through the free quota fast; rapid damage assessment needs imagery
 * for a specific area (typically an active incident), requested when
 * actually needed.
 *
 * Requires Edge Function secrets COPERNICUS_CLIENT_ID/
 * COPERNICUS_CLIENT_SECRET (CDSE OAuth client, Client Credentials flow) —
 * never stored in this database, matching dispatch-alert's email-provider
 * secret convention.
 *
 * Verified live 2026-08-10 against the real CDSE token endpoint
 * (identity.dataspace.copernicus.eu) and Process API
 * (sh.dataspace.copernicus.eu) with a real account before this function was
 * written into the codebase.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

const ADMIN_ROLES = ['org_admin', 'country_admin', 'super_admin']

const TRUE_COLOR_EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: ["B02", "B03", "B04"], output: { bands: 3 } };
}
function evaluatePixel(sample) {
  return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02];
}`

async function getCopernicusToken(): Promise<string> {
  const clientId = Deno.env.get('COPERNICUS_CLIENT_ID')
  const clientSecret = Deno.env.get('COPERNICUS_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('COPERNICUS_CLIENT_ID/COPERNICUS_CLIENT_SECRET not configured')
  }

  const res = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) throw new Error(`CDSE token request failed: HTTP ${res.status}`)
  const data = await res.json()
  return data.access_token as string
}

function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const admin = adminClient()

  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  if (callerAuthError || !callerAuth.user) return json({ error: 'Invalid session' }, 401)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, country_code')
    .eq('id', callerAuth.user.id)
    .maybeSingle()
  if (!callerProfile) return json({ error: 'Caller profile not found' }, 403)
  if (!ADMIN_ROLES.includes(callerProfile.role)) {
    return json({ error: 'Only org_admin, country_admin, or super_admin may request satellite imagery' }, 403)
  }

  let body: { countryCode?: string; bbox?: number[]; fromDate?: string; toDate?: string; maxCloudCoverage?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const countryCode = body.countryCode?.toLowerCase()
  const bbox = body.bbox
  if (!countryCode || countryCode.length !== 2) return json({ error: 'countryCode is required' }, 400)
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((v) => typeof v !== 'number')) {
    return json({ error: 'bbox must be [west, south, east, north]' }, 400)
  }
  if (callerProfile.role !== 'super_admin' && countryCode !== callerProfile.country_code) {
    return json({ error: 'Not authorized to request imagery for this country' }, 403)
  }

  const toDate = body.toDate ?? new Date().toISOString()
  const fromDate = body.fromDate ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const maxCloudCoverage = body.maxCloudCoverage ?? 30

  let token: string
  try {
    token = await getCopernicusToken()
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }

  const processRes = await fetch('https://sh.dataspace.copernicus.eu/api/v1/process', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        bounds: { bbox },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: { timeRange: { from: fromDate, to: toDate }, maxCloudCoverage },
        }],
      },
      output: {
        width: 512,
        height: 512,
        responses: [{ identifier: 'default', format: { type: 'image/png' } }],
      },
      evalscript: TRUE_COLOR_EVALSCRIPT,
    }),
  })

  if (!processRes.ok) {
    const errorText = await processRes.text().catch(() => '')
    return json({ error: `Sentinel Hub Process API request failed: HTTP ${processRes.status}`, detail: errorText }, 502)
  }

  const imageBytes = new Uint8Array(await processRes.arrayBuffer())
  const storagePath = `${countryCode}/${new Date().toISOString().replace(/[:.]/g, '-')}.png`

  const { error: uploadError } = await admin.storage
    .from('satellite-imagery')
    .upload(storagePath, imageBytes, { contentType: 'image/png', upsert: true })
  if (uploadError) return json({ error: uploadError.message }, 500)

  const { data: inserted, error: insertError } = await admin.from('satellite_imagery').insert({
    country_code: countryCode,
    bbox,
    requested_from: fromDate,
    requested_to: toDate,
    storage_path: storagePath,
    requested_by: callerAuth.user.id,
  }).select().single()
  if (insertError) return json({ error: insertError.message }, 500)

  return json({ imagery: inserted })
})
