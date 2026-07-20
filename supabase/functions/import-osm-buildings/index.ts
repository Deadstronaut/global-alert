/**
 * Edge Function: import-osm-buildings
 * Source: OpenStreetMap via the Overpass API — "OpenBuildingMap" line item
 * from the Data Sources Inventory §8 (evaluated but not integrated)
 * Writes to: exposure_datasets / exposure_features
 *
 * Mirrors import-osm-roads/index.ts exactly (spec 040): not a hazard-event
 * fetch, one Overpass query per served country (never combined — the same
 * 150s Edge Function idle timeout that forced import-osm-roads into
 * per-country invocations applies here, and this query set returns more
 * elements than roads' motorway|trunk|primary filter), supersedes each
 * country's prior 'osm-buildings'-sourced dataset.
 *
 * Scope is critical facilities only (hospitals/clinics, schools/
 * universities, fire/police/government) — see osmBuildingsFetch.ts's header
 * comment for why "every OSM building" was rejected as unsafe at this
 * layer's resource budget. metricValue is always 1 ("count") per feature,
 * not an area — this dataset answers "how many critical facilities are in
 * the affected area", the same question ScenarioBuilder.vue's simulation
 * result already surfaces for population.
 */
import { corsHeaders } from '../shared/cors.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { fetchOsmBuildings } from '../shared/osmBuildingsFetch.ts'
import { partitionBuildingRecords } from '../shared/buildingImportPartition.ts'
import { writeExposureDataset } from '../shared/writeExposureDataset.ts'
import type { BuildingRecord } from '../shared/buildingRecord.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const sourceId = await resolveSourceId('buildings', 'OpenStreetMap Buildings')
  if (!(await isSourceActive(sourceId))) {
    return json({ meta: { status: 'skipped', reason: 'source inactive' } })
  }

  let servedCountryCodes = await getServedCountryCodes()

  const body = await req.json().catch(() => ({}))
  const requestedCountryCode = typeof body?.countryCode === 'string' ? body.countryCode : undefined
  if (requestedCountryCode) {
    servedCountryCodes = servedCountryCodes.filter((c) => c === requestedCountryCode)
  }

  let countryRecords: Map<string, BuildingRecord[]>
  try {
    countryRecords = await fetchOsmBuildings(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    return json({ error: message }, 502)
  }

  let countriesProcessed = 0
  const countriesSkipped: string[] = []
  let featuresImported = 0
  let rejected = 0

  for (const countryCode of servedCountryCodes) {
    const records = countryRecords.get(countryCode)
    if (!records || records.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { validRecords, rejectedRecords } = partitionBuildingRecords(records, servedCountryCodes)
    rejected += rejectedRecords.length
    for (const { record, reason } of rejectedRecords) {
      await logRejectedPayload(sourceId, 'buildings', reason, {
        countryCode: record.countryCode,
        osmId: record.properties.osmId,
        facilityType: record.properties.facilityType,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { featureCount } = await writeExposureDataset(
      'osm-buildings',
      countryCode,
      'count',
      validRecords.map((record) => ({
        geometry: record.geometry,
        metricValue: 1,
        properties: record.properties,
        assetCategory: record.assetCategory,
      })),
    )
    countriesProcessed += 1
    featuresImported += featureCount
  }

  // Same "a completed run is a success even with zero features" convention
  // as import-osm-roads/import-kontur-population — only an upstream fetch
  // failure is a 'failure' outcome.
  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  return json({ countriesProcessed, countriesSkipped, featuresImported, rejected })
})
