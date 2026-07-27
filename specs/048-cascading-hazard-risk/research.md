# Phase 0 Research: Cascading Hazard Risk

## 1. Can proximity-to-a-layer conditions (e.g. "earthquake near a river") be evaluated without new
   geometry infrastructure?

**Finding**: Verified by reading `supabase/migrations/20260706170000_impact_analysis.sql`.
`exposure_features.geom` is already a generic `geometry(Geometry, 4326)` column, GiST-indexed
(`idx_exposure_features_geom`), holding whatever geometry type a given exposure dataset actually
contains — points (population hexagons), lines (HydroRIVERS river network, spec 041), and polygons
(HydroBASINS watersheds, spec 041) alike. `exposure_datasets.source_name` (added spec 038, further
used spec 041) already tags which dataset is which (`'hydrorivers'`, `'hydrobasins'`, etc.), scoped by
`country_code`.

**Decision**: A proximity condition is a plain `ST_DWithin(event_point, ef.geom, distance_km * 1000)`
against `exposure_features` joined to `exposure_datasets` filtered by `country_code` and `source_name`
— no new geometry storage, no new import pipeline. This works identically for lines (rivers) and
polygons (basins, coastline-as-polygon-boundary) since `ST_DWithin` doesn't care about geometry type.

**Alternative rejected**: A dedicated simplified-geometry cache table for "proximity-checkable layers"
— rejected as premature optimization; `exposure_features.geom` is already indexed and the exposure
datasets involved (HydroRIVERS/HydroBASINS) are the same ones spec 041 already verified perform
acceptably for spatial queries at country scale.

## 2. Can the Vulnerability-score condition reuse spec 039's existing composite-score machinery, or does
   it need its own computation?

**Finding**: Verified by reading `supabase/migrations/20260714130000_risk_scenario_modeling_fix_nested_
aggregate.sql` and `20260714150000_..._fix_missing_factor_zero.sql`. `compute_risk_category_score
(country_code, admin_boundary_code, category)` already computes exactly the "weighted, normalized 0-10
score for one risk_indicators category in one area" value this module needs for its
Vulnerability-threshold condition, already returning `NULL` (not 0) when no indicators are configured
for that category — precisely the "not evaluable, don't fabricate" signal this module's FR-006 also
requires.

**Decision**: Call `compute_risk_category_score(country_code, admin_boundary_code, 'vulnerability')`
directly as a subroutine inside `evaluate_cascade_rules`, rather than re-deriving a vulnerability figure.
A `NULL` result is treated as "not evaluable — no Vulnerability indicators configured for this area"
(FR-006), never coerced to 0.

**Alternative rejected**: Reading `risk_area_scores.vulnerability_score` (the cached snapshot) instead —
rejected because a snapshot may be stale/absent for the specific area at cascade-evaluation time, and
`compute_risk_category_score` is cheap (a single indexed aggregate query) — recomputing live is simpler
and always current, with no additional caching/invalidation logic needed (Principle VIII).

## 3. How does a real hazard event's raw lat/lng become an `admin_boundary_code` for these lookups?

**Finding**: Spec 039 already solved exactly this problem for its own Hazard-factor RPC
(`compute_hazard_area_score`) — it resolves the area polygon from `country_boundaries.geojson`
(matching `name_property` to the requested `admin_boundary_code`) and `ST_Within`-tests the event point
against it. This module needs the same "which admin area is this event in" resolution.

**Decision**: Reuse the identical `country_boundaries.geojson` polygon lookup, exposed as a small helper
query inside `evaluate_cascade_rules` (or the caller passes an already-resolved `admin_boundary_code`
when known — e.g. the Risk dashboard already has one from viewing a specific area). No new boundary-
resolution logic is introduced; this module adds no new concept of "area" beyond the one spec 034/039
already established.

**Alternative rejected**: Requiring the caller to always supply a pre-resolved `admin_boundary_code` —
rejected as insufficient for the "evaluate cascades for this specific real event" entry point (US2),
where a user may click an individual event pin rather than an already-selected area; the RPC needs to be
able to resolve area from a bare lat/lng like `compute_hazard_area_score` already does.

## 4. Should cascade evaluation run automatically (DB trigger on each hazard table insert) or on demand?

**Finding**: All 9 hazard tables ingest continuously and independently (spec 001-003, and this project's
`aggregator`/importer architecture per `docs/plans/NEW_GAME_PLAN.md`); wiring a trigger onto all 9 would
run cascade evaluation on every single ingested event globally, including routine low-severity events
never viewed by anyone, and — per Constitution Principle II (Scope Discipline) — this module is
explicitly decision-support, not an alerting mechanism; it must not risk becoming a de facto second alert
pipeline running unattended.

**Decision**: On-demand only, matching spec 039's own precedent (`compute_risk_area_score` is called via
RPC when a user views an area, not triggered by ingestion). A user viewing a hazard event or area in the
Risk dashboard triggers `evaluate_cascade_rules` for that specific event; a user evaluating a saved
`hazard_scenarios` row triggers the same RPC with `source_type = 'hypothetical_scenario'`.

**Alternative rejected**: An `AFTER INSERT` trigger on all 9 hazard tables calling
`evaluate_cascade_rules` automatically — rejected as scope creep into automatic alerting (Principle II)
and a needless 9x trigger-maintenance surface for a decision-support feature with no stated real-time
requirement (spec Assumptions).

## 5. Rule condition composition: AND-only fixed columns, or a general expression engine?

**Finding**: The spec's three motivating examples (earthquake+proximity, any-hazard+vulnerability,
drought+food-insecurity) each combine at most two conditions, always as "both must hold." No example or
Assumption calls for OR logic or arbitrary boolean nesting.

**Decision**: A `cascade_rules` row has a small fixed set of nullable condition columns (magnitude
threshold, proximity layer + distance, vulnerability-score threshold); a rule fires only when every
condition column that is non-NULL on that row is satisfied (AND-only, no OR/NOT). This mirrors
`risk_indicators`' own flat-column design (no expression language there either) and keeps the admin UI a
plain form, not a rule-builder DSL.

**Alternative rejected**: A JSONB-based generic condition tree (arbitrary AND/OR/NOT over typed
predicates) — rejected as speculative generality (Principle VIII/YAGNI): nothing in the spec's user
stories requires it, and it would require a small interpreter plus a much more complex admin UI for a
capability not asked for.

## 6. Food-insecurity/famine condition: is real IPC-phase data actually available to condition on?

**Finding**: Verified by reading `supabase/functions/fetch-food-security/index.ts` — the currently-live
WFP HungerMap source deliberately writes `magnitude: null` for every `food_security` row, because its
underlying metric (FCS%, food consumption score) is explicitly *not* an IPC phase value and the existing
code already refuses to misrepresent one as the other (see that file's header comment). FEWS NET (also
ingested, per `docs/plans/HOW_TO_USE.md`) is the source that carries real IPC-phase-shaped severity.

**Decision**: A drought→famine cascade rule's "elevated food-insecurity" condition reads
`hazard_event_history_view` rows of `hazard_type = 'food_security'` for the area with a non-NULL
`severity`/`magnitude`, exactly like any other hazard-type condition in this module — no special famine-
specific code path. Where the only food-insecurity data available for a country is WFP HungerMap's
(`magnitude IS NULL`), the condition is correctly "not evaluable" (FR-006) rather than treated as "no
famine risk" — consistent with this project's existing, deliberate refusal (in `fetch-food-security`
itself) to fabricate an IPC-phase-equivalent severity out of an incompatible metric.

**Alternative rejected**: Converting WFP HungerMap's FCS% into a synthetic IPC-phase-like number for this
module's purposes — rejected because `fetch-food-security`'s own code comment already documents that
there is "no principled way to convert one to the other," and doing so here would silently reintroduce
exactly the fabrication that file was written to avoid.
