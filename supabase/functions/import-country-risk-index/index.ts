/**
 * Edge Function: import-country-risk-index (spec 058)
 *
 * Reads country_risk_index_import_settings (single-row config: source_url,
 * is_active), fetches a plain CSV from that URL — no API key, no
 * third-party account, just a publicly downloadable export (e.g. an INFORM
 * Index CSV release) — and upserts rows into country_risk_indices on
 * (country_code, year, source), mirroring the manual-entry path
 * CountryRiskIndexPanel.vue already uses.
 *
 * Expected CSV header (case-insensitive, any column order):
 *   country_code, year, hazard_exposure_score, vulnerability_score,
 *   lack_of_coping_capacity_score[, composite_score][, source]
 * composite_score is computed as the unweighted mean of the three
 * dimension scores when the CSV doesn't supply one directly — matching
 * INFORM's own top-level aggregation approach.
 *
 * Service-role only (scheduled via pg_cron, see
 * 20260810121000_country_risk_index_auto_import.sql); no anon access.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    header.forEach((key, i) => { row[key] = cells[i] ?? '' })
    return row
  })
}

function toNumber(v: string | undefined): number | null {
  if (v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: settings, error: settingsError } = await supabase
    .from('country_risk_index_import_settings')
    .select('*')
    .eq('id', SETTINGS_ID)
    .single()

  if (settingsError || !settings) {
    return json({ meta: { status: 'skipped', reason: 'settings row missing' } })
  }
  if (!settings.is_active || !settings.source_url) {
    return json({ meta: { status: 'skipped', reason: 'not configured/inactive' } })
  }

  const recordRun = async (status: 'success' | 'failure', message: string) => {
    await supabase.from('country_risk_index_import_settings').update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_message: message,
    }).eq('id', SETTINGS_ID)
  }

  let rows: Record<string, string>[]
  try {
    const res = await fetch(settings.source_url)
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`)
    rows = parseCsv(await res.text())
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await recordRun('failure', message)
    return json({ error: message }, 502)
  }

  let imported = 0
  let skipped = 0
  const source = settings.source_label || 'INFORM Index'

  for (const row of rows) {
    const countryCode = (row.country_code || row.iso2 || '').toUpperCase()
    const year = toNumber(row.year)
    const hazardExposure = toNumber(row.hazard_exposure_score)
    const vulnerability = toNumber(row.vulnerability_score)
    const lackOfCoping = toNumber(row.lack_of_coping_capacity_score)

    if (!countryCode || countryCode.length !== 2 || year === null) {
      skipped++
      continue
    }

    let composite = toNumber(row.composite_score)
    if (composite === null) {
      const parts = [hazardExposure, vulnerability, lackOfCoping].filter((v): v is number => v !== null)
      composite = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : null
    }

    const { error: upsertError } = await supabase.from('country_risk_indices').upsert({
      country_code: countryCode,
      year,
      hazard_exposure_score: hazardExposure,
      vulnerability_score: vulnerability,
      lack_of_coping_capacity_score: lackOfCoping,
      composite_score: composite,
      source,
      notes: 'Imported automatically from configured source URL',
    }, { onConflict: 'country_code,year,source' })

    if (upsertError) {
      skipped++
      continue
    }
    imported++
  }

  await recordRun('success', `${imported} row(s) imported, ${skipped} skipped`)
  return json({ imported, skipped, totalRows: rows.length })
})
