/**
 * Edge Function: compute-risk-exceedance-curve (spec 039, US4)
 * Reads an administrative area's real historical hazard-event magnitudes
 * (via the get_hazard_area_event_magnitudes RPC, which reuses
 * compute_hazard_area_score's polygon lookup) and, if the minimum record
 * threshold is met, bootstrap-resamples them (shared/seededRandom.ts) into
 * an impact-level-vs-exceedance-probability curve. Below the threshold,
 * returns { error: 'insufficient_historical_data', ... } with HTTP 200
 * (FR-013) rather than a curve built from too few points. Deterministic per
 * seed (research.md §6).
 * Called by: src/components/risk/RiskScoreDashboard.vue
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { bootstrapResample } from '../shared/seededRandom.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// Below this many historical records, a resampled curve would not be
// statistically meaningful (FR-013) — flagged explicitly rather than
// silently generated.
const MINIMUM_HISTORICAL_RECORDS = 20
const RESAMPLE_ITERATIONS = 1000
const EXCEEDANCE_LEVELS_PERCENTILE = [0.5, 0.75, 0.9, 0.95, 0.99]

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

  let body: { countryCode?: string; adminBoundaryCode?: string; hazardType?: string; seed?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { countryCode, adminBoundaryCode, hazardType, seed } = body
  if (!countryCode || !adminBoundaryCode || !hazardType) {
    return json({ error: 'countryCode, adminBoundaryCode, and hazardType are required' }, 400)
  }
  const effectiveSeed = seed ?? 42

  const { data: magnitudes, error } = await admin.rpc('get_hazard_area_event_magnitudes', {
    p_country_code: countryCode,
    p_admin_boundary_code: adminBoundaryCode,
    p_hazard_type: hazardType,
  })
  if (error) return json({ error: error.message }, 500)

  const historicalRecordCount = (magnitudes ?? []).length
  if (historicalRecordCount < MINIMUM_HISTORICAL_RECORDS) {
    return json({
      error: 'insufficient_historical_data',
      historical_record_count: historicalRecordCount,
      minimum_required: MINIMUM_HISTORICAL_RECORDS,
    })
  }

  const resampled = bootstrapResample(magnitudes as number[], RESAMPLE_ITERATIONS, effectiveSeed)
  const sorted = [...resampled].sort((a, b) => a - b)

  const curve = EXCEEDANCE_LEVELS_PERCENTILE.map((p) => {
    const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
    return { impact_level: sorted[index], annual_exceedance_probability: Math.round((1 - p) * 10000) / 10000 }
  })

  return json({ curve, historical_record_count: historicalRecordCount, seed: effectiveSeed })
})
