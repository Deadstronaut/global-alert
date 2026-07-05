/**
 * data_sources health state machine — JS port of
 * supabase/functions/shared/sourceHealth.ts's computeNextState(), kept in sync
 * so the Admin panel's Source Health Dashboard reflects Aggregator-fetched
 * custom sources exactly like it does the Edge-Function-fetched tier-1 ones.
 * States: healthy | degraded | down | disabled
 */

import { getSupabaseClient } from '../output/supabaseWriter.js';

export function computeNextState({
  currentState,
  consecutiveFailures,
  outcome, // 'success' | 'failure'
  downAfterConsecutiveFailures,
  isStale,
}) {
  if (currentState === 'disabled') {
    return { state: 'disabled', consecutiveFailures, transitioned: false, reason: 'source is disabled' };
  }

  if (outcome === 'success' && !isStale) {
    const wasUnhealthy = currentState !== 'healthy';
    return {
      state: 'healthy',
      consecutiveFailures: 0,
      transitioned: wasUnhealthy,
      reason: wasUnhealthy ? 'fetch succeeded after outage' : 'fetch succeeded',
    };
  }

  if (outcome === 'success' && isStale) {
    return {
      state: 'degraded',
      consecutiveFailures,
      transitioned: currentState === 'healthy',
      reason: 'data exceeded staleness threshold',
    };
  }

  const nextFailures = consecutiveFailures + 1;
  if (nextFailures >= downAfterConsecutiveFailures) {
    return {
      state: 'down',
      consecutiveFailures: nextFailures,
      transitioned: currentState !== 'down',
      reason: `${nextFailures} consecutive failures`,
    };
  }

  return {
    state: 'degraded',
    consecutiveFailures: nextFailures,
    transitioned: currentState === 'healthy',
    reason: 'fetch failed',
  };
}

/**
 * Records a fetch attempt against a data_sources row: updates counters/state
 * and appends a source_state_transitions row if the state actually changed.
 * source: the full data_sources row (must include health_state, consecutive_failures,
 * poll_interval_seconds, staleness_threshold_seconds, down_after_consecutive_failures).
 */
export async function recordFetchOutcome(source, outcome, detail) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const now = Date.now();
  const staleThreshold = (source.staleness_threshold_seconds ?? source.poll_interval_seconds * 3) * 1000;
  const isStale = outcome === 'success' && source.last_success_at
    ? (now - new Date(source.last_success_at).getTime()) > staleThreshold
    : false;

  const result = computeNextState({
    currentState: source.health_state,
    consecutiveFailures: source.consecutive_failures,
    outcome,
    downAfterConsecutiveFailures: source.down_after_consecutive_failures,
    isStale,
  });

  const updates = {
    health_state: result.state,
    consecutive_failures: result.consecutiveFailures,
    last_attempt_at: new Date(now).toISOString(),
  };
  if (outcome === 'success') updates.last_success_at = new Date(now).toISOString();

  await supabase.from('data_sources').update(updates).eq('id', source.id);

  if (result.transitioned) {
    await supabase.from('source_state_transitions').insert({
      source_id: source.id,
      previous_state: source.health_state,
      new_state: result.state,
      reason: detail ? `${result.reason}: ${detail}` : result.reason,
    });
  }
}

export async function logRejectedPayload(sourceId, hazardType, validationError, recordExcerpt) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.from('rejected_payloads').insert({
    source_id: sourceId,
    hazard_type: hazardType,
    validation_error: validationError,
    record_excerpt: recordExcerpt ?? {},
  });
}
