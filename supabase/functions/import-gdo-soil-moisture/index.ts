/**
 * Edge Function: import-gdo-soil-moisture
 * Source: Global Drought Observatory, Ensemble Soil Moisture Anomaly
 * (smand) — spec 047 pivot, see gdoAnomalyFetch.ts's header comment.
 * Writes to: exposure_datasets / exposure_features
 *
 * One invocation per served country's WCS request (server-side cropped,
 * no shared global buffer to amortize) — same pattern as import-gdo-spi.
 */
import { corsHeaders } from '../shared/cors.ts'
import { recordFetchOutcome, resolveSourceId, isSourceActive } from '../shared/sourceHealth.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { fetchGdoAnomaly, GDO_SOIL_MOISTURE_ANOMALY_CONFIG } from '../shared/gdoAnomalyFetch.ts'
import { writeExposureDataset } from '../shared/writeExposureDataset.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const sourceId = await resolveSourceId('soil_moisture_anomaly', 'GDO Soil Moisture Anomaly')
  if (!(await isSourceActive(sourceId))) {
    return json({ meta: { status: 'skipped', reason: 'source inactive' } })
  }

  const servedCountryCodes = await getServedCountryCodes()

  let countryFeatures: Awaited<ReturnType<typeof fetchGdoAnomaly>>
  try {
    countryFeatures = await fetchGdoAnomaly(GDO_SOIL_MOISTURE_ANOMALY_CONFIG, servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    return json({ error: message }, 502)
  }

  let countriesProcessed = 0
  const countriesSkipped: string[] = []
  let featuresImported = 0

  for (const countryCode of servedCountryCodes) {
    const features = countryFeatures.get(countryCode)
    if (!features || features.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { featureCount } = await writeExposureDataset(
      GDO_SOIL_MOISTURE_ANOMALY_CONFIG.sourceName,
      countryCode,
      GDO_SOIL_MOISTURE_ANOMALY_CONFIG.metricPropertyName,
      features,
      GDO_SOIL_MOISTURE_ANOMALY_CONFIG.sourceMetadata,
    )
    countriesProcessed += 1
    featuresImported += featureCount
  }

  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  return json({ countriesProcessed, countriesSkipped, featuresImported })
})
