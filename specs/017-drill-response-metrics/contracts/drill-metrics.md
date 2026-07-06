# Contract: Drill Metrics Pure Functions

Internal function contract (`supabase/functions/shared/drillMetrics.ts`), not a public HTTP API.

## Shape

```ts
export function computeResponseTimeSeconds(startedAt: string, firstAlertAt: string | null): number | null

export function computeAckRate(
  sent: number,
  acknowledged: number,
): { sent: number; acknowledged: number } | null
```

## Behavioral Contract

1. `computeResponseTimeSeconds(startedAt, null)` MUST return `null` (FR-002 — no exercise alert issued means no
   response occurred, never a fabricated `0`).
2. `computeResponseTimeSeconds(startedAt, firstAlertAt)` MUST return the non-negative number of whole seconds
   between the two timestamps when `firstAlertAt` is provided.
3. `computeAckRate(0, 0)` MUST return `null` (FR-005 — no dispatches were sent, so a rate is undefined, never a
   misleading `0%`).
4. `computeAckRate(sent, acknowledged)` for `sent > 0` MUST return `{ sent, acknowledged }` unchanged — the
   function does not compute a percentage itself, leaving presentation (e.g. "3 / 5" vs "60%") to the caller.

## Test Cases (see `drillMetrics.test.ts`)

| # | Input | Expected |
|---|---|---|
| 1 | `computeResponseTimeSeconds('2026-07-06T10:00:00Z', null)` | `null` |
| 2 | `computeResponseTimeSeconds('2026-07-06T10:00:00Z', '2026-07-06T10:05:00Z')` | `300` |
| 3 | `computeAckRate(0, 0)` | `null` |
| 4 | `computeAckRate(5, 3)` | `{ sent: 5, acknowledged: 3 }` |
| 5 | `computeAckRate(5, 0)` | `{ sent: 5, acknowledged: 0 }` (zero acknowledgments is a valid, displayable rate — distinct from case 3's "no data at all") |

## Backward Compatibility

N/A — these are new functions with no prior behavior to preserve; `drill_sessions.summary`'s existing
`duration_min`/`alerts_issued`/`ended_at` keys are untouched, only new keys are added alongside them.
