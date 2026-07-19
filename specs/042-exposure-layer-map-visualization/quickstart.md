# Quickstart: Exposure Layer Map Visualization

Validates the feature end-to-end against the real datasets now in production (2026-07-19):

| Dataset | Country | Features |
|---|---|---|
| OSM Roads | Turkey (`tr`) | 5,233 |
| Kontur Population | Turkey (`tr`) | 457,761 |
| Kontur Population | Malaysia (`my`) | 158,154 |
| Kontur Population | Madagascar (`mg`) | 349,138 |

*(Correction: an earlier draft of this document referenced a "37,407 feature OSM roads" dataset —
that figure was stale/dangling metadata with zero real rows behind it, discovered and fixed during
this feature's own implementation. Real roads data was re-imported (5,233 motorway-only features)
and Kontur population was imported for the first time in the same session — see research.md's
addendum.)*

Two genuinely different source types (line geometry for roads, polygon/H3-hexagon geometry for
population) now exist simultaneously, so User Story 4 (generic extensibility) can be verified live
against real, structurally-different data — not deferred.

## Prerequisites

- Migrations `20260719120000_exposure_layer_features_rpc.sql` and
  `20260719130000_exposure_layer_features_rpc_fix_row_limit.sql` applied (`npx supabase db push`).
- Logged in as a role that can read `exposure_datasets` for Turkey (`country_admin`/`org_admin`
  for `tr`, or `super_admin`) — per research.md §5, anon/viewer roles are not expected to see this
  panel's data, matching this table's existing RLS.

## 1. Layer panel appears with the real datasets

1. Open the map view, logged in as above.
2. Confirm the exposure-layer panel lists both "osm — tr — 2026-07 (osm)" and
   "kontur — tr — 2026-07 (kontur)" (or their actual `exposure_datasets.name`/`source_name`
   values), initially toggled off.
3. Confirm the existing WMS/WFS map-layers panel (spec 012) and shelter toggle (spec 027) are
   still present and unaffected — this feature is additive (now stacked via `.layer-panel-stack`
   so neither panel visually overlaps the other).

## 2. Toggle on/off (User Story 1)

1. Toggle the roads layer on. Expect: road-line geometry appears on the map within a few seconds.
2. Toggle it off. Expect: geometry disappears immediately; all other map content (hazard markers,
   boundaries, other layers) unaffected.
3. Toggle it on again. Expect: geometry reappears quickly (from the session cache — no refetch
   round-trip, per `exposureFeatureCache` in data-model.md).
4. Repeat for the population layer (457,761 features) — same expected behavior, larger payload.

## 3. Click-to-inspect (User Story 2)

1. With the roads layer on, click a road line. Expect: a popup appears showing that feature's
   `properties` (e.g. `highway`, `name`) and its `metric_value` labeled with the dataset's
   `metric_property_name`.
2. With the population layer on, click an H3 hexagon. Expect: a popup showing its population
   value — same generic popup builder, structurally different data, no per-source code.
3. Click a different feature. Expect: the previous popup closes, the new one opens — never two
   popups at once.
4. Click empty map space (no feature under the cursor). Expect: no popup, and any open popup
   closes (MapLibre's default `closeOnClick` behavior).

## 4. Large-dataset responsiveness (User Story 3)

1. With only the 457,761-feature Kontur population (Turkey) layer on — the largest real dataset in
   production — pan and zoom the map. Expect: no visible stall/freeze — MapLibre's GPU rendering
   should keep this smooth (research.md §2 explains why this differs from spec 040's server-side
   memory-limit finding, which was an Edge Function compute ceiling, not a browser rendering one).
2. Toggle the roads layer on alongside it. Both should remain visible and the map should stay
   interactive.
3. Note: the RPC fetch itself was live-verified to return the full row count with no truncation
   (research.md §2 addendum — the original `TABLE`-returning design was found to silently cap at
   1000 rows via PostgREST's default `db-max-rows`, fixed by switching to `RETURNS JSONB`).

## 5. Generic extensibility (User Story 4) — live-verifiable now

1. Confirm both the roads layer (LineString geometry, `highway`/`name`/`osmId` properties) and the
   population layer (Polygon/H3-hexagon geometry, different `properties` shape entirely) render
   correctly and are click-inspectable using the exact same code path — direct evidence FR-002/
   FR-004/FR-008's "generic by design" requirement holds for real, structurally different data.
2. Code-review confirmation: `grep -n "source_name ===\|=== 'osm'\|=== 'roads'\|=== 'population'\|=== 'kontur'"` across all files touched by this feature returns zero matches.

## 6. Empty state

1. Switch to (or simulate) a served-country context with zero `exposure_datasets` rows (e.g.
   Malaysia has population data but no roads dataset — toggle-list should show only what exists,
   not an error for the missing one).
2. Confirm the layer panel shows a clear "no exposure layers available" message rather than
   appearing blank or broken (FR-007/SC-005), for a context with genuinely zero datasets.

## 7. i18n

1. Switch the app locale (e.g. to `ar` for RTL) and confirm the new panel/popup labels render
   translated text, not raw i18n keys, and RTL layout is not visually broken.
