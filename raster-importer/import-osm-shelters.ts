/**
 * Container entrypoint for OSM disaster shelters/assembly points. Unlike
 * every other raster-importer/ script, this does NOT write to
 * exposure_datasets/exposure_features via writeExposureDataset() — shelters
 * live in their own dedicated `shelters` table (spec 027), which is what
 * useSheltersStore()/MapView.vue's "Sığınakları Göster" toggle actually
 * reads. Upserts on (source, external_id) so the weekly scheduled re-run
 * updates existing OSM-imported rows instead of duplicating them; rows an
 * admin entered by hand (source='manual', external_id=NULL) are never
 * touched by this script.
 *
 * Run via `docker compose run --rm osm-shelters-importer` (see docker-compose.yml).
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchOsmShelters } from '../supabase/functions/shared/osmSheltersFetch.ts'
import { getServiceClient } from '../supabase/functions/shared/upsert.ts'
import { recordFetchOutcome, resolveSourceId, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'
import type { ShelterOsmRecord } from '../supabase/functions/shared/osmSheltersFetch.ts'

const UPSERT_CHUNK_SIZE = 500

/** Runs the OSM shelters import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runOsmSheltersImport(): Promise<void> {
  const sourceId = await resolveSourceId('shelters', 'OSM Shelters')
  if (!(await isSourceActive(sourceId))) {
    console.log('OSM Shelters source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching OSM shelters/assembly points for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Map<string, ShelterOsmRecord[]>
  try {
    countryRecords = await fetchOsmShelters(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchOsmShelters failed: ${message}`)
  }

  const supabase = getServiceClient()
  let countriesProcessed = 0
  const countriesSkipped: string[] = []
  let rowsWritten = 0

  for (const countryCode of servedCountryCodes) {
    const records = countryRecords.get(countryCode)
    if (!records || records.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const rows = records.map((r) => ({
      name: r.name,
      country_code: r.countryCode,
      lat: r.lat,
      lng: r.lng,
      capacity_total: r.capacityTotal,
      capacity_occupied: 0,
      status: 'open',
      is_active: true,
      source: 'osm',
      external_id: r.externalId,
      confidence_level: r.confidenceLevel,
    }))

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE)
      const { error } = await supabase.from('shelters').upsert(chunk, { onConflict: 'source,external_id' })
      if (error) throw new Error(`shelters upsert failed for ${countryCode} (rows ${i}-${i + chunk.length}): ${error.message}`)
    }

    console.log(`[${countryCode}] upserted ${rows.length} shelters`)
    countriesProcessed += 1
    rowsWritten += rows.length
  }

  // Same "a completed run is a success even with zero rows" convention as
  // the other OSM importers — only an upstream fetch failure is a
  // 'failure' outcome (e.g. Madagascar's near-total lack of OSM shelter
  // tags today is expected, not an error).
  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  console.log(`\n=== DONE: ${countriesProcessed} processed, ${countriesSkipped.length} skipped (${countriesSkipped.join(', ') || 'none'}), ${rowsWritten} rows upserted ===`)
}

if (import.meta.main) {
  try {
    await runOsmSheltersImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
