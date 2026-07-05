# Phase 1 Data Model: GDACS Global Data Source

No schema changes. This feature adds **data**, not new tables or columns — 4 rows in the existing
`data_sources` table (001, extended with `country_code` by 002).

## New `data_sources` rows

| Field | Row 1 | Row 2 | Row 3 | Row 4 |
|---|---|---|---|---|
| `name` | `"GDACS"` | `"GDACS"` | `"GDACS"` | `"GDACS"` |
| `hazard_type` | `earthquake` | `wildfire` | `flood` | `drought` |
| `endpoint_url` | GDACS GeoJSON event-list API (same URL on all 4 rows — one HTTP call serves all) | | | |
| `poll_interval_seconds` | `300` (per research.md §5) | | | |
| `country_code` | `NULL` (global scope, per feature 002) | | | |
| `is_active` | `true` | | | |
| `health_state` | `healthy` (default, pending first fetch) | | | |

All other columns (`endpoint_config`, `staleness_threshold_seconds`,
`down_after_consecutive_failures`, `consecutive_failures`, `last_success_at`, `last_attempt_at`,
`created_at`, `updated_at`) use the same defaults as any existing `data_sources` row — no new
column semantics introduced (001/002's existing `data-model.md`s remain authoritative for this
table's shape).

Each row is looked up independently at runtime via the existing
`resolveSourceId('earthquake', 'GDACS')`, `resolveSourceId('wildfire', 'GDACS')`, etc. — **one
call in each of the 4 existing hazard-specific functions** (`fetch-earthquakes`, `fetch-wildfires`,
`fetch-floods`, `fetch-droughts`), not from a single standalone function (see research.md §6 for
why a standalone `fetch-gdacs` would have broken this app's per-function deduplication). Each of
the 4 functions independently calls GDACS's endpoint, resolves its own hazard type's row, and
calls `recordFetchOutcome()` for that one row based on that function's own fetch outcome —
per-category validation failures do not affect the other categories' health, since a validation
failure is a `rejected_payloads` entry, not a fetch failure.

## New transient shape: `gdacsSplit()` output

Not persisted — an in-memory intermediate produced by `supabase/functions/shared/gdacsSplit.ts`
and consumed immediately within the same Edge Function invocation:

```ts
interface GdacsSplitResult {
  earthquake: GdacsRawRecord[]
  wildfire: GdacsRawRecord[]
  flood: GdacsRawRecord[]
  drought: GdacsRawRecord[]
  dropped: { eventtype: string; reason: string; raw: unknown }[]
}
```

- `GdacsRawRecord` is whatever shape `validatePayload()`/`normalize()` already expect as input
  (matching the `raw` object shape already constructed by existing `fetch-*` functions, e.g.
  `fetch-wildfires/index.ts`'s `raw = { id, lat, lng, time, magnitude }` pattern) — extracted from
  each GeoJSON `Feature`'s `geometry.coordinates` and `properties`.
- `dropped` entries are for `eventtype` values outside `{EQ, WF, FL, DR}` (i.e. `TC`, `VO`, or any
  future/unrecognized code) — each carries a reason like `"unsupported GDACS eventtype: TC"`.
  **Not** written to `rejected_payloads`: that table's `hazard_type` column is CHECK-constrained
  to this app's 5 supported hazard types (001's schema), and TC/VO are neither — writing them
  there would violate the constraint. Instead, `fetch-earthquakes/index.ts` (the one function
  responsible for logging drops, to avoid 4x-redundant logging — see data-model.md's row above)
  logs each dropped entry via `console.log` and surfaces them in its response
  `meta.droppedCategories` array (contracts/fetch-gdacs.md §7 — corrected from the original plan
  during implementation).

## Relationships

```
data_sources (4 GDACS rows, one per hazard_type) ──< source_state_transitions   [existing FK, 001]
data_sources (4 GDACS rows)                     ──< rejected_payloads          [existing FK, 001]
```

No new relationships. No changes to `earthquake` / `wildfire` / `flood` / `drought` event tables
or their existing `country_code` (event-level) column — GDACS events are geocoded/country-tagged
by the same existing pipeline as any other source's events (out of scope for this feature, per
spec FR/Assumptions).
