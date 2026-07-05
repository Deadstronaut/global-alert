# Contract: GDACS integration into fetch-earthquakes / fetch-wildfires / fetch-floods / fetch-droughts

**Superseded from the original design**: the original plan called for a standalone `fetch-gdacs`
Edge Function. This was revised during implementation once it became clear this app's
deduplication is an in-memory step inside each single-hazard `fetch-*` function — a standalone
function would never see the other sources' events for the same hazard type in the same batch, so
cross-source dedup (spec FR-006) would silently not work for GDACS. See research.md §6.

Not new admin-facing HTTP endpoints — this is the internal contract for how GDACS's contribution
is wired into the 4 existing `fetch-*` functions, each already documented by feature 001.

## Shared helper: `fetchGdacsFeatures()` (`shared/gdacsFetch.ts`)

```ts
function fetchGdacsFeatures(): Promise<GdacsFeature[]>
```

One HTTP GET to GDACS's public GeoJSON event-list endpoint (`AbortSignal.timeout(20_000)`,
matching the existing 20s timeout convention used elsewhere). Called independently by each of the
4 functions below — each function's own poll cycle is on a different schedule (60s/900s/300s/
3600s), so there is no single shared response to reuse across them; each call is cheap and
stateless against GDACS's public, unauthenticated endpoint.

## Shared helper: `toGdacsNormalized(hazardType, records, sourceId)` (`shared/gdacsFetch.ts`)

```ts
function toGdacsNormalized(
  hazardType: DisasterType,
  records: GdacsRawRecord[],
  sourceId: string | null,
): NormalizedEvent[]
```

Runs each record through the existing `validatePayload()`/`normalize()` pair — identical
validation/rejection handling as any other source's fetcher in this app. Invalid records call the
existing `logRejectedPayload(sourceId, hazardType, reason, raw)` exactly as any malformed record
from any other source would.

## Integration point: `fetch-earthquakes/index.ts`

- Adds a `fetchGDACS(sourceId)` function: calls `fetchGdacsFeatures()`, then `gdacsSplit()`
  (contracts below), logs any `dropped` entries (TC/VO) via `console.log`, returns
  `toGdacsNormalized('earthquake', split.earthquake, sourceId)`.
- Registered as a 5th `trackedFetch('GDACS', fetchGDACS)` alongside USGS/EMSC/AFAD/Kandilli.
- Added to the existing dedup priority order as the lowest-priority tier: `['USGS', 'EMSC',
  'AFAD', 'Kandilli', 'GDACS']` — GDACS yields to every dedicated earthquake source on conflict.
- **This is the only one of the 4 functions that logs GDACS's dropped TC/VO categories** — the
  other 3 functions also pull GDACS but skip re-logging the same drops to avoid 4x-redundant log
  noise for what is, at the HTTP-response level, the same one dropped record either way.

## Integration point: `fetch-wildfires/index.ts`

- Adds a `fetchGDACS(sourceId)` function returning `toGdacsNormalized('wildfire',
  split.wildfire, sourceId)`.
- Previously single-source (NASA FIRMS only, no dedup step existed). Now runs both fetchers via
  `Promise.allSettled`, concatenates `[NASA FIRMS, GDACS]` (NASA FIRMS first = higher priority),
  and calls the new shared `deduplicateEvents(all, 5)` (5km threshold, per TECHNICAL.md §3's
  existing wildfire dedup distance).

## Integration point: `fetch-floods/index.ts`

- Adds a `fetchGDACS(sourceId)` function returning `toGdacsNormalized('flood', split.flood,
  sourceId)`.
- Previously 2 sources (GloFAS, ReliefWeb) with **no dedup step between them** (pre-existing gap,
  not introduced by this feature). Now runs all 3 via `Promise.allSettled` and calls
  `deduplicateEvents(all, 20)` (20km threshold, per TECHNICAL.md §3's flood dedup distance) across
  all 3 — closing that pre-existing gap as a side effect of adding a 3rd source that made it more
  likely to produce visible duplicates.

## Integration point: `fetch-droughts/index.ts`

- Adds a `fetchGDACS(sourceId)` function returning `toGdacsNormalized('drought', split.drought,
  sourceId)`.
- Previously single-source (FEWS NET only, no dedup step existed). Now runs both fetchers via
  `Promise.allSettled` and calls `deduplicateEvents(all, 20)` (20km threshold, matching drought's
  existing table entry in TECHNICAL.md §3).

## Internal contract: `gdacsSplit()` (`shared/gdacsSplit.ts`)

```ts
function gdacsSplit(features: GdacsFeature[] | null | undefined): {
  earthquake: GdacsRawRecord[]
  wildfire: GdacsRawRecord[]
  flood: GdacsRawRecord[]
  drought: GdacsRawRecord[]
  dropped: { eventtype: string; reason: string; raw: unknown }[]
}
```

- Routes `eventtype: "EQ"` → `earthquake`, `"WF"` → `wildfire`, `"FL"` → `flood`,
  `"DR"` → `drought`.
- Routes `"TC"`, `"VO"`, or any other/missing value into `dropped` with a reason string.
- Never throws. Does not mutate input. Handles an empty/null/undefined `features` input.
- **Not** responsible for writing to `rejected_payloads` — TC/VO exclusions are handled by the
  calling function via `console.log` + response metadata only (see research.md §7: that table's
  `hazard_type` CHECK constraint doesn't accept values outside the 5 supported hazard types).
