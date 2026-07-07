/**
 * Edge Function: generate-incident-report (spec 026)
 *
 * Called yearly by pg_cron (via trigger_incident_report_generation(), see the
 * 20260708020000_incident_timeline_reports.sql migration) with the
 * service-role key as its Authorization header — same pattern as
 * generate-compliance-report (spec 019). Not intended for direct client
 * invocation, though it can be invoked manually (e.g. via curl) for testing
 * per quickstart.md.
 *
 * Computes the most recently fully-elapsed calendar year (Jan 1 00:00 UTC of
 * last year through Jan 1 00:00 UTC of this year) — no gap-search/backfill,
 * matching spec 019's precedent; the UNIQUE constraint + ON CONFLICT below
 * exist only to guard against concurrent/retry duplicates.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import {
  computeSeverityAndHazardBreakdown,
  computeAverageTimeToCloseHours,
  computeFalseAlarmRate,
} from '../shared/incidentReportSummary.ts'

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

  const { data: incidents } = await admin
    .from('incidents')
    .select('severity, hazard_type, status, opened_at, closed_at, linked_cap_id')
    .gte('opened_at', periodStart.toISOString())
    .lt('opened_at', periodEnd.toISOString())

  const rows = incidents ?? []

  const linkedCapIds = [...new Set(rows.map((r) => r.linked_cap_id).filter((id): id is string => !!id))]
  const capDraftStatusByCapId: Record<string, string> = {}
  if (linkedCapIds.length > 0) {
    const { data: capDrafts } = await admin.from('cap_drafts').select('id, status').in('id', linkedCapIds)
    for (const draft of capDrafts ?? []) capDraftStatusByCapId[draft.id] = draft.status
  }

  const { by_severity, by_hazard_type } = computeSeverityAndHazardBreakdown(rows)
  const avg_time_to_close_hours = computeAverageTimeToCloseHours(rows)
  const false_alarm_rate = computeFalseAlarmRate(rows, capDraftStatusByCapId)

  const summary = {
    total_incidents: rows.length,
    by_severity,
    by_hazard_type,
    avg_time_to_close_hours,
    false_alarm_rate,
  }

  // ON CONFLICT (period_start, period_end) DO NOTHING (FR-006/SC-004) —
  // idempotent even if this function is invoked twice for the same period.
  const { data: report, error } = await admin
    .from('incident_reports')
    .upsert(
      { period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), summary },
      { onConflict: 'period_start,period_end', ignoreDuplicates: true },
    )
    .select()
    .maybeSingle()

  if (error) return json({ error: error.message }, 500)

  return json({ period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), inserted: !!report })
})
