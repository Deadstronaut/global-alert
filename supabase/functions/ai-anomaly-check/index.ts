/**
 * Edge Function: ai-anomaly-check (spec 051, US4)
 * Batch job (service-role, called by pg_cron — see migration
 * <timestamp>_ai_anomaly_check_cron.sql) that flags recently-ingested hazard
 * records whose `magnitude` deviates sharply from that source table's
 * recent history for the same country. Deliberately NOT an AI/ML call
 * (research.md Decision 2) — uses anomalyStats.ts's pure z-score check only,
 * so it never adds latency to the real-time ingestion path and stays fully
 * auditable. Writes ONLY to ai_suggestions — never touches the hazard
 * tables themselves, risk scores, cascading-risk rules, or any alert/
 * dispatch state.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { checkAnomaly } from '../shared/anomalyStats.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// Mirrors server/src/output/supabaseWriter.js's TABLE_MAP — every hazard
// table shares the same (id, magnitude, country_code, received_at) shape.
const HAZARD_TABLES = ['earthquake', 'wildfire', 'flood', 'drought', 'food_security']
const RECENT_WINDOW_MINUTES = 15
const HISTORY_SAMPLE_SIZE = 200

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  const authHeader = req.headers.get('Authorization')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authHeader || !serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: 'Requires service-role authentication' }, 401)
  }

  const admin = adminClient()
  const since = new Date(Date.now() - RECENT_WINDOW_MINUTES * 60_000).toISOString()

  let flagged = 0
  let checked = 0

  for (const table of HAZARD_TABLES) {
    const { data: recentRows } = await admin
      .from(table)
      .select('id, magnitude, country_code, received_at')
      .gte('received_at', since)
      .not('magnitude', 'is', null)

    for (const row of recentRows ?? []) {
      if (!row.country_code) continue // capability config and audit both need a country_code

      const { data: config } = await admin
        .from('ai_capability_config')
        .select('enabled')
        .eq('country_code', row.country_code)
        .eq('capability', 'anomaly_flag')
        .maybeSingle()
      if (!config?.enabled) continue

      // Idempotency: never re-flag the same row twice.
      const { data: existing } = await admin
        .from('ai_suggestions')
        .select('id')
        .eq('capability', 'anomaly_flag')
        .eq('source_table', table)
        .eq('source_id', row.id)
        .maybeSingle()
      if (existing) continue

      const { data: historyRows } = await admin
        .from(table)
        .select('magnitude')
        .eq('country_code', row.country_code)
        .not('magnitude', 'is', null)
        .neq('id', row.id)
        .order('received_at', { ascending: false })
        .limit(HISTORY_SAMPLE_SIZE)

      checked++
      const history = (historyRows ?? []).map((h) => h.magnitude as number)
      const result = checkAnomaly(history, row.magnitude as number)
      if (!result.isAnomaly) continue

      await admin.from('ai_suggestions').insert({
        capability: 'anomaly_flag',
        country_code: row.country_code,
        source_table: table,
        source_id: row.id,
        input_excerpt: { metric: 'magnitude' },
        ai_output: {
          metric: 'magnitude',
          value: row.magnitude,
          baseline_mean: result.mean,
          baseline_stddev: result.stddev,
          z_score: result.zScore,
        },
        status: 'pending',
        requested_by: null,
      })
      flagged++
    }
  }

  return json({ checked, flagged })
})
