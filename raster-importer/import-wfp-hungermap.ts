/**
 * Container entrypoint for WFP HungerMap — moves fetch-food-security's
 * fetch+write logic out of the hourly Supabase pg_cron + Edge Function
 * pair and into this container's own Deno.cron, matching
 * WorldPop/HydroRIVERS/HydroBASINS/OSM Roads/OSM Buildings' precedent
 * (2026-08-19: this app runs self-hosted per country; Docker owning all
 * periodic ingestion, not a mix of Docker + Supabase pg_cron for the same
 * sources, keeps one place to monitor/restart instead of two).
 *
 * Unlike those exposure-dataset sources, this one writes hazard_events
 * (upsertEvents), same as server/'s continuous pollers — see
 * shared/wfpHungerMapFetch.ts for the fetch/normalize logic itself
 * (shared with fetch-food-security/index.ts, kept working as a manual/
 * rollback path).
 *
 * Run via `docker compose run --rm wfp-hungermap-importer` (see docker-compose.yml).
 */
import { upsertEvents } from '../supabase/functions/shared/upsert.ts'
import { recordFetchOutcome, resolveSourceId, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'
import { fetchWfpHungerMap } from '../supabase/functions/shared/wfpHungerMapFetch.ts'

/** Runs the WFP HungerMap fetch+write once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runWfpHungerMapImport(): Promise<void> {
  const sourceId = await resolveSourceId('food_security', 'WFP HungerMap')
  if (!(await isSourceActive(sourceId))) {
    console.log('WFP HungerMap source is inactive (data_sources.is_active = false), skipping')
    return
  }

  let events: Awaited<ReturnType<typeof fetchWfpHungerMap>>
  try {
    events = await fetchWfpHungerMap(sourceId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchWfpHungerMap failed: ${message}`)
  }

  const { inserted, errors } = await upsertEvents(events)
  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  console.log(`\n=== DONE: ${events.length} fetched, ${inserted} inserted, ${errors.length} db errors ===`)
  if (errors.length > 0) console.error('db errors:', errors)
}

if (import.meta.main) {
  try {
    await runWfpHungerMapImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
