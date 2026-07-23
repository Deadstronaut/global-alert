/**
 * Always-on scheduled entrypoint for the raster importers — registers a
 * Deno.cron trigger and keeps the process alive, matching server/'s
 * aggregator pattern (self-contained, no host OS scheduler dependency —
 * see NEW_GAME_PLAN.md §4.1 for why: this stack runs identically across
 * each federated per-country deployment, and a host-OS cron/Task
 * Scheduler entry is an easy-to-forget extra setup step per VM).
 *
 * Usage: `deno run --unstable-cron ... cron.ts <job-key>` — see JOBS below
 * (see docker-compose.yml's *-scheduled services, which set this as CMD).
 *
 * Schedules are per-job, not uniform, and mostly inherited from this same
 * source's old pg_cron schedule (see each job's own migration) rather than
 * invented fresh — WorldPop/HydroBASINS/HydroRIVERS/OSM Buildings/OSM
 * Roads/GHSL/GDO Anomaly moved here 2026-07-23 from Edge Functions that,
 * live-verified that day, ALL fail when actually invoked (WorldPop can't
 * even deploy — geotiff/esm.sh bundler bug, see NEW_GAME_PLAN.md §4.7;
 * HydroBASINS/HydroRIVERS hit WORKER_RESOURCE_LIMIT; OSM Buildings/Roads
 * time out past 120s on Overpass) — a container has none of those ceilings.
 * GloFAS is the one DAILY-cadence job (a new forecast every day).
 *
 * No "meta" job here (2026-07-22): Meta/HDX's dataset is frozen (HDX's own
 * package metadata says "no longer being updated" as of 2024 — see
 * download-meta.ts's header) and meta-ghsl-importer only ever reprocesses
 * whatever's already in manifest.json, never re-downloads — so a
 * recurring schedule would just recompute byte-identical output every
 * month for no benefit. Run `meta-ghsl-importer` manually instead (see
 * docker-compose.yml), same as meta-downloader.
 *
 * HydroBASINS/HydroRIVERS never had a pg_cron schedule at all before this
 * (checked their seed migration — genuinely never scheduled, not just
 * broken) — monthly here is a reasonable default (river/basin networks
 * change rarely), not inherited from anywhere.
 */
import { runGhslImport } from './import-ghsl.ts'
import { runGlofasImport } from './import-glofas.ts'
import { runGdoAnomalyImport } from './import-gdo-anomaly.ts'
import { runWorldPopImport } from './import-worldpop.ts'
import { runHydroBasinsImport } from './import-hydrobasins.ts'
import { runHydroRiversImport } from './import-hydrorivers.ts'
import { runOsmBuildingsImport } from './import-osm-buildings.ts'
import { runOsmRoadsImport } from './import-osm-roads.ts'

const JOBS: Record<string, { name: string; run: () => Promise<void>; schedule: string }> = {
  ghsl: { name: 'ghsl-population-import', run: runGhslImport, schedule: '0 3 1 * *' },
  glofas: { name: 'glofas-river-discharge-import', run: runGlofasImport, schedule: '0 4 * * *' },
  'gdo-anomaly': { name: 'gdo-anomaly-import', run: runGdoAnomalyImport, schedule: '0 5 1 * *' },
  worldpop: { name: 'worldpop-population-import', run: runWorldPopImport, schedule: '0 7 1 * *' }, // matches old import-worldpop-monthly
  hydrobasins: { name: 'hydrobasins-import', run: runHydroBasinsImport, schedule: '0 8 1 * *' },
  hydrorivers: { name: 'hydrorivers-import', run: runHydroRiversImport, schedule: '0 9 1 * *' },
  // Sunday: Deno.cron live-verified 2026-07-23 to reject day-of-week "0"
  // ("Invalid cron schedule", no further detail) even though standard cron
  // accepts 0 or 7 interchangeably for Sunday — only "7" works here.
  'osm-roads': { name: 'osm-roads-import', run: runOsmRoadsImport, schedule: '0 4 * * 7' }, // matches old import-osm-roads-weekly
  'osm-buildings': { name: 'osm-buildings-import', run: runOsmBuildingsImport, schedule: '0 5 * * 7' }, // matches old import-osm-buildings-weekly
}

const jobKey = Deno.args[0]
const job = jobKey ? JOBS[jobKey] : undefined
if (!job) {
  console.error(`Usage: cron.ts <${Object.keys(JOBS).join('|')}>`)
  Deno.exit(1)
}

console.log(`[cron] registering schedule for "${job.name}" (${job.schedule} UTC)`)

Deno.cron(job.name, job.schedule, async () => {
  console.log(`[cron] ${job.name} triggered at ${new Date().toISOString()}`)
  try {
    await job.run()
  } catch (e) {
    // Deno.cron has no built-in alerting — log loudly so this shows up in
    // `docker compose logs`, matching every other source's fail-open-but-
    // log convention in this repo (recordFetchOutcome etc.) rather than
    // crashing the whole scheduled process over one bad run.
    console.error(`[cron] ${job.name} FAILED: ${e instanceof Error ? e.message : e}`)
  }
})

console.log(`[cron] "${job.name}" scheduled, process staying alive`)
