# Phase 0 Research: Risk & Scenario Modeling

## 1. Where does historical hazard event data actually live?

**Finding**: Verified by reading `supabase/functions/shared/upsert.ts` and
`supabase/migrations/20260603120100_country_code.sql`. Every ingested hazard event is upserted
(`onConflict: 'id'`) into a per-hazard-type table — `earthquake`, `wildfire`, `flood`, `drought`,
`food_security`, `tsunami`, `cyclone`, `volcano`, `epidemic`, `disaster` — each with columns
`id, type, lat, lng, h3_id, severity, magnitude, depth, title, description, time, source, source_url,
extra, received_at, country_code`, indexed on `(country_code, time DESC)`. Rows are never pruned, so
these tables already accumulate real historical frequency/severity data per country over time — this
was initially assumed to require a new archive table (per the spec's FR-006 assumption), but it does
not.

**Decision**: Reuse these 9 tables directly as the Hazard-factor and exceedance-curve data source. No
new event-history table.

**Alternative rejected**: A dedicated `hazard_event_history` archive table populated by a new trigger/
copy step on every ingest — rejected as pure duplication of data that already persists correctly.

## 2. How to query "historical events for hazard type X in area Y" across 9 differently-named tables

**Finding**: No unified cross-type view exists today (only per-type `_view`s like `earthquake_view`,
each scoped to its own table).

**Decision**: Add one additive `hazard_event_history_view` (`UNION ALL` across the 9 tables, projecting
a common `hazard_type, lat, lng, severity, magnitude, time, country_code` shape) — the same low-risk
pattern already used for each existing per-type `_view`, just spanning all of them. This is the single
query surface the Hazard-factor RPC and the exceedance-curve Edge Function both read from.

**Alternative rejected**: Querying all 9 tables separately from the Edge Function and merging in
application code — rejected as needless duplication of filtering/aggregation logic across 9 call sites
for no benefit over one SQL view.

## 3. How is "administrative area" represented today?

**Finding**: `country_boundaries` (spec: `20260705_country_boundaries.sql`) stores one GeoJSON
`FeatureCollection` per country, with a configurable `name_property` identifying each feature (region/
province). Separately, spec 034 (`impact_analysis_gaps`) already established the working convention for
"administrative area" as a flat `admin_boundary_code` TEXT tag directly on `exposure_features` rows
(see `compute_boundary_breakdown`), not a spatial-polygon-containment query against the boundary
GeoJSON.

**Decision**: Reuse the exact same `admin_boundary_code` convention for every new per-area computation
in this module (Vulnerability indicators, Coping Capacity indicators, composite risk scores, scenario
overlays) — this makes "administrative area" a plain string key already consistent across Exposure
(spec 008/034), Population (spec 038, if tagged), and this module, with no new boundary-matching logic
required. `hazard_event_history_view` rows are matched to an area via `ST_Within` against that area's
polygon geometry (looked up once from `country_boundaries.geojson` by matching `name_property` to
`admin_boundary_code`) — the one place a real spatial polygon join is unavoidable, since raw hazard
events only carry lat/lng, not a pre-assigned area code.

**Alternative rejected**: Introducing a new normalized `administrative_areas` table (id, country_code,
name, geometry) — rejected as a parallel boundary representation duplicating `country_boundaries`,
violating Principle VIII; the existing GeoJSON-per-country model is sufficient for the one join this
module needs.

## 4. Composite score computation: Postgres RPC vs. Edge Function

**Finding**: Every existing "compute X within an area" capability in this codebase
(`compute_zonal_stats`, `compute_sector_breakdown`, `compute_boundary_breakdown`,
`compute_data_completeness`) is a `STABLE SQL` Postgres function, called directly from the frontend via
`supabase.rpc(...)`, with no Edge Function in the loop. This keeps the computation next to the data
(no round-trip, no duplicate spatial logic in Deno).

**Decision**: Follow the same pattern. Composite risk score computation (Hazard, Exposure, Vulnerability,
Lack of Coping Capacity, and their weighted product) is implemented as Postgres SQL/PL-pgSQL functions,
called via RPC. Only the two genuinely non-SQL-native pieces run in Edge Functions:
hazard-footprint simulation (US3 — deterministic formula evaluation, closer to `hazardBuffer.js`'s
existing client-side logic, but needed server-side too if scenarios are to be saved/reproduced
consistently regardless of client) and Monte Carlo exceedance-curve sampling (US4 — iterative random
sampling, awkward in pure SQL, natural in TypeScript).

**Alternative rejected**: Doing all four factor computations in an Edge Function that fetches raw rows
and aggregates in TypeScript — rejected as a duplicate of what Postgres already does more efficiently
and consistently with the rest of the impact-analysis surface.

## 5. Deterministic hazard-footprint formulas

**Finding**: `src/lib/hazardBuffer.js` already implements `defaultBufferRadiusKm(event)` — a per-hazard-
type strategy table (magnitude-derived for earthquake, severity-lookup for others), used by spec 008's
Impact Panel. This is a real, working precedent for "deterministic, hazard-type-specific, extensible
footprint formula," just simpler (radius-only, not full parametric footprint).

**Decision**: For launch scope (per spec Assumptions), extend this exact same strategy-table pattern in
a new server-side (Deno) module for scenario simulation — starting with earthquake (reusing the
identical magnitude-derived radius formula, so a scenario and a real event of the same magnitude produce
the same footprint) — and explicitly stub other hazard types as "not yet available" (FR-010) rather than
inventing unvalidated formulas for cyclone (Holland wind-profile) or flood (DEM-based) in this same pass.
Those are flagged as separately-justified follow-on work per the spec's Assumptions, each requiring its
own physical-formula research pass before being added to the strategy table.

**Alternative rejected**: Implementing all three formula families (earthquake/cyclone/flood) in this one
feature — rejected as scope inflation beyond what could be verified/justified in this pass; matches the
project's own established discipline (spec 038's WorldPop/Meta/GHSL cuts) of shipping only what was
actually verified rather than assumed.

## 6. Reproducible Monte Carlo sampling

**Finding**: No random-sampling utility exists yet anywhere in the codebase.

**Decision**: Use a small seeded PRNG (a ~10-line mulberry32-style function, inlined — no dependency)
so a given area/hazard-type/seed always reproduces the identical exceedance curve (spec SC-... /
Edge Cases: "reproducible" was a stated requirement). Sampling method: bootstrap resampling from that
area's actual historical severity records (drawn from `hazard_event_history_view`), not a fitted
parametric distribution — avoids introducing a statistics dependency and stays honest about only using
real observed data, consistent with Principle IV (reject/flag rather than fabricate).

**Alternative rejected**: A parametric distribution fit (e.g., Gumbel/GEV extreme-value fitting) —
more statistically standard for catastrophe modeling, but requires a numerical-fitting library
(new dependency, Principle VIII) and is harder to explain/audit to a non-technical partner than "we
resampled your own historical events." Documented as a possible future upgrade, not adopted now.

## 7. Vulnerability / Coping Capacity indicator storage

**Finding**: Spec 008's exposure dataset upload path (GeoJSON → `exposure_datasets` +
`exposure_features`, with `metric_value` + `admin_boundary_code` after spec 034) is a fully generic,
country-scoped, already-built ingestion mechanism requiring no new upload UI/parser.

**Decision**: Reuse it unmodified for indicator data — a Vulnerability/Coping Capacity indicator is
just another `exposure_datasets` row. A new, small `risk_indicators` table adds only the risk-specific
metadata an indicator needs that a generic exposure dataset doesn't: which category it belongs to
(`vulnerability` | `coping_capacity`), its weight within that category, and its normalization range
(min/max, for scaling raw indicator values to the 0-10 scale before weighting) — referencing the
`exposure_datasets.id` it was uploaded as. `exposure_datasets`/`exposure_features` themselves are
untouched.

**Alternative rejected**: Adding `risk_category`/`risk_weight` columns directly onto
`exposure_datasets` — rejected because that table is shared with population/building/other exposure
uses (specs 008/038) where those columns would be permanently NULL noise; a separate small metadata
table keeps the generic table generic (same reasoning already applied in spec 038's Complexity
Tracking for `population_source_country_datasets` vs. reusing `data_sources.endpoint_config`).
