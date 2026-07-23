/**
 * Generic client for the Copernicus Early Warning Data Store (EWDS) REST
 * API — the replacement for the retired globalfloods.eu JSON API (see
 * NEW_GAME_PLAN.md §4.2). This is a thin, source-agnostic wrapper over the
 * OGC API - Processes standard EWDS is built on (confirmed live 2026-07-22
 * against https://ewds.climate.copernicus.eu/api/retrieve/v1/openapi.json)
 * — not specific to GloFAS, so any other EWDS dataset (fire danger,
 * seasonal forecasts, etc.) can reuse this without a new client.
 *
 * Auth: a `PRIVATE-TOKEN` request header carrying a free Personal Access
 * Token from an EWDS account (register + generate at
 * https://ewds.climate.copernicus.eu, no special approval needed) — this
 * is NOT a Bearer token or Basic auth, confirmed from the live OpenAPI
 * spec's parameter definitions (`{"name":"PRIVATE-TOKEN","in":"header", ...
 * "description":"API key."}`), not guessed from the Python cdsapi client's
 * abstraction.
 *
 * Flow (OGC API - Processes "async-execute", the only jobControlOption
 * every EWDS process advertises): submit -> poll -> fetch results -> the
 * caller downloads the returned asset href itself. Jobs are NOT instant —
 * live-verified GloFAS's own process description gives no SLA, live GloFAS
 * job runs are commonly minutes, not seconds, so this is unsuitable for a
 * synchronous request/response Edge Function; a caller polling every few
 * minutes from a persistent process (this repo's server/ aggregator, or a
 * dedicated container — see rasterToHexogonFile.ts's container precedent)
 * is the right shape, not a single Edge Function invocation.
 */

const EWDS_BASE_URL = 'https://ewds.climate.copernicus.eu/api/retrieve/v1'

export type EwdsJobStatus = 'accepted' | 'running' | 'successful' | 'failed' | 'rejected' | 'dismissed'

export interface EwdsAsset {
  type: string
  href: string
  'file:checksum': string
  'file:size': number
  'file:local_path': string
}

function authHeaders(apiKey: string): Record<string, string> {
  return { 'PRIVATE-TOKEN': apiKey, 'Content-Type': 'application/json' }
}

/**
 * Submits a job for one EWDS dataset ("process" in OGC terms, e.g.
 * `cems-glofas-forecast`) and returns its job ID. `inputs` must match that
 * process's own input schema (GET /processes/{processId} describes it) —
 * this function does no per-dataset validation, matching this repo's
 * existing "generic pipeline + per-source config" convention
 * (rasterSourceConfig.ts).
 */
export async function submitEwdsJob(
  processId: string,
  inputs: Record<string, unknown>,
  apiKey: string,
): Promise<string> {
  const res = await fetch(`${EWDS_BASE_URL}/processes/${processId}/execution`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ inputs }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EWDS job submission failed for ${processId}: HTTP ${res.status} ${body}`)
  }
  const data = await res.json()
  const jobId = data.jobID ?? data.jobId
  if (!jobId) throw new Error(`EWDS job submission for ${processId} returned no jobID: ${JSON.stringify(data)}`)
  return jobId
}

export async function getEwdsJobStatus(jobId: string, apiKey: string): Promise<EwdsJobStatus> {
  const res = await fetch(`${EWDS_BASE_URL}/jobs/${jobId}`, { headers: authHeaders(apiKey) })
  if (!res.ok) throw new Error(`EWDS job status check failed for ${jobId}: HTTP ${res.status}`)
  const data = await res.json()
  return data.status as EwdsJobStatus
}

/**
 * Polls until the job leaves accepted/running. Throws on failed/rejected/
 * dismissed rather than returning a status the caller has to remember to
 * check — a silently-ignored failed job is worse than a thrown error here.
 */
export async function waitForEwdsJob(
  jobId: string,
  apiKey: string,
  { pollIntervalMs = 30_000, timeoutMs = 30 * 60_000 }: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    const status = await getEwdsJobStatus(jobId, apiKey)
    if (status === 'successful') return
    if (status === 'failed' || status === 'rejected' || status === 'dismissed') {
      throw new Error(`EWDS job ${jobId} ended in status "${status}"`)
    }
    if (Date.now() > deadline) throw new Error(`EWDS job ${jobId} did not finish within ${timeoutMs}ms (last status "${status}")`)
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}

/** Returns the single downloadable asset for a finished job (per the "asset" output every GloFAS process declares). */
export async function getEwdsJobAsset(jobId: string, apiKey: string): Promise<EwdsAsset> {
  const res = await fetch(`${EWDS_BASE_URL}/jobs/${jobId}/results`, { headers: authHeaders(apiKey) })
  if (!res.ok) throw new Error(`EWDS results fetch failed for ${jobId}: HTTP ${res.status}`)
  const data = await res.json()
  const asset = data.asset?.value
  if (!asset?.href) throw new Error(`EWDS job ${jobId} results had no asset.value.href: ${JSON.stringify(data)}`)
  return asset as EwdsAsset
}

/** Downloads a finished job's asset to a local path (container-facing — matches rasterToHexagonFile.ts's disk-based convention, not an in-memory buffer, since GloFAS files can be large). */
export async function downloadEwdsAsset(asset: EwdsAsset, destPath: string): Promise<void> {
  const res = await fetch(asset.href)
  if (!res.ok || !res.body) throw new Error(`Failed to download EWDS asset from ${asset.href}: HTTP ${res.status}`)
  const file = await Deno.open(destPath, { write: true, create: true, truncate: true })
  await res.body.pipeTo(file.writable)
}
