/**
 * Edge Function: generate-community-report-cluster-summary (spec 036
 * remaining item — "zamanlanmış coğrafi küme özet raporu")
 *
 * Called daily by pg_cron (via trigger_community_report_cluster_summary(),
 * see 20260715140000_community_report_cluster_summaries.sql) with the
 * service-role key as its Authorization header — same call shape as
 * generate-compliance-report (spec 019) and generate-incident-report
 * (spec 026). Computes the most recently fully-elapsed UTC day, groups that
 * day's *approved* community_reports into country + geo-grid buckets
 * (communityReportClustering.ts, pure and unit-tested), and upserts one row
 * per country into community_report_cluster_summaries. Idempotent via the
 * table's UNIQUE(period_start, period_end, country_code) + upsert
 * ignoreDuplicates, matching the established retry-safety pattern.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { clusterReportsByCountryAndGrid } from '../shared/communityReportClustering.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// Most recently fully-elapsed UTC day: yesterday 00:00 through today 00:00.
function mostRecentElapsedDay(now: Date): { periodStart: Date; periodEnd: Date } {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000)
  return { periodStart, periodEnd }
}

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
  const { periodStart, periodEnd } = mostRecentElapsedDay(new Date())

  const { data: rows } = await admin
    .from('community_reports')
    .select('lat, lng, hazard_type, country_code')
    .eq('status', 'approved')
    .gte('created_at', periodStart.toISOString())
    .lt('created_at', periodEnd.toISOString())

  const groups = clusterReportsByCountryAndGrid(rows ?? [])

  if (groups.length === 0) {
    // Still record an empty day explicitly (mirrors compliance_reports'
    // "a zero-activity period must still produce a real, empty summary"
    // convention) — a single unresolved-country row with zero clusters.
    groups.push({ country_code: null, total_reports: 0, clusters: [] })
  }

  const results = []
  for (const group of groups) {
    // '' (not NULL) represents "country could not be resolved" — a plain
    // UNIQUE(period_start, period_end, country_code) constraint would treat
    // multiple NULLs as distinct rows (defeating the idempotency guarantee),
    // so the unresolved bucket is stored as an explicit empty string instead.
    const { data, error } = await admin
      .from('community_report_cluster_summaries')
      .upsert(
        {
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          country_code: group.country_code ?? '',
          total_reports: group.total_reports,
          clusters: group.clusters,
        },
        { onConflict: 'period_start,period_end,country_code', ignoreDuplicates: true },
      )
      .select()

    if (error) return json({ error: error.message }, 500)
    results.push(data)
  }

  return json({ periodStart, periodEnd, groups: results.length })
})
