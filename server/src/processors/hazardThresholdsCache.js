/**
 * TTL-based, fire-and-forget cache of the hazard_thresholds registry (spec
 * 016) for the Node.js aggregator runtime. normalizer.js calls
 * getCachedBreakpoints() synchronously; a stale/empty cache never blocks it
 * — it simply falls back to the hardcoded SEVERITY_MAP and a background
 * refresh is kicked off for next time. Mirrors
 * supabase/functions/shared/hazardThresholdsCache.ts — keep in sync.
 */

import { createClient } from '@supabase/supabase-js';

const TTL_MS = 5 * 60 * 1000;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let state = { thresholds: {}, fetchedAt: 0, refreshing: false };

/**
 * Pure — no I/O, no throw. Given the current state and a fetch outcome (row
 * array on success, null on failure/no-op), returns the next state. Exported
 * so tests can exercise the merge logic without mocking Supabase (analysis
 * finding C1, spec 016).
 */
export function applyFetchResult(current, fetchResult) {
  if (fetchResult == null) return current;
  return {
    thresholds: Object.fromEntries(fetchResult.map((row) => [row.hazard_type_code, row.breakpoints])),
    fetchedAt: Date.now(),
    refreshing: false,
  };
}

function refreshIfStale() {
  if (state.refreshing) return;
  if (Date.now() - state.fetchedAt <= TTL_MS) return;
  if (!supabaseUrl || !supabaseKey) return;
  state = { ...state, refreshing: true };

  try {
    const client = createClient(supabaseUrl, supabaseKey);
    client
      .from('hazard_thresholds')
      .select('hazard_type_code, breakpoints')
      .then(({ data, error }) => {
        state = applyFetchResult(state, error ? null : data);
        state.refreshing = false;
      })
      .catch(() => {
        state = { ...state, refreshing: false };
      });
  } catch {
    // createClient() can throw synchronously on invalid input — never let a
    // registry-access problem escape normalize()'s synchronous call path
    // (FR-002).
    state = { ...state, refreshing: false };
  }
}

/**
 * Synchronous — never awaits, never throws. Safe to call from normalize()'s
 * existing synchronous body.
 */
export function getCachedBreakpoints(hazardTypeCode) {
  refreshIfStale();
  return state.thresholds[hazardTypeCode];
}

/** Test-only hook to reset module state between test cases. */
export function __resetCacheForTest(next = {}) {
  state = { thresholds: {}, fetchedAt: 0, refreshing: false, ...next };
}
