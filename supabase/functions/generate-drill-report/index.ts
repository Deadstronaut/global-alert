/**
 * Edge Function: generate-drill-report (spec 032, MHEWS-FR-0033)
 *
 * Structural twin of generate-incident-report (spec 026)/generate-compliance-report
 * (spec 019). Called yearly by pg_cron (via trigger_drill_report_generation(),
 * see the drill_reporting_feedback migration) with the service-role key as
 * its Authorization header. Not intended for direct client invocation,
 * though it can be invoked manually (e.g. via curl) for testing per
 * quickstart.md.
 *
 * Computes the most recently fully-elapsed calendar year (Jan 1 00:00 UTC of
 * last year through Jan 1 00:00 UTC of this year) — no gap-search/backfill;
 * the UNIQUE constraint + ON CONFLICT below exist only to guard against
 * concurrent/retry duplicates.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { computeDrillReportSummary } from '../shared/drillReportSummary.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// Most recently fully-elapsed calendar year: Jan 1 00:00 UTC of last year
// through Jan 1 00:00 UTC of this year.
function mostRecentElapsedYear(now: Date): { periodStart: Date; periodEnd: Date } {
  const year = now.getUTCFullYear()
  const periodStart = new Date(Date.UTC(year - 1, 0, 1))
  const periodEnd = new Date(Date.UTC(year, 0, 1))
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
  const { periodStart, periodEnd } = mostRecentElapsedYear(new Date())

  const { data: drills } = await admin
    .from('drill_sessions')
    .select('scenario_type, summary')
    .eq('status', 'completed')
    .gte('ended_at', periodStart.toISOString())
    .lt('ended_at', periodEnd.toISOString())

  const summary = computeDrillReportSummary(drills ?? [])

  // ON CONFLICT (period_start, period_end) DO NOTHING (FR-004) — idempotent
  // even if this function is invoked twice for the same period.
  const { data: report, error } = await admin
    .from('drill_reports')
    .upsert(
      { period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), summary },
      { onConflict: 'period_start,period_end', ignoreDuplicates: true },
    )
    .select()
    .maybeSingle()

  if (error) return json({ error: error.message }, 500)

  return json({ period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), inserted: !!report })
})
