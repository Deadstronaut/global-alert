/**
 * Edge Function: fetch-food-security
 * Source: WFP HungerMap (FCS — Food Consumption Score prevalence)
 * Writes to: hazard_events (magnitude=null — see wfpHungerMapFetch.ts)
 *
 * 2026-08-19: pg_cron trigger unscheduled (see the matching migration) —
 * moved to raster-importer/import-wfp-hungermap.ts's own Deno.cron,
 * matching WorldPop/HydroRIVERS/HydroBASINS/OSM Roads/OSM Buildings'
 * precedent (this app runs self-hosted per country; Docker owning all
 * periodic ingestion, not a mix of Docker + Supabase pg_cron for the same
 * sources, keeps one place to monitor/restart instead of two). This
 * function is kept working (not deleted) as a manual/rollback path, same
 * as this codebase's own convention for every other migrated source.
 *
 * Fetch logic lives in shared/wfpHungerMapFetch.ts (extracted 2026-08-19
 * so raster-importer/import-wfp-hungermap.ts can reuse it verbatim).
 */
import { corsHeaders } from '../shared/cors.ts'
import { upsertEvents } from '../shared/upsert.ts'
import { recordFetchOutcome, resolveSourceId, isSourceActive } from '../shared/sourceHealth.ts'
import { fetchWfpHungerMap } from '../shared/wfpHungerMapFetch.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const fetchErrors: string[] = []
  // deno-lint-ignore no-explicit-any
  let events: any[] = []

  const sourceId = await resolveSourceId('food_security', 'WFP HungerMap')
  if (await isSourceActive(sourceId)) {
    await fetchWfpHungerMap(sourceId)
      .then(async (r) => {
        events = r
        if (sourceId) await recordFetchOutcome(sourceId, 'success')
      })
      .catch(async (e) => {
        fetchErrors.push(`WFP HungerMap: ${e.message}`)
        if (sourceId) await recordFetchOutcome(sourceId, 'failure', e.message)
      })
  }

  const { inserted, errors: dbErrors } = await upsertEvents(events)
  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: events.length, inserted, fetchErrors, dbErrors },
    data: events,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
})
