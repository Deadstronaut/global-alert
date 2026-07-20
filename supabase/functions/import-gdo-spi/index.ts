/**
 * Edge Function: import-gdo-spi
 * Source: Global Drought Observatory, SPI GPCC (spgTS), spec 045 — see
 * gdoSpiFetch.ts's header comment for why this is GPCC, not CHIRPS.
 * Writes to: exposure_datasets / exposure_features
 *
 * One invocation per served country's WCS request (unlike GHSL's
 * single-global-file pattern) — GDO's WCS crops server-side per request, so
 * there's no shared global buffer to amortize like GHSL's.
 */
import { corsHeaders } from '../shared/cors.ts'
import { recordFetchOutcome, resolveSourceId, isSourceActive } from '../shared/sourceHealth.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { fetchGdoSpi, GDO_SPI_SOURCE_METADATA } from '../shared/gdoSpiFetch.ts'
import { writeExposureDataset } from '../shared/writeExposureDataset.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const sourceId = await resolveSourceId('drought_index', 'GDO SPI (GPCC)')
  if (!(await isSourceActive(sourceId))) {
    return json({ meta: { status: 'skipped', reason: 'source inactive' } })
  }

  const servedCountryCodes = await getServedCountryCodes()

  let countryFeatures: Awaited<ReturnType<typeof fetchGdoSpi>>
  try {
    countryFeatures = await fetchGdoSpi(servedCountryCodes)
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
      'gdo_spi',
      countryCode,
      'spi_value',
      features,
      GDO_SPI_SOURCE_METADATA,
    )
    countriesProcessed += 1
    featuresImported += featureCount
  }

  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  return json({ countriesProcessed, countriesSkipped, featuresImported })
})
