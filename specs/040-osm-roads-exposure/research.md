# Research: OSM/Overpass Road Network Exposure Source

## §1. Why Overpass instead of the Google Roads API

Documented in this project's own partner-facing analysis
(`docs/UNDP_Toplanti_Talep_Listesi.docx` / `docs/Data_Sources_Comparison.pdf`, §C.4/§2.4) and
confirmed by UNDP at the partner meeting: Google's Roads API is (a) a paid, metered service
(~$150+/month at country-network request volumes) and (b) fundamentally a snap-to-road /
route-matching API, not designed for bulk network download at all — using it for this purpose would
be both expensive and the wrong tool. OSM/Overpass is free, key-less, and globally covers exactly
the kind of bulk "give me every road in this country" query this feature needs.

**Decision**: Use the Overpass API exclusively. No Google Roads API code path is written.

## §2. Overpass query strategy

**Decision**: Query by country using Overpass QL's `area` selector against the `ISO3166-1` tag,
e.g.:

```
[out:json][timeout:180];
area["ISO3166-1"="TR"][admin_level=2]->.searchArea;
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](area.searchArea);
);
out geom;
```

This matches the alpha-2 country codes this codebase already stores everywhere (`country_code
VARCHAR(2)`, `getServedCountryCodes()`'s return type) — no ISO2↔ISO3 conversion is needed here,
unlike Kontur's HDX `groups` filter which required `iso3166.ts` (spec 038 data-model.md §5a).
`out geom` returns each way's full coordinate geometry inline, avoiding a second query per way to
resolve node coordinates.

**Alternatives considered**:
- **Bounding-box query** (`(south,west,north,east)`) instead of an `area` filter — rejected: a
  bbox over-fetches border-adjacent roads belonging to neighboring countries, which would then need
  a separate point-in-country-boundary filter step; the `area["ISO3166-1"=...]` selector lets
  Overpass itself do this clipping, which is simpler and more correct.
- **Deriving a query polygon from `country_boundaries.geojson`** (union of that country's stored
  province polygons) — rejected for this feature: `country_boundaries` is populated per served
  country specifically for the province-level map filter (spec, not this one), and a
  polygon-in-query would be considerably larger/slower to construct and pass to Overpass than the
  built-in `ISO3166-1` area selector, which Overpass already indexes internally. Kept as a future
  fallback if `ISO3166-1` resolution is ever confirmed missing/wrong for a served country.

## §3. Road classification (which `highway` values to import)

**Decision**: Import OSM ways tagged `highway` in
`{motorway, trunk, primary, secondary, tertiary, residential, unclassified}` — the standard
vehicular road hierarchy. Exclude `footway`, `cycleway`, `path`, `steps`, `pedestrian`,
`track`, `service`, and other non-primary-network tags.

**Rationale**: This matches the granularity Impact Analysis actually needs (which parts of the
vehicular network are affected by a hazard footprint) without importing an order of magnitude more
minor-path/footpath geometry that adds import cost and map-rendering noise without added exposure
value. This is a spec-level assumption (spec.md Assumptions), not a hidden implementation choice.

**Alternatives considered**: Importing all `highway=*` values including footways/tracks — rejected
as unnecessary volume for this MVP's actual use case; can be revisited if a specific country
deployment asks for pedestrian-network exposure specifically (out of scope here).

## §4. What `metric_value` means for a road segment

`exposure_features.metric_value` is `NOT NULL DOUBLE PRECISION` (existing schema, spec 008) — every
feature needs some scalar. Population's is a population count; a road segment has no equally
obvious scalar.

**Decision**: `metric_value` = the segment's length in meters, computed from its geometry
(haversine sum over the way's coordinate pairs). `properties` JSONB carries `{ highway: <tag
value>, name: <OSM name tag, if present>, osm_id: <way id> }`.

**Rationale**: Length in meters is directly useful for Impact Analysis (e.g. "X km of primary road
within the flood footprint" is a meaningful, already-summable exposure statistic, consistent with
how `metric_value` is summed/aggregated for population), and it is derivable from the geometry
Overpass already returns — no extra query or external data needed.

**Alternatives considered**: A constant `1` per segment (count-based, "number of road segments
affected") — rejected: less useful for reporting than a length-based sum, and an arbitrary
segment-count depends on how OSM happens to have split a given road into ways, which is not a
meaningful unit on its own.

## §5. No per-country dataset-resolution step needed (unlike Kontur)

Kontur requires a per-country dataset-resolution step (spec 038's
`population_source_country_datasets` table, `resolveHdxCountryDataset.ts`) because HDX publishes
one distinct, differently-named dataset per country with no derivable URL pattern. Overpass has no
such problem: the query itself takes the country code as a parameter
(`area["ISO3166-1"="<code>"]`), so there is nothing to "resolve and persist" ahead of time — the
same generic query template works for any served country by substituting its code at request time.

**Decision**: No new resolution table. `import-osm-roads` calls `getServedCountryCodes()` directly
and issues one Overpass query per country, exactly as `fetch-earthquakes` etc. already do for their
sources — no onboarding action item equivalent to spec 038's outstanding T026a is created by this
feature.

## §6. Scheduling

**Decision**: Reuse the exact pg_cron pattern spec 038 introduced for
`import-kontur-population` (`20260715160000_kontur_population_import_cron.sql`) — a new
`trigger_osm_roads_import()` SQL function calling `import-osm-roads` via `net.http_post`, scheduled
weekly (`0 3 * * 1` or similar), matching `data_sources.poll_interval_seconds = 604800` for this
source. Road networks do not change fast enough to justify anything more frequent, and reusing the
identical cron mechanism avoids introducing a second scheduling pattern (Principle VIII).

## §7. `geometryToWkt.ts` gap: LineString/MultiLineString unsupported

**Finding**: `supabase/functions/shared/geometryToWkt.ts` currently handles only `Point`,
`Polygon`, and `MultiPolygon`; any other `geometry.type` (including `LineString`/
`MultiLineString`, which is what OSM ways are) throws `Unsupported geometry type`. This function is
shared by both the scheduled auto-import writer path (`supersedeExposureDataset.ts`) and the
manual-upload path (`upload-exposure-dataset/index.ts`) — meaning a manual GeoJSON upload of a road
or any other line-geometry layer would *already* fail today, independent of this feature.

**Decision**: Extend `geometryToWkt.ts` additively with `LineString` and `MultiLineString` cases
(`LINESTRING(...)` / `MULTILINESTRING((...), (...))`), leaving the three existing cases byte-for-
byte unchanged. Existing callers/tests are unaffected; this also incidentally fixes the
manual-upload gap for any future line-geometry dataset, which is a welcome side effect, not a scope
expansion of this feature (no new caller of the line-geometry path is added anywhere except this
feature's own writer).

**Alternatives considered**: A separate, road-specific WKT conversion function — rejected, see
plan.md's Complexity Tracking (duplication risk).

## §8. Response size / Edge Function limits — verification required at implementation time

Unlike spec 038 (which live-verified Kontur's actual Turkey file size — 90MB / 458k rows / 1.76s —
during planning), this plan does not include a live Overpass call. Turkey's primary+secondary+
residential road network is expected to be on the order of low hundreds of thousands of way
segments; Madagascar's is expected to be substantially smaller (lower road density, smaller
formal network). Both are assumed, not yet confirmed, to complete within Overpass's own
`[timeout:180]` and Supabase Edge Functions' execution limits.

**Decision (mirrors spec 038 T015's convention)**: The first implementation task for
`osmRoadsFetch.ts` MUST confirm this live against Turkey (the reference/test deployment, per this
project's established convention) before the task is considered done. If Turkey's query proves too
large for a single request, splitting by OSM's own `admin_level` boundaries (already returned by
the same Overpass instance) is the fallback — not a new dependency, but a query-shape change,
documented as a blocking finding to raise rather than silently degrading data quality (same
convention spec 038 applied to its own GeoPackage-library risk).

### §8 Addendum — live findings from implementation (2026-07-18)

Four real findings surfaced only by live-testing against Turkey, each fixed or scoped down:

1. **Country-code casing**: Overpass's `ISO3166-1` tag is uppercase (`"TR"`); this system's
   `country_code` columns (`country_boundaries`, `exposure_datasets`) are lowercase (`"tr"`) —
   verified live. A lowercase query silently fails to resolve the area (HTTP 200 with an HTML error
   body, not JSON). Fixed: `buildQuery()` uppercases the code for the Overpass filter only;
   `RoadRecord.countryCode` stays in the system's own lowercase convention. Regression-tested
   (`osmRoadsFetch.test.ts`).
2. **Full classification set is too large**: the originally planned
   `motorway|trunk|primary|secondary|tertiary|residential|unclassified` set is **1,586,530 ways**
   for Turkey — unusable in one request (compare Kontur's 458K H3 hexagons, already near this
   architecture's practical ceiling). Even `motorway|trunk|primary` alone was 85MB/36s. **Scoped
   down to `motorway|trunk` only** (the national highway network) for this MVP — live-verified at
   37,407 ways / 52MB for Turkey. Expanding coverage is future work requiring the admin-boundary
   query-splitting already flagged as deferred in plan.md's Complexity Tracking, not a silent
   limitation.
3. **Missing `User-Agent` causes HTTP 406**: Deno's default `fetch()` User-Agent is rejected by
   `overpass-api.de` with `406 Not Acceptable` (Overpass's usage policy asks for a descriptive
   User-Agent identifying the calling application). Fixed by sending an explicit `User-Agent` +
   `Accept: application/json`.
4. **Supabase's 150s Edge Function idle timeout vs. Overpass's 60-90s+ per-country query time**:
   processing multiple served countries in one invocation (the original design) reliably exceeded
   150s. **Fixed by adding an optional `{ countryCode }` request-body parameter** — `import-osm-roads`
   now processes exactly one country per invocation when given one, and
   `trigger_osm_roads_import()` (the cron migration) issues one `net.http_post` call per served
   country instead of one call for all of them (each call is independent/fire-and-forget, so this
   also strengthens FR-009's per-country isolation at the infrastructure level, not just inside the
   function).
5. **Shared-IP rate limiting / instability from Supabase's outbound egress pool**: even after fixes
   1-4, live invocation from the deployed Edge Function failed with a *different* symptom on nearly
   every attempt: `429 Too Many Requests` (one attempt, ~2.5 min before the rejection even arrived),
   `WORKER_RESOURCE_LIMIT` (one attempt, the Edge Function's own worker ran out of memory handling
   Overpass's response), and `504 Gateway Timeout` from Overpass's own front-end (two attempts, fast
   rejection, ~10s). The byte-identical query succeeded immediately and consistently from a
   non-cloud IP throughout this entire investigation (confirmed repeatedly by running the same query
   directly, including a full local run of `fetchOsmRoads(['tr'])` that returned 37,407 real
   records). Two alternate public mirrors (`overpass.kumi.systems`, `overpass.openstreetmap.ru`)
   were also tried live and were unreachable at the time of testing. **A bounded in-request retry
   was attempted and rejected**: the slowest rejection observed (429, ~2.5 min) alone can exceed the
   150s timeout, so no retry budget can be sized reliably against the range of failure modes seen.
   **Decision: no in-request retry.** A failed country is skipped (not treated as a failure, per the
   existing "zero valid is not a failure" convention) and the next weekly cron cycle's independent
   per-country invocation tries again. **The `WORKER_RESOURCE_LIMIT` finding additionally drove a
   second scope narrowing**: `HIGHWAY_FILTER` was reduced from `motorway|trunk` (37,407 ways, 52MB)
   to `motorway` only, since the Edge Function's own memory ceiling — not just Overpass's
   willingness to respond — was a real constrait once a response was large enough to actually be
   returned. This is a genuine, documented operational risk of relying on a free, shared public
   Overpass instance from a cloud platform's shared egress IP rather than a dedicated/paid endpoint
   — **flagged here as a known limitation for anyone relying on this feature for a live demo or
   production use, not silently worked around.** As of this writing, no live invocation through the
   deployed Supabase Edge Function has yet succeeded end-to-end for any country, despite the
   pipeline itself being proven fully correct via a local (non-cloud-IP) run. If reliability becomes
   a hard requirement, the mitigations are: (a) a paid/dedicated Overpass instance, (b) self-hosting
   a small Overpass mirror, or (c) an API key-based commercial alternative — all explicitly out of
   scope for this MVP feature (would need their own spec/cost decision, mirroring how Google Roads
   API's cost was handled).
