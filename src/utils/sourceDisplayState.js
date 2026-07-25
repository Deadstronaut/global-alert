/**
 * Single source of truth for a data_source row's DISPLAYED health state —
 * extracted from SourceHealthCard.vue so "Duruma Göre" sorting
 * (sourceScope.js) sorts by the same state the badge actually shows, not
 * the raw DB health_state column.
 *
 * Why these can differ: health_state is only updated by the aggregator when
 * it actually attempts a fetch (server/src/processors/sourceHealth.js) — a
 * source can sit at a stale 'healthy' in the DB for days if nothing is
 * polling it. This function re-derives what the UI should actually show
 * right now, client-side, the same way SourceHealthCard.vue's stateMeta
 * computed does — see that file for the full reasoning on each override.
 *
 * States, in the order a maintainer should care about them (used directly
 * as sort priority by sourceScope.js's 'status' mode):
 *   down > offline > degraded > overdue > pending > healthy > disabled
 */
export const DISPLAY_STATE_PRIORITY = {
  down: 0,
  offline: 1,
  degraded: 2,
  overdue: 3,
  pending: 4,
  healthy: 5,
  disabled: 6,
}

export function computeDisplayState(source, now = Date.now()) {
  const raw = source.health_state
  if (raw !== 'healthy') return raw ?? 'disabled'
  if (!source.is_active) return raw

  const neverRun = !source.last_success_at
  if (neverRun) return source.automation_kind === 'manual' ? 'healthy' : 'pending'

  if (source.automation_kind === 'manual') return 'healthy' // no cadence to violate, never stale

  const staleThresholdMs = (source.staleness_threshold_seconds ?? (source.poll_interval_seconds ?? 3600) * 3) * 1000
  const isStale = now - new Date(source.last_success_at).getTime() > staleThresholdMs
  if (!isStale) return 'healthy'

  return source.automation_kind === 'continuous' ? 'offline' : 'overdue'
}
