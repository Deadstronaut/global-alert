# Phase 1 Data Model: Population Exposure Data Sources

## Schema changes

### 1. Widen `data_sources.hazard_type` / `rejected_payloads.hazard_type` CHECK

One migration, additive only (no data loss, no existing row touched):

```sql
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population'
  ));
```

Must be written to layer on top of (not conflict with) the in-flight
`20260709000000_data_sources_tier1_source_type.sql` migration's own widening — this feature's
migration file must have a later timestamp and re-state the full allowed set (Postgres `CHECK`
constraints aren't additive across migrations; each `ADD CONSTRAINT` replaces the prior one).

### 2. New `data_sources` rows (seed, not a schema change)

| `name` | `hazard_type` | `country_code` | `poll_interval_seconds` | `staleness_threshold_seconds` |
|---|---|---|---|---|
| `Kontur Population` | `population` | `NULL` | e.g. `604800` (7d) | e.g. `2592000` (30d) |
| `GHSL` | `population` | `NULL` | e.g. `2592000` (30d) | e.g. `7776000` (90d) |

**WorldPop is not seeded — deferred out of this feature entirely, see §5b. Meta/HDX Population is
also not seeded — deferred, see §5c (discovered during implementation: 18.6M rows per country,
same underlying problem as WorldPop).** Two sources, not four, ship in this feature.

Exact interval values are a seed-migration detail to finalize in `tasks.md`, not a spec-level
decision — they must reflect each source's real publish cadence (research.md §4 verification
caveat applies here too: confirm actual update frequency before finalizing).

Each row is looked up via the existing `resolveSourceId('population', 'Kontur Population')` etc. —
same mechanism as every other source, no new lookup path.

### 3. No changes to `exposure_datasets` / `exposure_features`

Existing columns are sufficient:

- `exposure_datasets.name` — e.g. `"Kontur Population — Turkey — 2026-07"` (source + country +
  import batch, so re-imports are traceable and superseded datasets can be identified/cleaned up).
- `exposure_datasets.metric_property_name` — fixed value `"population"` for both sources.
- `exposure_datasets.country_code` — the ISO country code this import batch covers (one dataset
  per source per country per import run, mirroring the existing one-country-per-dataset shape used
  by manual uploads).
- `exposure_datasets.org_id` — `NULL` (auto-imported datasets aren't organization-scoped; visible
  to `country_admin`/`super_admin` per existing RLS, same as any dataset with `org_id IS NULL` and
  matching `country_code`).
- `exposure_datasets.created_by` — `NULL` (system-imported, not created by a human `auth.users`
  row); existing FK is nullable (`ON DELETE SET NULL`), so this requires no schema change.
- `exposure_features.metric_value` — population count for that cell/hex.
- `exposure_features.properties` — free JSONB carrying source-specific metadata (e.g. `{"source":
  "kontur", "year": 2023, "h3_cell": "..."}` for Kontur, or GHSL's own tile/year metadata) so
  provenance survives per feature, not just per dataset.

### 4. Supersession behavior (FR-007)

**Decision**: On a successful re-import for a given `(source, country)` pair, the previous
`exposure_datasets` row (and its `exposure_features`, via existing `ON DELETE CASCADE`) for that
same `(source, country)` combination is deleted **after** the new dataset+features insert commits
successfully — never before, so a failed re-import leaves the prior data intact rather than
leaving a country with no population data at all.

**Identification of "the previous dataset for this source/country"**: since `exposure_datasets`
has no explicit `source_name` column, this feature adds a JSONB tag on the dataset itself rather
than a new dedicated column, reusing `exposure_datasets`' existing free-text `description` field
convention is not queryable enough — **this is the one place a small additive column is justified**:

```sql
ALTER TABLE exposure_datasets ADD COLUMN IF NOT EXISTS source_name TEXT;
CREATE INDEX IF NOT EXISTS idx_exposure_datasets_source_country
  ON exposure_datasets (source_name, country_code) WHERE source_name IS NOT NULL;
```

`source_name` is `NULL` for manually uploaded datasets (unaffected, no migration needed for
existing rows) and set to `'kontur' | 'ghsl'` for auto-imported ones (unenforced by a CHECK — free
text — so future WorldPop/Meta features can reuse this same column without a migration), giving
the importer a queryable way to find "the dataset(s) this same source previously created for this
country" without scanning `description` text.

### 4a. "Served countries" — precise, DB-derived definition (no hardcoded list)

**Decision**: "Served countries" (referenced throughout spec.md/contracts as `servedCountryCodes`)
means `SELECT DISTINCT country_code FROM country_boundaries` — the same table this system already
populates per-country during onboarding (e.g. `20260706220000_seed_tr_country_boundary.sql`
inserts Turkey's row). This is queried live by each import function at runtime, not read from
`src/data/boundaries/*.json` (a frontend-bundled static file, not reachable from a Deno Edge
Function, and itself an example of the exact per-country-file anti-pattern this feature must avoid
repeating).

**Rationale**: No "list of countries this deployment serves" table/config existed before this
review — it was previously only *implicit* in which static boundary JSON files happened to be
committed to the frontend. `country_boundaries` is already the DB-backed, onboarding-time-populated
equivalent, and is exactly what `ghslFetch.ts` (§5 below) already needs to query for bounding
boxes — reusing it as the single source of truth for "which countries do we serve" avoids
introducing a second, possibly-inconsistent registry.

**Alternatives considered**: A new `served_countries` table — rejected, pure duplication of
`country_boundaries`, which already answers the same question (a country has a boundary seeded
if and only if it's been onboarded). Deriving it from `profiles.country_code` (distinct values of
registered admins) — rejected: a country could be onboarded (boundary seeded, sources configured)
before its first admin account is created, so this would undercount.

### 5. Per-country dataset resolution — `population_source_country_datasets` (new table, additive)

**Problem this fixes**: Kontur is published on HDX as **one dataset page per country** (e.g. the
client's example links are literally titled "Madagascar: ..."; verified live during planning —
Kontur's Turkey equivalent is `kontur-population-turkiye`, a different slug entirely, confirming no
fixed URL pattern can be assumed). A fetch module hardcoded to one country's dataset URL would only
ever work for that country. This must be a **per-country config value**, not a code change or a
per-import-cycle live lookup, to keep this product genuinely country-agnostic (Principle I) — the
same way `dynamicSources.js`'s `endpoint_config.field_map` already lets any country register its
own local source without a code change.

```sql
CREATE TABLE IF NOT EXISTS population_source_country_datasets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name        TEXT NOT NULL CHECK (source_name IN ('kontur', 'meta_hdx')), -- 'meta_hdx' reserved, unused (see §5c)
  country_code       VARCHAR(2) NOT NULL,
  dataset_reference  TEXT NOT NULL, -- HDX package ID (result.id from package_search/package_show)
  resolved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by        TEXT NOT NULL DEFAULT 'hdx_search', -- 'hdx_search' (automatic) | a user id (manual override)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_name, country_code)
);
```

**`worldpop` is intentionally absent from this CHECK, and from this feature's scope entirely** —
see §5b. **`meta_hdx` is present in the CHECK but unused by this feature** — Meta/HDX Population
was removed from scope during implementation (§5c) after Kontur/Meta's shared HDX-per-country
lookup mechanism was already designed and built; the CHECK value is left in place (harmless, unused)
rather than removed and re-added later, since a future feature solving Meta's aggregation problem
would need it back anyway.

#### 5a. How rows get populated — one-time onboarding resolution, not a per-import live query

**Decision** (revised after live verification during planning — see research.md §4a): rows are
populated by a **one-time, explicitly-triggered resolution step at country onboarding**, not by
querying HDX on every scheduled import run.

```ts
// supabase/functions/shared/resolveHdxCountryDataset.ts
async function resolveHdxCountryDataset(
  sourceOrg: 'kontur' | 'meta',       // HDX organization name (verified live: Kontur's org is
                                        // literally "kontur"). 'meta' kept in the type for a
                                        // future feature — this feature only ever calls it with
                                        // 'kontur' (Meta/HDX Population is deferred, §5c).
  countryIso3Lower: string,            // e.g. 'tur', 'mdg' — matches HDX's `groups[].name`
): Promise<{ datasetId: string; title: string } | null>
```

Calls `https://data.humdata.org/api/3/action/package_search?fq=organization:<sourceOrg>+AND+groups:<countryIso3Lower>&rows=5`
(verified live during planning — this structured `groups` filter, backed by HDX's own ISO3 country
tagging, reliably narrows to that country's dataset(s); confirmed working for both Madagascar
(`groups:mdg`) and Turkey (`groups:tur`) against the real HDX API). If exactly one relevant result
is found, its `result.id` is written to `population_source_country_datasets.dataset_reference`
with `resolved_by: 'hdx_search'`. If zero or multiple ambiguous results are found, no row is
written — this is surfaced to whoever is running onboarding (super_admin) as "could not
auto-resolve `<source>` for `<country>`, needs manual entry," not silently guessed (Principle IV —
reject rather than guess, especially for humanitarian-decision-feeding data).

**Why one-time-at-onboarding, not live-every-import**: A live per-import HDX search was considered
and has real appeal (truly zero persisted config, always fresh). It was rejected for three reasons:
(1) it adds a second external dependency (HDX's search endpoint, not just the actual data host) to
every scheduled run, so an HDX outage would break imports even if the underlying data file is still
directly downloadable; (2) search relevance/ranking is not guaranteed stable over time as HDX's
catalog grows, so the exact same query could silently resolve to a different dataset on different
runs — unacceptable for data feeding humanitarian decisions (Principle IV); (3) it's harder to
audit — "which exact dataset are we using for Madagascar's Kontur population" should be answerable
by reading one DB row, not by re-running a search and hoping it reproduces. A one-time resolution,
written once into that country's own isolated config (never a shared/cross-country table — see
§5's RLS), keeps the *discovery* fully automatic/generic (no manual URL-hunting) while keeping the
*result* stable, auditable, and consistent with this project's federated, country-isolated
architecture (each country's resolved reference lives only in that country's own deployment).

**Re-resolution**: an admin (or a periodic low-frequency check, out of scope for this feature) can
re-run `resolveHdxCountryDataset` to pick up a new HDX release; this only ever updates that one
country's own row, never affects other countries.

#### 5b. WorldPop — deferred, not part of this feature

**Decision**: WorldPop is removed from this feature's scope. Verified live during planning: every
WorldPop resource on its Turkey HDX page (`worldpop-population-density-for-turkiye` and siblings)
is GeoTIFF-only — no CSV/GeoJSON/vector extract exists. Ingesting it would require a raster
(GeoTIFF) processing dependency, which research.md §6 explicitly flagged as a blocking finding
requiring a stop, not a speculative added dependency (Principle VIII). WorldPop is left for a
future, separately-scoped feature that can properly evaluate a GeoTIFF-reading approach (e.g.
sampling pixel values via a WASM GeoTIFF reader) on its own merits, rather than folding
raster-processing complexity into this feature's "no new heavy dependencies" scope.

#### 5c. Meta/HDX Population — also deferred, discovered during implementation

**Decision**: Meta/HDX Population is removed from this feature's scope. Verified live during
implementation (not planning — this was found after starting to write `metaHdxFetch.ts`): Meta's
per-country CSV resource is raw, near-30m-resolution point-grid data. Turkey's
`population_turkey_2020_csv.zip` alone is 134MB compressed, ~1.1GB uncompressed, **18.6 million
rows** (`longitude,latitude,population_2020` — verified by downloading and inspecting the real
file). This is not feasible to download/decompress/parse within an Edge Function's resource limits,
and even if it were, writing 18.6M individual `exposure_features` rows per country is far outside
this table's intended scale (compare Kontur's Turkey package: ~400m H3 hexagons, orders of
magnitude fewer rows, already pre-aggregated by Kontur before publishing).

**Why this differs from the WorldPop decision, and why it wasn't caught during planning**: Meta's
*format* (CSV) looked simple during the planning-time HDX metadata check (research.md §4 only
inspected `format: "CSV"` and resource names, not actual file size/row count — the metadata
response doesn't expose that). The *volume* problem only surfaced once the actual file was
downloaded during implementation. This is the same underlying issue as WorldPop (raw
grid-resolution source data, not pre-aggregated to a database-appropriate resolution) wearing a
different, superficially-easier file format — confirming that "vector/tabular vs. raster" was the
wrong axis to filter sources on; "pre-aggregated to a reasonable feature count vs. raw grid
resolution" is the real distinguishing factor, and only Kontur (of the four originally requested
sources) clearly satisfies it.

**Alternatives considered**: Spatially aggregating Meta's raw points into H3 hexagons or
admin-boundary sums before writing to `exposure_features` (mirroring what Kontur already does
upstream) — a real option for a future feature, but rejected for *this* feature: it requires a new
streaming-CSV-parse + spatial-binning capability this feature's scope did not budget for, and
folding it in now would repeat the exact "silently add complexity to unblock a source" pattern
research.md §6 already ruled out for WorldPop's raster case.

- Each `<source>Fetch.ts` (for Kontur only — see GHSL note below) looks up this table for
  `(source_name, countryCode)` before fetching the actual data file; if no row exists for a served
  country, that country is skipped for that source (not an error — same "no data available for
  this country/source" convention already in spec.md's Edge Cases). A missing row can be filled
  either by re-running `resolveHdxCountryDataset` (§5a, automatic) or, if auto-resolution fails
  (zero/ambiguous matches), by a manual insert during that country's onboarding.
- **GHSL is exempt from this table**: unlike the two HDX-hosted sources, GHSL is published as
  global tiles addressable by bounding box, not one page per country. `ghslFetch.ts` derives the
  bounding box directly from `country_boundaries` (§4a), so GHSL needs **zero** per-country
  configuration — genuinely the most "jenerik" of the three sources in this feature.

**RLS — deliberately NOT modeled on `data_sources`'s public-read policy**:

```sql
ALTER TABLE population_source_country_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_population_source_datasets_all" ON population_source_country_datasets
  FOR ALL USING (current_profile_role() = 'super_admin');

CREATE POLICY "country_admin_population_source_datasets_own" ON population_source_country_datasets
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );
```

**Why this differs from `data_sources`'s existing `USING (true)` public-read policy**: `data_sources`
rows (endpoint URL, poll interval) were judged "non-sensitive config metadata" per that table's own
migration comment, and that's still true for the *global* sources (GDACS, USGS, and this feature's
own Kontur/GHSL `data_sources` rows). But `population_source_country_datasets` rows are, by construction, one row
per **country**, and while today's `dataset_reference` values point at already-public HDX pages
(not secret in themselves), this table is also the natural landing place for any future
per-country reference that is NOT public (e.g. a self-hosted deployment's private internal data
endpoint). Rather than re-litigate sensitivity per-source later, this table defaults to the
strictest existing pattern already used for actual country data (`exposure_datasets`'s
country-scoped RLS) from day one — no country's admin can see another country's row, even in the
shared MVP instance, and this holds regardless of whether a given row's content turns out to be
public or private. This is a direct, deliberate response to the product's federated,
per-country-deployment model — see the project's country-scoping architecture decision: each
country is intended to run its own isolated instance in production, and no cross-country
visibility should exist even incidentally, especially for anything that could later reveal
sensitive local conditions (food security status, informal settlement locations) a government
may not want surfaced to other countries or the public.

## New shared helper: `geometryToWkt` extraction

Move `geometryToWkt()` (currently private to `supabase/functions/upload-exposure-dataset/index.ts`)
into `supabase/functions/shared/geometryToWkt.ts`, imported by both the existing upload function
(behavior-preserving refactor, covered by its existing tests) and the new scheduled import
functions. No signature change.

## New dependency: GeoPackage reading, for Kontur only

**Decision**: Kontur's HDX resources are GeoPackage (`.gpkg.gz`) — verified live during planning
(both Madagascar's and Turkey's Kontur population packages return `format: "Geopackage"` for every
resource, no GeoJSON/CSV alternative exists). GeoPackage is SQLite with geometry columns (OGC
standard), not parseable with this codebase's existing JSON-only fetch patterns. This requires a
new dependency: a pure-JS/WASM GeoPackage reader usable from Deno (e.g. `@ngageoint/geopackage`, or
an equivalent sql.js-based reader), imported only by `konturFetch.ts`, not by any other module in
this feature.

**Rationale**: Unlike WorldPop (§5b, deferred), Kontur's format, while binary, is a well-defined,
widely-supported OGC standard with existing JS tooling — this is a bounded, one-time integration
cost, not an open-ended raster-processing effort. Kontur's H3-hexagon data is also the
best-documented and highest-quality of the three sources per the client's own dataset description
(fused GHSL + Meta HRSL + Microsoft Buildings + OSM, UN-population-adjusted), justifying the added
dependency.

**Verification required at implementation time** (per research.md's "verify, don't assume"
convention): confirm the chosen GeoPackage library actually runs inside a Deno Edge Function's
resource/time limits against a real ~20-30MB `.gpkg.gz` file (both Madagascar's and Turkey's
packages are in that range) before committing to this approach for all Kontur imports — if it does
not fit Edge Function constraints, this is a second blocking finding requiring a follow-up decision
(e.g. offloading Kontur's parsing to a different execution context), not a reason to silently
degrade data quality.

## New transient shape: normalized population record (per source, in-memory only)

```ts
interface PopulationRecord {
  geometry: { type: 'Point' | 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  population: number
  countryCode: string
  properties: Record<string, unknown> // source-specific extras, passed through to exposure_features.properties
}
```

Each source's fetch module (`konturFetch.ts`, `ghslFetch.ts`)
is responsible for producing an array of these from its own upstream shape; a single shared
`validatePopulationRecord()` (new, in `supabase/functions/shared/`) enforces FR-004 (valid geometry,
non-negative numeric population, country in the served-country list) before any row reaches
`exposure_features`, rejecting invalid ones via `logRejectedPayload(sourceId, 'population', ...)`.
