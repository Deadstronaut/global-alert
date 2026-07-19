/**
 * Edge Function: import-hydrobasins
 * Source: HydroBASINS level-6 (HydroSHEDS) — spec 041
 * Writes to: exposure_datasets / exposure_features
 *
 * Mirrors import-hydrorivers/index.ts's structure exactly (see that file's
 * header comment for the shared rationale).
 */
import { corsHeaders } from '../shared/cors.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { fetchHydroBasins } from '../shared/hydroBasinsFetch.ts'
import { partitionBasinRecords } from '../shared/basinImportPartition.ts'
import { writeExposureDataset } from '../shared/writeExposureDataset.ts'
import type { BasinRecord } from '../shared/basinRecord.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const sourceId = await resolveSourceId('basins', 'HydroBASINS')
  if (!(await isSourceActive(sourceId))) {
    return json({ meta: { status: 'skipped', reason: 'source inactive' } })
  }

  let servedCountryCodes = await getServedCountryCodes()

  const body = await req.json().catch(() => ({}))
  const requestedCountryCode = typeof body?.countryCode === 'string' ? body.countryCode : undefined
  if (requestedCountryCode) {
    servedCountryCodes = servedCountryCodes.filter((c) => c === requestedCountryCode)
  }

  let countryRecords: Map<string, BasinRecord[]>
  try {
    countryRecords = await fetchHydroBasins(servedCountryCodes)
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

    const { validRecords, rejectedRecords } = partitionBasinRecords(records, servedCountryCodes)
    rejected += rejectedRecords.length
    for (const { record, reason } of rejectedRecords) {
      await logRejectedPayload(sourceId, 'basins', reason, {
        countryCode: record.countryCode,
        hybasId: record.properties.hybasId,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { featureCount } = await writeExposureDataset(
      'hydrobasins',
      countryCode,
      'area_km2',
      validRecords.map((record) => ({
        geometry: record.geometry,
        metricValue: record.areaKm2,
        properties: record.properties,
      })),
    )
    countriesProcessed += 1
    featuresImported += featureCount
  }

  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  return json({ countriesProcessed, countriesSkipped, featuresImported, rejected })
})
