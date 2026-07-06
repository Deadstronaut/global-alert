/**
 * Edge Function: generate-compliance-report (spec 019)
 *
 * Called weekly by pg_cron (via trigger_compliance_report_generation(), see
 * the 20260707210000_compliance_reports.sql migration) with the service-role
 * key as its Authorization header — same as dispatch-alert's Mode A
 * (automatic dispatch). Not intended for direct client invocation, though it
 * can be invoked manually (e.g. via curl) for testing per quickstart.md.
 *
 * Computes the most recently fully-elapsed week (Monday-to-Monday ending
 * before now) — no gap-search/backfill (spec.md's Edge Cases explicitly say
 * catch-up is not required; the UNIQUE constraint + ON CONFLICT below exist
 * only to guard against concurrent/retry duplicates, per analysis finding
 * F1).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { summarizeAuditRows } from '../shared/complianceReport.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// Most recently fully-elapsed week: the Monday at/before `now`, minus 7 days,
// through that Monday — i.e. the last complete Mon-Sun week before today.
function mostRecentElapsedWeek(now: Date): { periodStart: Date; periodEnd: Date } {
  const dayOfWeek = now.getUTCDay() // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday))
  const periodEnd = thisMonday
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
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
  const { periodStart, periodEnd } = mostRecentElapsedWeek(new Date())

  const { data: rows } = await admin
    .from('audit_log')
    .select('action, table_name')
    .gte('created_at', periodStart.toISOString())
    .lt('created_at', periodEnd.toISOString())

  const { by_action, by_table } = summarizeAuditRows(rows ?? [])

  const { data: brokenSeq } = await admin.rpc('verify_audit_chain')

  const summary = {
    by_action,
    by_table,
    integrity_ok: brokenSeq == null,
    broken_seq: brokenSeq ?? null,
  }

  // ON CONFLICT (period_start, period_end) DO NOTHING (FR-005) — idempotent
  // even if this function is invoked twice for the same period (retry,
  // manual test run racing the scheduled one, etc.).
  const { data: report, error } = await admin
    .from('compliance_reports')
    .upsert(
      { period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), summary },
      { onConflict: 'period_start,period_end', ignoreDuplicates: true },
    )
    .select()
    .maybeSingle()

  if (error) return json({ error: error.message }, 500)

  return json({ period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), inserted: !!report })
})
