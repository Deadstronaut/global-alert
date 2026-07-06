// TTL-based, fire-and-forget cache of the hazard_thresholds registry (spec
// 016) for the Deno Edge Function runtime. normalize.ts calls
// getCachedBreakpoints() synchronously; a stale/empty cache never blocks it
// — it simply falls back to the hardcoded SEVERITY_FN map and a background
// refresh is kicked off for next time. Mirrors
// server/src/processors/hazardThresholdsCache.js — keep in sync.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

export interface Breakpoint {
  min_value: number
  severity: string
}

interface CacheState {
  thresholds: Record<string, Breakpoint[]>
  fetchedAt: number
  refreshing: boolean
}

const TTL_MS = 5 * 60 * 1000

let state: CacheState = { thresholds: {}, fetchedAt: 0, refreshing: false }

// Pure — no I/O, no throw. Given the current state and a fetch outcome
// (row array on success, null on failure/no-op), returns the next state.
// Exported so tests can exercise the merge logic without mocking Supabase
// (analysis finding C1, spec 016).
export function applyFetchResult(
  current: CacheState,
  fetchResult: Array<{ hazard_type_code: string; breakpoints: Breakpoint[] }> | null,
): CacheState {
  if (fetchResult == null) return current
  return {
    thresholds: Object.fromEntries(fetchResult.map((row) => [row.hazard_type_code, row.breakpoints])),
    fetchedAt: Date.now(),
    refreshing: false,
  }
}

function refreshIfStale(): void {
  if (state.refreshing) return
  if (Date.now() - state.fetchedAt <= TTL_MS) return
  state = { ...state, refreshing: true }

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const client = createClient(url, key)

    client
      .from('hazard_thresholds')
      .select('hazard_type_code, breakpoints')
      .then(({ data, error }: { data: Array<{ hazard_type_code: string; breakpoints: Breakpoint[] }> | null; error: unknown }) => {
        state = applyFetchResult(state, error ? null : data)
        state.refreshing = false
      })
      .catch(() => {
        state = { ...state, refreshing: false }
      })
  } catch {
    // createClient() throws synchronously if env vars are missing/invalid —
    // never let a registry-access problem escape normalize()'s synchronous
    // call path (FR-002).
    state = { ...state, refreshing: false }
  }
}

// Synchronous — never awaits, never throws. Safe to call from normalize()'s
// existing synchronous body.
export function getCachedBreakpoints(hazardTypeCode: string): Breakpoint[] | undefined {
  refreshIfStale()
  return state.thresholds[hazardTypeCode]
}

// Test-only hook to reset module state between test cases.
export function __resetCacheForTest(next?: Partial<CacheState>): void {
  state = { thresholds: {}, fetchedAt: 0, refreshing: false, ...next }
}
