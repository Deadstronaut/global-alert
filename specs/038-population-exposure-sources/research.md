# Phase 0 Research: Population Exposure Data Sources

## 1. Where does a new "population source" fit — `data_sources`/hazard events, or `map_layers`, or `exposure_features`?

**Decision**: `exposure_features` (spec 008/023/034's existing exposure model), fed by new scheduled
Edge Functions, with health tracked via the *existing* `data_sources` table (Kalıp A's health
machinery, reused — not its hazard-event storage).

**Rationale**: Three existing "consume external data" patterns exist in this codebase:
- `data_sources` + `fetch-*` → writes to per-hazard-type **event** tables (earthquake, flood, ...).
  Wrong shape: population is not a discrete event with a magnitude/time, it's a standing area
  measurement.
- `map_layers` (spec 012, WMS/WFS) → live client-rendered raster/vector tiles, nothing persisted,
  no health/state machine, "consume only." Wrong fit: these four sources return downloadable
  datasets (GeoJSON/CSV/hex grids), not a tile server this app can point MapLibre at directly, and
  Impact Analysis (spec 008) needs queryable rows with a `metric_value`, not a rendered layer.
  Explicitly out of scope for this feature (see spec Assumptions) — CHIRPS/soil-moisture/FAPAR are
  the better `map_layers` candidates for a future spec, not population.
- `exposure_features` (spec 008/023/034) → exactly the shape needed: one row per cell/hex with a
  geometry + a single numeric value (`metric_value`) + free JSONB (`properties`). Already used by
  the Impact Analysis Wizard, zonal stats RPCs, and sector/boundary breakdowns without modification.

**Alternatives considered**: A brand-new `population_grids` table — rejected per Principle VIII
(Simplicity/YAGNI): `exposure_features` already satisfies every requirement in this spec with zero
schema change, and a parallel table would fragment Impact Analysis into two data paths for no
functional gain.

## 2. How does a population source register for health/failure monitoring without a hazard-event table?

**Decision**: Reuse `data_sources` + `sourceHealth.ts` unchanged (`resolveSourceId`,
`isSourceActive`, `recordFetchOutcome`, `logRejectedPayload`), by adding `'population'` as a new
allowed `hazard_type` value via a CHECK-constraint-widening migration — the same technique already
used by the in-flight `20260709000000_data_sources_tier1_source_type.sql` migration, which widened
`data_sources.hazard_type`/`rejected_payloads.hazard_type` to add `'tsunami'`, `'epidemic'`, and
`'multi_hazard'` for sources that don't map to one of the original 5 disaster hazard types either.

**Rationale**: `hazard_type` on `data_sources` is documented (by the Tier-1 migration's own
comments) as "a primary/informational label," not something that must literally denote a disaster
hazard — `multi_hazard` already establishes that precedent. Adding `'population'` lets every
existing health-tracking function (`resolveSourceId('population', 'Kontur Population')`,
`recordFetchOutcome`, `logRejectedPayload(sourceId, 'population', ...)`) work with **zero code
changes** to `sourceHealth.ts`, matching Principle VIII. The alternative — a parallel
`exposure_sources` health table — would duplicate the entire state machine, transitions table, and
RLS policies for no behavioral difference.

**Alternatives considered**:
- New `exposure_sources` table mirroring `data_sources` — rejected: pure duplication, doubles the
  surface area to test/maintain for identical behavior (Principle VIII).
- Overload an existing `hazard_type` value (e.g. `'food_security'`) — rejected: actively
  misleading in the Sources view and in `rejected_payloads` audit records.

## 3. What does a "fetch outcome" mean for a dataset that updates monthly/yearly, not in real time?

**Decision**: `recordFetchOutcome` is called once per source per **import run** (not per HTTP
request within a run) — success if the run completed and persisted at least one dataset/feature
set (even if zero countries had new data that cycle, mirroring the existing "zero records is not a
failure" convention from feature 001), failure if the upstream API/download could not be reached or
returned an unparseable response for the whole run.

**Rationale**: Matches the existing convention exactly (GDACS treats "feed returned zero in-scope
events" as success, not failure — spec 003 US2, Scenario 3). `staleness_threshold_seconds` (already
a column on `data_sources`) is set far higher for these sources than for hazard feeds (e.g. weeks,
not minutes) to reflect real update cadence, exactly as FEWS NET/WHO already do today (6h/30min poll
intervals vs. 15s for earthquakes) — no new column or mechanism needed.

**Alternatives considered**: Per-HTTP-call outcome tracking (one `recordFetchOutcome` per
paginated API request) — rejected: adds noise to `source_state_transitions` without adding
signal; a single logical import run is the unit of "is this source working," consistent with how
existing multi-record-fetching sources (USGS, NASA FIRMS) already treat one poll cycle as one
outcome regardless of how many individual records it contained.

## 4. Upstream API/access shape per source — verified live during planning

**Decision**: Treat Kontur Population and Meta Population as two independent sources accessed
through HDX's public CKAN Action API (`data.humdata.org/api/3/action/...`); treat GHSL as a source
accessed via its own direct data-download endpoint (`human-settlement.emergency.copernicus.eu`),
not HDX. **WorldPop is excluded from this feature** — see the finding below.

**Rationale / live verification**: Unlike the original planning pass (where `data.humdata.org` and
GHSL's endpoint were unreachable via this session's WebFetch tool), direct `curl` access worked and
was used to fetch real responses, following the same "verify, don't assume" discipline spec 003
used for GDACS:

- `GET https://data.humdata.org/api/3/action/package_show?id=kontur-population-madagascar` —
  returned a real CKAN package. **Finding**: every resource is `"format": "Geopackage"`
  (`.gpkg.gz`) — a SQLite-based OGC binary format, not GeoJSON/CSV. This is a materially different
  shape than assumed; see data-model.md's new "GeoPackage reading" section for the resulting
  dependency decision.
- `GET .../package_search?fq=organization:kontur+AND+groups:tur&rows=5` — confirmed Turkey's
  equivalent package exists (`kontur-population-turkiye`), same GeoPackage format, different slug
  (no derivable URL pattern between countries — confirms §4a's per-country resolution need was
  correctly identified, even though the resolution *mechanism* below changed).
- `GET .../package_search?fq=groups:tur&q=worldpop+population&rows=3` — **Finding**: WorldPop's
  Turkey packages (`worldpop-population-density-for-turkiye` etc.) offer **GeoTIFF only** — no
  CSV/GeoJSON/vector resource of any kind. This is the "only raw GeoTIFF, no vector extract"
  scenario the original research explicitly flagged as a stop-and-raise condition (§6, unchanged
  below). **WorldPop is therefore removed from this feature's scope** (see spec.md's Amendment,
  plan.md's Summary, data-model.md §5b) rather than silently adding raster-processing to unblock it.
- `GET .../package_search?fq=groups:tur&q=meta+population+density&rows=3` — **Finding**: Meta's
  packages offer both GeoTIFF and `CSV` (zipped) resources — the CSV option is used, avoiding both
  the binary-GeoPackage cost (Kontur) and the raster-only dead end (WorldPop).
- GHSL's data-download endpoint (`human-settlement.emergency.copernicus.eu/ghs_pop.php`) responded
  successfully (`HTTP 200`) but its exact tile/query parameter shape was not further inspected in
  this pass — still flagged as a task-time verification item (unchanged from the original caveat),
  since GHSL's basic reachability, not its full API shape, was the open question this pass needed
  to resolve first.

**Alternatives considered**: Continuing to plan on the original (pre-verification) assumption that
all three HDX sources offer a simple vector/tabular extract — rejected once live data contradicted
it for two of the three sources; proceeding on unverified assumptions here would have produced
implementation tasks (T014/T018 for WorldPop) that were fundamentally not buildable as scoped.

## 4a. Per-country dataset resolution — verified live, mechanism revised twice

**Decision**: Kontur/Meta are published on HDX as one dataset page **per country** (confirmed live
in §4 above — Madagascar's and Turkey's Kontur packages have unrelated slugs). This is resolved via
the `population_source_country_datasets` table (data-model.md §5), but — revising the *first*
revision of this decision — rows are populated by an **automatic, one-time HDX search at country
onboarding** (data-model.md §5a), not by manual admin entry.

**Why the mechanism changed twice**:
1. Original plan (pre-verification): assumed HDX search wasn't reliable enough, planned for manual
   admin-entered mapping rows.
2. First revision (this review): live-verified that HDX's `groups` field (ISO3 country code, e.g.
   `tur`, `mdg`) is a **structured, controlled-vocabulary filter**, not free-text matching —
   `fq=organization:kontur+AND+groups:tur` reliably returned exactly Turkey's Kontur package in a
   live test. This meant the original "HDX search isn't reliable" premise was itself wrong, and a
   fully live, per-import HDX query became a real option — genuinely zero-config.
3. Second revision (final): a fully live, per-import-cycle HDX query was still rejected in favor of
   resolving once at onboarding and persisting the result, because (a) it adds a second external
   dependency to every scheduled run, (b) search results/ranking are not guaranteed stable over
   time as HDX's catalog grows, so the same query could silently resolve to a different dataset on
   a later run — unacceptable for humanitarian-decision-feeding data (Principle IV), and (c) a
   persisted, auditable reference (data-model.md §5a) is easier to reason about than a
   black-box live search re-run on every cycle. The *discovery* step is now fully automatic/generic
   (no manual URL-hunting, unlike the original plan), while the *result* is stable and auditable
   (unlike a fully live per-import query) — combining the strengths of both earlier positions.

**GHSL is the exception and needs no such table**: it is addressed by global tile grid + bounding
box, not per-country pages. `ghslFetch.ts` derives the bounding box from `country_boundaries`
(§4a in data-model.md), so GHSL works for any newly onboarded country with zero configuration —
the closest of the three remaining sources to the "truly generic" ideal.

**Alternatives considered**: Live per-import HDX search (rejected, point 3 above); manual-only
admin entry with no automatic discovery (rejected, point 2 above — unnecessarily manual once the
`groups` filter was confirmed reliable); hardcoding each known country's dataset ID directly into
`konturFetch.ts`/`metaHdxFetch.ts` source code — rejected throughout as the literal anti-pattern
this feature exists to avoid (Principle I: hazard/exposure sources are data, not code).

## 5. Import scheduling for sources that update monthly/yearly, given this app's client-driven polling

**Decision**: Follow the existing client-driven polling convention (`src/services/api/config.js`'s
`EDGE_FUNCTIONS`/`POLLING_INTERVALS`, invoked while the app is open), with import intervals set to
match each source's real update cadence (e.g. days, not minutes) — consistent with Principle VII
(polling MUST be differentiated by real-world update cadence).

**Rationale**: This app has no server-side cron today (confirmed: no `supabase/migrations/*cron*`,
no pg_cron usage) — every existing source, including the slowest (FEWS NET at 6h), is polled this
way. Introducing pg_cron or an external scheduler for population sources alone would violate
Principle VIII (Simplicity/YAGNI: "do not introduce additional services... until the Supabase-native
approach has been shown insufficient"). The practical implication (import may lag if no admin
session is open for an extended period) is acceptable for datasets that only change monthly/yearly
and is explicitly called out in the spec's Assumptions section.

**Alternatives considered**: Supabase's built-in `pg_cron` extension (server-side, doesn't need a
browser tab open) — a reasonable future improvement, but out of scope here: adopting it would be a
cross-cutting infrastructure change affecting all sources, not something to introduce silently
inside a single Tier-1 feature; if pursued, it should be its own spec per Principle VIII's
Complexity Tracking requirement.

## 6. Geometry types these sources are expected to produce

**Decision**: Reuse the existing `geometryToWkt()` converter in `upload-exposure-dataset/index.ts`
(Point/Polygon/MultiPolygon) as-is for the new scheduled importers; if a source is confirmed during
implementation to require a geometry type not yet supported (e.g. raster-derived MultiPoint grids),
extend that shared converter rather than writing a second one.

**Rationale**: Kontur Population is documented (per the client's own PDF) as H3 hexagons
(Polygons); WorldPop/GHSL/Meta population grids are commonly distributed as raster (GeoTIFF) but
also commonly redistributed as point-per-cell or small-polygon vector extracts on HDX — both
Point and Polygon are already supported by the existing converter. Extracting `geometryToWkt` into
`supabase/functions/shared/` (currently private to `upload-exposure-dataset`) so the new scheduled
functions can import it is the only refactor this decision requires.

**Alternatives considered**: Writing raw-raster (GeoTIFF) ingestion — explicitly rejected: none of
the four sources' HDX-hosted or GHSL-downloadable products *require* raw raster processing to get a
per-cell population value; if a source turns out to only offer raw GeoTIFF with no vector
extract during implementation-time verification (§4), that is a blocking finding to raise before
proceeding with that one source, not a reason to add a raster-processing dependency speculatively
now.
