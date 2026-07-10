/**
 * Edge Function: simulate-hazard-scenario (spec 039, US3)
 * Simulates a hypothetical hazard event's footprint via a deterministic,
 * hazard-type-specific formula (shared/hazardFootprint.ts) and overlays it
 * against the requested exposure dataset(s) by reusing spec 008's existing
 * compute_zonal_stats RPC. Returns { error: 'no_formula_available', ... }
 * with HTTP 200 for a hazard type with no formula yet (FR-010) — this is a
 * documented, expected outcome, not a failure (same convention as spec 038's
 * "zero valid records ≠ import failure").
 * Called by: src/components/risk/ScenarioBuilder.vue
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { simulateHazardFootprint } from '../shared/hazardFootprint.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

const ADMIN_ROLES = ['org_admin', 'country_admin', 'super_admin']

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
    authHeader.replace('Bearer ', ''),
  )
  if (callerAuthError || !callerAuth.user) return json({ error: 'Invalid session' }, 401)

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('role, country_code, org_id')
    .eq('id', callerAuth.user.id)
    .maybeSingle()
  if (callerProfileError || !callerProfile) return json({ error: 'Caller profile not found' }, 403)

  if (!ADMIN_ROLES.includes(callerProfile.role)) {
    return json({ error: 'Only org_admin, country_admin, or super_admin may run scenario simulations' }, 403)
  }

  let body: { hazardType?: string; parameters?: Record<string, unknown>; exposureDatasetIds?: string[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { hazardType, parameters, exposureDatasetIds } = body
  if (!hazardType || typeof hazardType !== 'string') return json({ error: 'hazardType is required' }, 400)
  if (!parameters || typeof parameters !== 'object') return json({ error: 'parameters is required' }, 400)

  const { footprint, reason, formulaRangeWarning } = simulateHazardFootprint(hazardType, parameters)

  if (!footprint) {
    return json({ error: reason, hazardType, message: 'Scenario simulation is not yet available for this hazard type.' })
  }

  const estimatedImpact: Array<{ exposure_dataset_id: string; total_value: number; feature_count: number }> = []
  for (const datasetId of exposureDatasetIds ?? []) {
    const { data, error } = await admin.rpc('compute_zonal_stats', {
      dataset_id: datasetId,
      center_lat: footprint.coordinates[1],
      center_lng: footprint.coordinates[0],
      radius_km: footprint.radiusKm,
    })
    if (error) {
      return json({ error: `compute_zonal_stats failed for dataset ${datasetId}: ${error.message}` }, 500)
    }
    const row = Array.isArray(data) ? data[0] : data
    estimatedImpact.push({
      exposure_dataset_id: datasetId,
      total_value: row?.total_value ?? 0,
      feature_count: row?.feature_count ?? 0,
    })
  }

  return json({
    footprint_geojson: {
      type: 'Point',
      coordinates: footprint.coordinates,
      properties: { radius_km: footprint.radiusKm },
    },
    estimated_impact: estimatedImpact,
    formula_range_warning: formulaRangeWarning,
  })
})
