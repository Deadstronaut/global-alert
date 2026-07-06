# Contract: Hazard Thresholds Cache (per-runtime, internal)

Internal module contract, mirrored independently in both runtimes (consistent with `normalize.ts`/`normalizer.js`'s
existing "keep in sync" convention). Not a public HTTP API.

## Shape (TypeScript; the JS/Node port is behaviorally identical, untyped)

```ts
export interface Breakpoint {
  min_value: number
  severity: string
}

interface CacheState {
  thresholds: Record<string, Breakpoint[]>
  fetchedAt: number
  refreshing: boolean
}

// Synchronous — never awaits, never throws. Safe to call from normalize()'s
// existing synchronous body.
export function getCachedBreakpoints(hazardTypeCode: string): Breakpoint[] | undefined

// PURE, exported, unit-testable without any network/Supabase mocking
// (analysis finding C1): given the current cache state and the outcome of a
// fetch attempt (an array of rows on success, or null on failure), returns
// the next cache state. Success replaces thresholds/fetchedAt; failure or
// null returns the input state completely unchanged (this is what test case
// 4 — "refresh failure preserves cache" — actually exercises).
export function applyFetchResult(
  current: CacheState,
  fetchResult: Array<{ hazard_type_code: string; breakpoints: Breakpoint[] }> | null,
): CacheState

// Called internally by getCachedBreakpoints() when the cache is stale; not
// intended to be called directly by normalize() or by tests. Fire-and-forget:
// awaits the real Supabase client call, then hands the outcome to
// applyFetchResult() — this function itself is the only untested part of the
// module (a thin, un-mocked async wrapper), since applyFetchResult() already
// carries 100% of the interesting logic in a pure, testable form.
function refreshIfStale(): void
```

## Behavioral Contract

1. `getCachedBreakpoints(code)` MUST NEVER throw and MUST NEVER return a Promise — it is a synchronous lookup only,
   so every existing synchronous call site of `normalize()` in both runtimes continues to work unmodified.
2. `getCachedBreakpoints(code)` returns the last successfully fetched breakpoints array for `code`, or `undefined`
   if the registry has never been successfully fetched, or if `code` has no entry in the registry (hazard type not
   yet customized by any admin).
3. Callers (`normalize()` in both runtimes) MUST treat an `undefined` result as "use the existing hardcoded
   fallback for this hazard type" — never as an error condition, never as "default to a fixed severity."
4. A background refresh is triggered opportunistically (on a stale cache read), at most once concurrently
   (`refreshing` guard prevents overlapping fetches), and never blocks the caller that triggered it.
5. A failed background refresh leaves the existing cache (however stale) in place; it does NOT clear or reset it.
   Only a *successful* fetch replaces `thresholds`/updates `fetchedAt`.

## Test Cases (see `normalize.test.ts` / `normalizer.test.js`)

| # | Scenario | Expected `getCachedBreakpoints()` behavior |
|---|---|---|
| 1 | Registry never fetched yet | Returns `undefined` for every hazard type — caller falls back to hardcoded |
| 2 | Registry fetched successfully, hazard type present | Returns that hazard type's breakpoints array |
| 3 | Registry fetched successfully, hazard type absent (not customized) | Returns `undefined` for that hazard type — caller falls back to hardcoded |
| 4 | `applyFetchResult(populatedState, null)` (simulated fetch failure — pure, no network mocking needed per analysis finding C1) | Returns `populatedState` unchanged; previously cached breakpoints remain available |
| 5 | `normalize()` computing severity with a customized threshold | Uses the registry's breakpoints, not the hardcoded map |
| 6 | `normalize()` computing severity with an uncustomized hazard type | Uses the existing hardcoded map — byte-for-byte same result as before this feature |

## Backward Compatibility Guarantee

For any hazard type with no row in `hazard_thresholds` (i.e., every hazard type as of today, before any admin
customizes one), `normalize()`'s output is byte-for-byte identical to its pre-feature behavior in both runtimes.
This is the testable form of FR-003/SC-002.
