/**
 * Source health state machine + audit-write helpers.
 * States: healthy | degraded | down | disabled (data-model.md state diagram).
 */

import { getServiceClient } from './upsert.ts'

export type SourceHealthState = 'healthy' | 'degraded' | 'down' | 'disabled'
export type FetchOutcome = 'success' | 'failure'

interface DataSourceRow {
  id: string
  health_state: SourceHealthState
  consecutive_failures: number
  poll_interval_seconds: number
  staleness_threshold_seconds: number | null
  down_after_consecutive_failures: number
  last_success_at: string | null
  is_active: boolean
}

interface ComputeInput {
  currentState: SourceHealthState
  consecutiveFailures: number
  outcome: FetchOutcome
  downAfterConsecutiveFailures: number
  isStale: boolean
}

interface ComputeResult {
  state: SourceHealthState
  consecutiveFailures: number
  transitioned: boolean
  reason: string
}

/**
 * Pure decision function — no I/O — so the state machine can be unit tested
 * without a live database (see sourceHealth.test.ts).
 */
export function computeNextState(input: ComputeInput): ComputeResult {
  const { currentState, consecutiveFailures, outcome, downAfterConsecutiveFailures, isStale } = input

  // Disabled sources are only ever changed by explicit admin action (setSourceActive),
  // never by fetch outcomes.
  if (currentState === 'disabled') {
    return { state: 'disabled', consecutiveFailures, transitioned: false, reason: 'source is disabled' }
  }

  if (outcome === 'success' && !isStale) {
    const wasUnhealthy = currentState !== 'healthy'
    return {
      state: 'healthy',
      consecutiveFailures: 0,
      transitioned: wasUnhealthy,
      reason: wasUnhealthy ? 'fetch succeeded after outage' : 'fetch succeeded',
    }
  }

  if (outcome === 'success' && isStale) {
    // Fetch itself succeeded, but data is stale beyond threshold (e.g. upstream quiet too long).
    const transitioned = currentState === 'healthy'
    return {
      state: 'degraded',
      consecutiveFailures,
      transitioned,
      reason: 'data exceeded staleness threshold',
    }
  }

  // outcome === 'failure'
  const nextFailures = consecutiveFailures + 1
  if (nextFailures >= downAfterConsecutiveFailures) {
    const transitioned = currentState !== 'down'
    return {
      state: 'down',
      consecutiveFailures: nextFailures,
      transitioned,
      reason: `${nextFailures} consecutive failures`,
    }
  }

  const transitioned = currentState === 'healthy'
  return {
    state: 'degraded',
    consecutiveFailures: nextFailures,
    transitioned,
    reason: 'fetch failed',
  }
}

async function writeTransition(
  sourceId: string,
  previousState: SourceHealthState,
  newState: SourceHealthState,
  reason: string,
  changedBy?: string,
) {
  const supabase = getServiceClient()
  await supabase.from('source_state_transitions').insert({
    source_id: sourceId,
    previous_state: previousState,
    new_state: newState,
    reason,
    changed_by: changedBy ?? null,
  })
}

/**
 * Resolves a data_sources.id by (hazard_type, name), for fetch-* functions that
 * identify their upstream sources by name (e.g. 'USGS', 'NASA FIRMS (VIIRS)').
 * Returns null (never throws) if no matching row exists yet — callers should
 * skip health/audit recording gracefully rather than fail the fetch itself,
 * since a source may not be registered in data_sources until seeded (quickstart.md §2).
 */
export async function resolveSourceId(hazardType: string, name: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('data_sources')
    .select('id')
    .eq('hazard_type', hazardType)
    .eq('name', name)
    .maybeSingle()

  if (error || !data) return null
  return data.id
}

/**
 * Returns false only if the source is explicitly registered and inactive.
 * Unregistered sources (sourceId null) are treated as active — they aren't
 * managed via data_sources yet, so no admin has had a chance to disable them.
 */
export async function isSourceActive(sourceId: string | null): Promise<boolean> {
  if (!sourceId) return true
  const supabase = getServiceClient()
  const { data } = await supabase.from('data_sources').select('is_active').eq('id', sourceId).maybeSingle()
  return data?.is_active !== false
}

/**
 * Called by every fetch-* function after each fetch attempt (success or failure)
 * for the data_sources row corresponding to that upstream source.
 */
export async function recordFetchOutcome(
  sourceId: string,
  outcome: FetchOutcome,
  detail?: string,
): Promise<void> {
  const supabase = getServiceClient()
  const { data: source, error } = await supabase
    .from('data_sources')
    .select('*')
    .eq('id', sourceId)
    .single<DataSourceRow>()

  if (error || !source) {
    console.error(`[sourceHealth] source not found: ${sourceId}`, error?.message)
    return
  }

  if (!source.is_active || source.health_state === 'disabled') {
    // Disabled sources should not be polled at all; if this is reached, no-op defensively.
    return
  }

  const now = Date.now()
  const stalenessThreshold =
    source.staleness_threshold_seconds ?? source.poll_interval_seconds * 3
  const isStale =
    outcome === 'success' &&
    source.last_success_at != null &&
    now - new Date(source.last_success_at).getTime() > stalenessThreshold * 1000

  const next = computeNextState({
    currentState: source.health_state,
    consecutiveFailures: source.consecutive_failures,
    outcome,
    downAfterConsecutiveFailures: source.down_after_consecutive_failures,
    isStale,
  })

  const updates: Record<string, unknown> = {
    health_state: next.state,
    consecutive_failures: next.consecutiveFailures,
    last_attempt_at: new Date().toISOString(),
  }
  if (outcome === 'success') {
    updates.last_success_at = new Date().toISOString()
  }

  await supabase.from('data_sources').update(updates).eq('id', sourceId)

  if (next.transitioned) {
    await writeTransition(sourceId, source.health_state, next.state, detail ?? next.reason)
  }
}

/**
 * Called by manage-data-sources on explicit admin enable/disable action.
 */
export async function setSourceActive(
  sourceId: string,
  isActive: boolean,
  changedBy: string,
): Promise<void> {
  const supabase = getServiceClient()
  const { data: source, error } = await supabase
    .from('data_sources')
    .select('*')
    .eq('id', sourceId)
    .single<DataSourceRow>()

  if (error || !source) {
    throw new Error(`source not found: ${sourceId}`)
  }

  const newState: SourceHealthState = isActive ? 'healthy' : 'disabled'
  if (newState === source.health_state) return

  await supabase
    .from('data_sources')
    .update({
      is_active: isActive,
      health_state: newState,
      consecutive_failures: 0,
    })
    .eq('id', sourceId)

  await writeTransition(
    sourceId,
    source.health_state,
    newState,
    isActive ? `manually re-enabled by ${changedBy}` : `manually disabled by ${changedBy}`,
    changedBy,
  )
}

/**
 * Writes a rejected-payload audit row (used by fetch-* functions via validatePayload()).
 */
export async function logRejectedPayload(
  sourceId: string | null,
  hazardType: string,
  validationError: string,
  recordExcerpt: unknown,
): Promise<void> {
  const supabase = getServiceClient()
  await supabase.from('rejected_payloads').insert({
    source_id: sourceId,
    hazard_type: hazardType,
    validation_error: validationError,
    record_excerpt: recordExcerpt ?? {},
  })
}
