# Phase 0 Research: GDACS Global Data Source

## 1. Actual GDACS API shape (verified, not assumed)

**Decision**: Use GDACS's public GeoJSON REST endpoint (`gdacsapi/api/events/geteventlist/...`),
not its RSS feed.

**Rationale**: Fetched and inspected both live. The RSS feed (`gdacs.org/xml/rss.xml`) uses a
custom XML namespace (`gdacs:`, `geo:`) requiring an XML parser dependency this Deno codebase
doesn't currently have. The GeoJSON API returns a standard `FeatureCollection` — parseable with
`res.json()` exactly like every existing `fetch-*` function already does (USGS, NASA FIRMS), with
no new parsing dependency. Verified response shape:

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [lng, lat] },
  "properties": {
    "eventtype": "EQ",
    "eventid": 1548668,
    "name": "Earthquake in Philippines",
    "alertlevel": "Orange",
    "country": "Philippines",
    "fromdate": "2026-06-26T11:34:41",
    "severitydata": { "severity": 6.5, "severitytext": "Magnitude 6.5M, Depth:42km" }
  }
}
```

**Alternatives considered**: RSS feed — rejected (needs an XML parser); a hypothetical
per-hazard-type GDACS endpoint — GDACS does not offer one; its API is inherently multi-hazard
per request, which directly drives this plan's "4 rows fed by 1 HTTP call" design.

## 2. Confirmed event type coverage

**Decision**: GDACS's `eventtype` values are `EQ` (earthquake), `TC` (tropical cyclone), `FL`
(flood), `VO` (volcano), `DR` (drought), `WF` (wildfire) — verified directly against the live API,
not assumed from the original feature request (which listed earthquake/tropical cyclone/flood/
volcano/drought but did not mention wildfire).

**Rationale**: This is a correction to the initial spec draft — `WF` (wildfire) **is** present in
GDACS's data and **is** one of this app's 5 existing hazard types, so it is in-scope alongside
earthquake/flood/drought. `TC` and `VO` have no corresponding `hazard_type` in this app and remain
excluded per spec Assumptions (Constitution Principle I — new hazard types are a deliberate,
separate decision, not a source-driven side effect).

**Alternatives considered**: Assuming the original request's category list without verification —
rejected; would have silently dropped legitimate wildfire coverage this app already models.

## 3. One row per source vs. one row per (source × hazard type)

**Decision**: Register GDACS as **4 `data_sources` rows** — `{name: "GDACS", hazard_type:
"earthquake"}`, `{name: "GDACS", hazard_type: "wildfire"}`, `{name: "GDACS", hazard_type:
"flood"}`, `{name: "GDACS", hazard_type: "drought"}` — all with `country_code = NULL`.

**Rationale**: `resolveSourceId(hazardType, name)` (`supabase/functions/shared/sourceHealth.ts`)
already looks up a row by the pair `(hazard_type, name)` — this is the existing mechanism for
"one source, multiple rows" today, just used in the opposite direction (existing sources like
USGS/EMSC/AFAD/Kandilli are 4 different *names* sharing one `hazard_type`; GDACS is one *name*
spanning 4 different `hazard_type`s). No schema change, no new lookup mechanism — reusing the
existing composite key exactly as designed satisfies Constitution Principle VIII.

Per-hazard-type health tracking also gives more useful operator signal than one merged row would:
if GDACS's earthquake data specifically starts failing validation while its flood data is fine,
an aggregated single row would hide that; 4 independent rows surface it directly in the existing
Sources tab with zero new UI code (001/002's Global group already renders arbitrary rows).

**Alternatives considered**: One `data_sources` row for "GDACS" as a whole with a new
multi-hazard-type column (e.g. `hazard_types TEXT[]`) — rejected: would require changing the
`hazard_type` CHECK constraint's shape for every existing row too, a much larger schema change for
no operational benefit, and violates Constitution Principle VIII (smallest change).

## 4. Splitting/normalization logic placement

**Decision**: A new pure function `gdacsSplit(features)` in
`supabase/functions/shared/gdacsSplit.ts`, returning
`{ earthquake: RawRecord[], wildfire: RawRecord[], flood: RawRecord[], drought: RawRecord[],
dropped: { eventtype: string, reason: string }[] }`, called once by `fetch-gdacs/index.ts` before
any `validatePayload()`/`normalize()` call.

**Rationale**: Keeps `fetch-gdacs/index.ts` structurally identical to every existing `fetch-*`
function (fetch → per-record validate → normalize → upsert → recordFetchOutcome), with the
GDACS-specific "which bucket does this record belong to" concern isolated in one small, unit-
testable function — mirroring how `validatePayload.ts`/`sourceHealth.ts` are already separated
from each `fetch-*` function's HTTP-specific logic.

**Alternatives considered**: Inlining the split logic directly in `fetch-gdacs/index.ts` —
rejected only because a dedicated Deno test for the split/drop behavior (spec US2, the
higher-risk story) is cheap and valuable, and the existing codebase convention already extracts
shared, testable pieces into `supabase/functions/shared/`.

## 5. Polling interval

**Decision**: Poll GDACS every 5 minutes (300s), matching the existing flood-source cadence
(GloFAS/ReliefWeb) rather than the fastest (earthquake, 60s) or slowest (drought, 3600s) existing
interval.

**Rationale**: GDACS is a secondary/supplementary source layered on top of existing dedicated
per-hazard sources (USGS for earthquake, NASA FIRMS for wildfire, GloFAS/ReliefWeb for flood,
FEWS NET for drought) — it does not need to match the fastest dedicated source's cadence to add
value, and a single shared interval avoids the complexity of running 4 different poll schedules
against one endpoint (which would multiply GDACS's own request load for no benefit, since one
call already returns all 4 categories' current data regardless of how often it's called).

**Alternatives considered**: Matching each hazard type's own dedicated interval — rejected;
would mean re-fetching the same GDACS response up to 4x more often than needed just to satisfy
the fastest category (earthquake, 60s), with no additional data freshness benefit since GDACS
itself doesn't update that quickly internally.

## 6. Standalone `fetch-gdacs` function vs. integration into the 4 existing functions

**Decision (revised during implementation)**: Do **not** create a standalone `fetch-gdacs`
Edge Function. Instead, each of the 4 existing single-hazard functions (`fetch-earthquakes`,
`fetch-wildfires`, `fetch-floods`, `fetch-droughts`) independently calls GDACS's endpoint and
folds its own hazard type's bucket into that function's existing multi-source batch before
deduplication.

**Rationale**: This app's deduplication (Constitution Principle IV) is implemented as an
**in-memory step inside each single-hazard `fetch-*` function** — e.g. `fetch-earthquakes`
collects USGS + EMSC + AFAD + Kandilli into one array, deduplicates across them, then calls
`upsertEvents()` once. A standalone `fetch-gdacs` function is a separate Edge Function
invocation with no shared memory or coordination with `fetch-earthquakes`'s own invocation — the
same real-world earthquake reported by both USGS and GDACS would never be compared against each
other, directly violating spec FR-006/SC ("the same real-world event reported by multiple
sources is not stored more than once"). This was the original plan's design (see the initial
Phase 1 draft, since revised) and was caught before merging by re-examining how
`deduplicate()`/`upsertEvents()` actually work together in the existing code, not just how the
`data_sources`/health-tracking layer works.

**Alternatives considered**: Keep `fetch-gdacs` standalone and accept the dedup gap, documenting
it as a known limitation — rejected; the spec explicitly requires dedup parity (FR-006), and the
fix (calling GDACS from within each existing function instead of a new one) is not meaningfully
more complex than the rejected alternative, so there was no good reason to ship a known
correctness gap when the correct design was equally simple.

**Consequence**: `fetch-wildfires` and `fetch-droughts` had exactly one source each before this
feature and therefore never needed a dedup step; adding GDACS as their second source makes one
necessary for the first time. `fetch-floods` already had two sources (GloFAS, ReliefWeb) with
**no** dedup step between them (a pre-existing gap, not introduced by this feature) — adding
GDACS as a third source made this gap more likely to produce visible duplicates, so a dedup pass
was added for all three flood sources as part of this feature, using the same distance/time-window
approach already used by `fetch-earthquakes`, extracted into a new shared
`supabase/functions/shared/dedup.ts` so the logic isn't duplicated three more times.

## 7. `rejected_payloads` cannot hold TC/VO exclusions

**Decision (revised during implementation)**: Dropped GDACS categories (TC, VO, or any
unrecognized `eventtype`) are **not** written to the `rejected_payloads` table. They are logged
via `console.log` inside whichever function processes them (only `fetch-earthquakes`, to avoid
4x-redundant logging across all 4 functions) and surfaced in that function's JSON response under
`meta.droppedCategories`.

**Rationale**: `rejected_payloads.hazard_type` carries a `CHECK (hazard_type IN ('earthquake',
'wildfire', 'flood', 'drought', 'food_security'))` constraint from feature 001's migration. TC and
VO are not in that set — inserting a row with either value, or a placeholder like `'unknown'`,
would violate the constraint and fail the insert. This was the original contract's design (an
earlier draft called `logRejectedPayload(null, 'unknown', ...)`) and was caught while writing the
actual insert call, by cross-checking the constraint in `20260703..._data_sources.sql` before
assuming the helper would accept an arbitrary string.

**Alternatives considered**: Widening the `rejected_payloads.hazard_type` CHECK constraint to
also accept an `'unsupported'`/`'other'` sentinel — rejected as a larger, schema-level change for
a secondary audit-trail nicety, when structured logging + response metadata already satisfies
spec FR-004's actual requirement ("recorded with a reason") without touching an existing
constraint (Constitution Principle VIII).
