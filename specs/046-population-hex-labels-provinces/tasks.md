---

description: "Task list for feature 046: Population Hexagon Labels + Province-Level Population View"
---

# Tasks: Population Hexagon Labels + Province-Level Population View

**Input**: Design documents from `/specs/046-population-hex-labels-provinces/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Scope note**: Frontend-only (`src/components/MapView.vue`, new `src/utils/formatPopulationLabel.js`,
new `src/utils/provincePopulationAggregation.js`). No backend/database changes (FR-009).

**Tests**: New Vitest unit tests for the two new pure utility modules (large-number label
formatting, point-in-polygon province aggregation) — both are plain functions with no DOM/map
dependency, so unit-testable in isolation. No live browser click-through performed during
planning (no browser automation tool in this environment) — flagged per task below, matching
specs 044/045's convention.

**Organization**: Tasks are grouped by user story (US1-US2 from spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T001 Created `src/utils/formatPopulationLabel.js` — `formatPopulationLabel(value)` returns `"482K"`/`"1.2M"`-style abbreviations, a plain rounded number below 1000, and `''` for `null`/`undefined`/`NaN`.
- [X] T002 [P] Created `src/utils/provincePopulationAggregation.js` — `aggregatePopulationByProvince(populationFeatures, provinceFeatureCollection, nameProperty)`, ray-casting point-in-polygon over ring-vertex-average centroids (matching `populationCellAggregation.ts`'s convention), returning a `FeatureCollection` with `provinceName`/`totalPopulation` injected per province. **Deviation from plan, found via T016's live test**: a naive nested loop took ~77s against real data (see research.md §4 addendum) — added a precomputed per-province bounding-box pre-check (not a spatial index/R-tree) before the ray-cast, bringing it to ~370ms-1.7s. Also injects `__metricValue: totalPopulation` (in addition to `totalPopulation`) so the existing `populationFillExpression()` renders this collection with zero changes to `exposureLayerColor.js`.
- [X] T003 [P] Added `tests/unit/formatPopulationLabel.test.js` — covers <1000, thousands, millions, negative sign, and null/undefined/NaN. 5/5 passing. (Repo convention keeps `src/utils/*.test.js` unit tests under `tests/unit/`, not colocated — see existing `tests/unit/exposureLayerColor.test.js`; followed that instead of the path in this task's original wording.)
- [X] T004 [P] Added `tests/unit/provincePopulationAggregation.test.js` — covers a point clearly inside one province, a point outside all provinces (excluded, no throw), multiple points summing into the same province, an empty population-features input returning zero totals for every province, and (added post-T012, after the label layer was introduced) the `__provinceLabel` text format. 5/5 passing.

**Checkpoint**: Both utilities available, independently tested, ready for `MapView.vue` to consume.

---

## Phase 2: User Story 1 - Hexagon population labels (Priority: P1) 🎯 MVP

**Goal**: Population hexagons show their aggregated value as on-map text once large enough to
read, exclusively for population-sourced exposure layers.

**Independent Test**: Toggle a population exposure layer on, zoom in until hexagons are large,
confirm labels appear; confirm they never appear for the hazard-status hex grid or non-population
exposure layers.

### Implementation for User Story 1

- [X] T005 [US1] **Superseded by a pre-existing, more general mechanism — adapted instead of duplicated.** Since this spec was written, `MapView.vue` grew a generic `{sourceId}-labels` symbol layer (`VALUE_LABEL_MINZOOM`/`__metricValueLabel`) rendering *every* gridded exposure dataset's metric value, not population-only — built for a broader "read any grid value off the map" need that already covers most of this story. Rather than add a second, near-duplicate `-label` layer + `__populationLabel` property, `addExposureLayer()` (`MapView.vue`) now picks `formatPopulationLabel` instead of the generic `formatMetricValueLabel` specifically when `isPopulationSource(dataset.source_name)` — same `__metricValueLabel` property, population values just render abbreviated (`"482K"`) instead of comma-separated (`"482,367"`), satisfying FR-003. See T006/T007 for why the rest of this story's infrastructure was likewise already in place.
- [X] T006 [US1] **Already existed** (see T005) — the generic `{sourceId}-labels` symbol layer already has zoom-gated visibility (`minzoom: VALUE_LABEL_MINZOOM = 8`), tuned and live-legibility-adjusted on 2026-07-23 (predates this spec). No new layer added; FR-001's "legible size" gating was already satisfied. **Known deviation from FR-002's literal wording**: that existing layer labels *all* gridded exposure sources (roads/rivers/GDO anomalies/etc.), not only population — changing it to hide non-population labels now would be a regression to already-shipped, presumably-wanted behavior, so left as-is rather than narrowed. Flagging explicitly rather than silently accepting the wording mismatch.
- [X] T007 [US1] **Already existed** — `removeExposureLayerRendering()`'s cleanup loop already included the `-labels` suffix before this session (`[...EXPOSURE_SUB_LAYER_SUFFIXES, '-labels']`). Verified, no change needed.
- [X] T008 [US1] Verified by inspection: the hazard-status grid uses the entirely separate `country-hex-grid` MapLibre source (searched all usages in `MapView.vue`) — no shared source/layer ID or property name with `exposure-dataset-*`/`__metricValue*`. No collision.
- [X] T009 [US1] `npx eslint src/components/MapView.vue src/utils/formatPopulationLabel.js src/utils/provincePopulationAggregation.js` — one pre-existing unused-var error at the (untouched) click-handler destructuring line, confirmed present before this session's changes too (`git stash` + re-run), not introduced here. `npm run build` — succeeds (chunk-size warnings are pre-existing/unrelated). Full `npx vitest run` — 226/226 passing (includes this feature's 9 new tests plus one incidental fix: `tests/unit/exposureLayerColor.test.js`'s `hydrobasins` color assertion was stale against the immediately-prior commit's color change, unrelated to this feature — corrected in passing). Live browser verification not performed this session (no browser automation tool available), matching specs 044/045's convention.

**Checkpoint**: Population hexagons show/hide readable labels correctly; everything else unchanged.

---

## Phase 3: User Story 2 - Province-level population view (Priority: P2)

**Goal**: A per-dataset toggle switches a population layer's rendering from hexagons to
province-shaded choropleth, reusing existing province boundary data and the existing population
color ramp; gracefully unavailable for a country with no boundary data.

**Independent Test**: For Turkey, toggle province view on a population layer and confirm
per-province shading + click popup; for Madagascar, confirm the toggle is disabled/hidden with no
error.

### Implementation for User Story 2

- [X] T010 [US2] Added `populationViewMode` (`ref({})`, keyed by `dataset.id`, values `'hexagon' | 'province'`) in `MapView.vue`, plus `populationViewModeFor(dataset)` reading it with a `'hexagon'` default — matches the `layerVisibility`/`layerOpacity` ref-map pattern exactly.
- [X] T011 [US2] Added a two-button toggle (`.population-view-toggle`, hexagon/province) to the exposure-layer panel row, shown only when `isPopulationSource(dataset.source_name)` **and** the layer is currently on (province aggregation needs its hex data already fetched — see T012). Availability is tracked in a new `provinceBoundaryCache` ref (`country_code -> loadRegionBoundaries() result | null`), populated by `ensureProvinceBoundaryChecked()` fired (fire-and-forget) from `addExposureLayer()` as soon as a population layer's hex data lands. The province button is `disabled` with a `title` tooltip (`exposureLayers.provinceView.unavailableTooltip`) when unavailable, never hidden — FR-007.
- [X] T012 [US2] Implemented `enableProvinceView(dataset)`: reads the cached boundary + the dataset's already-fetched `exposureFeatureCache` entry (no new fetch), runs `aggregatePopulationByProvince()` (T002), adds a `${sourceId}-province` GeoJSON source + fill layer using `populationFillExpression()` on the aggregated collection (own min/max, FR-005), and calls `setHexagonSubLayersVisibility(dataset, 'none')` to **hide** (via `layout.visibility`, not remove) the dataset's `-fill`/`-line`/`-point`/`-labels` layers — preserves their opacity/paint state for exact restoration (FR-008). Also adds a `${sourceId}-province-label` symbol layer (always-on, no zoom-gating needed at only ~16-81 features) rendering `__provinceLabel` (name + abbreviated population, added to `aggregatePopulationByProvince`'s output). **Post-implementation fix, found via real user testing (not caught by the Node live-test in T016, which only measures compute time, not perceived UI responsiveness)**: running the aggregation synchronously on the main thread — even at the ~370ms-1.7s T016 measured — visibly froze map interaction ("duruyor duruyor... sonra şak diye çıkıyor"). Moved the call into a new dedicated `src/workers/provinceAggregationWorker.js` (mirrors `hexWorker.js`'s existing pattern; not reusing `hexWorker` itself since its lazy-init is tied to the unrelated hexbins/"Petek" toggle) via a small requestId-keyed postMessage/Promise wrapper (`runProvinceAggregation()`). Also fixed a `DataCloneError` this surfaced: `provinceBoundaryCache` is a Vue `ref`, so reading a boundary out of it directly returns a reactive Proxy, which `postMessage`'s structured-clone cannot serialize — fixed by reading through `toRaw(provinceBoundaryCache.value)[countryCode]` before posting. Added a `provinceViewLoading` ref driving a "Yükleniyor…" label + `.loading` pulse style on the province button while the worker runs, so the wait now reads as "working" rather than "stuck."
- [X] T013 [US2] Added a `click` handler on `${sourceId}-province-fill` opening a popup via a small dedicated `buildProvincePopupHtml()` (mirrors `buildFeaturePopupHtml`'s `.disaster-popup-modern` card skeleton) showing the province name and `totalPopulation.toLocaleString()`.
- [X] T014 [US2] Implemented `disableProvinceView(dataset)`: removes the `-province-fill`/`-province-line` layers and source, then `setHexagonSubLayersVisibility(dataset, 'visible')` — since the hex layers were only hidden (T012), this restores them with whatever opacity/toggle state they already had, no lost state.
- [X] T015 [US2] Added `exposureLayers.provinceView.{hexagonOption,provinceOption,unavailableTooltip,populationLabel}` to all 7 locale files (en/tr/es/fr/ru/ar/zh); validated all seven parse (`JSON.parse` per file).
- [X] T016 [US2] **Live-tested — found and fixed a real performance problem.** Ran `aggregatePopulationByProvince()` in Node against real Turkey data: `polygonToCells()` over the actual country boundary at resolution 7 (139,884 cells — matches spec 045's documented figure exactly) against the real bundled `tr-provinces.json` (81 provinces). **First run (naive nested loop, no bbox pre-check): ~77 seconds** — far outside any interactive budget, the complexity-bound assumption in research.md §4 was wrong for real (dense, ~690-vertex-average) GADM ring data. Added a per-province bounding-box pre-check (see T002) and re-ran: **~370ms-1.7s** — interactive. Full findings, including a coordinate-order bug caught by this same live test (some provinces landed at exactly zero population before the fix), recorded in research.md §4 addendum.
- [X] T017 [US2] `eslint`/`npm run build`/`npx vitest run` — see T009 (same run covered both stories; no additional issues from Phase 3's changes). Live browser verification not performed this session — no browser automation tool available in this environment.

**Checkpoint**: Both user stories functional — hexagon labels (P1, via the adapted existing generic label layer) and province view (P2, newly built), both scoped to population sources only, both degrading gracefully where data is unavailable.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T018 [P] Confirmed no regression: `populationViewMode`/`provinceBoundaryCache` are new, dataset-id/country-code-keyed refs not read by `hexResForZoom`/`currentHexRes`/`uiStore.manualHexResolution` (spec 045) or `visibleExposureDatasets`/`hideExposureLayersNotForCountry` (spec 044) — no shared state, no code path touches both.
- [X] T019 [P] Confirmed by construction: `removeExposureLayerRendering()` (called on every toggle-off) now also removes the `-province-fill`/`-province-line` layers/source if present and deletes the dataset's `populationViewMode` entry entirely — re-toggling the dataset on always starts from the `'hexagon'` default (`populationViewModeFor`'s fallback) regardless of which mode was active when it was turned off. No stale layer possible.
- [X] T020 Live-test findings (T016) recorded in research.md §4 addendum; T006's "already existed, zoom-gated via `VALUE_LABEL_MINZOOM = 8`" finding recorded against T006 above.

---

## Dependencies & Execution Order

- Phase 1 (T001-T004) blocks both user story phases — both stories consume `formatPopulationLabel`/`provincePopulationAggregation`... actually US1 only needs T001/T003 (label formatting); US2 only needs T002/T004 (province aggregation). They may proceed in parallel once Phase 1 completes.
- User Story 1 (P1) is independently shippable as the MVP without User Story 2.
- User Story 2 (P2) depends only on Phase 1's `provincePopulationAggregation.js`, not on User Story 1's label layer — could be built first if reprioritized, but ships second per spec.md's stated priority.

## Parallel Example

```
T001 and T002 can run in parallel (different files, no shared state).
T003 and T004 can run in parallel once their respective source files (T001/T002) exist.
Within Phase 2, T005 → T006 → T007 are sequential (same function/file, building on each other).
Within Phase 3, T010 → T011 → T012 → T013 → T014 are sequential (same state/rendering path);
T015 (i18n) and T016 (live test) can run in parallel with each other once T012 exists.
```

---

## Post-implementation extension: district-level (ADM2) view

Requested directly after initial delivery, based on live user feedback that
province (ADM1, il) boundaries read as "too coarse" — user explicitly asked
for a finer level (ilçe/district) for all three served countries (Turkey,
Madagascar, Malaysia), confirmed via clarifying questions to mean ADM2 only
(not also ADM3/village).

- Sourced real ADM2 boundary data from [geoBoundaries](https://www.geoboundaries.org)
  (same source/convention as the existing ADM1 files — see
  `src/data/boundaries/README.md`): `tr-districts.json` (973 districts),
  `mg-districts.json` (119 districts), `my-districts.json` (159 districts).
- Generalized `src/data/boundaries/index.js`'s `loadRegionBoundaries()` (and
  `getRegionNames`/`findRegionGeometry`) with a `level` param (`'province'`
  default | `'district'`) — existing call sites (GeocodingSearch.vue,
  disaster.js, AdminView.vue) are unaffected, still default to province.
  The admin-uploadable `country_boundaries` DB table remains province-only
  (no district-upload feature exists) — district level is bundled-only.
- Generalized `MapView.vue`'s province-view machinery (T010-T014) into a
  level-agnostic `enableRegionView(dataset, level)`/`disableRegionView()`
  pair driving a three-way toggle (Hexagons / Provinces / Districts) instead
  of two — same aggregation function (`aggregatePopulationByProvince`,
  already generic despite its name), same worker, same choropleth/label/
  popup rendering, just parameterized by `level`.
- **Found and fixed a second `DataCloneError`, worse than T012's first one**:
  `regionBoundaryCache` held both province and district cache entries in one
  nested `ref()`. Sequential `ensureRegionBoundaryChecked()` calls (province
  then district, back-to-back for the same country) each rebuild the cached
  object via `{...prev, [level]: ...}` — since `prev` is read through a
  reactive Proxy's `get` trap, the *other*, untouched level's value gets
  read-and-rewrapped as a nested Proxy and then genuinely stored that way
  (not just wrapped-on-read) in the object handed to the next `ref` write.
  T012's `toRaw()` fix only strips one outer layer, not this baked-in nested
  Proxy, so it broke again as soon as both levels were populated for the
  same country (confirmed live: worked once with only one level cached,
  then `DataCloneError` on the second). Fixed properly this time by
  switching `regionBoundaryCache` from `ref()` to `shallowRef()` — since
  it's only ever reassigned wholesale (never mutated at a nested path), a
  shallow ref gives the same reactivity trigger for the template without
  ever wrapping nested data, so nothing posted to the worker is a Proxy.
  `toRaw()` is no longer needed anywhere in this file.
- Live-verified in a real browser (test account) against all three
  countries: Turkey (Ankara-area districts — Polatlı 87.7K, Haymana 16.7K,
  etc.), Madagascar (Besalampy 95.8K, Toliary-I 462.2K, etc.), and Malaysia
  (Kuantan 466.2K, Sri Aman 67.1K, etc.) — real district names, populations,
  and choropleth shading rendering correctly, worker round-trip in the
  hundreds of ms to ~3s range (no UI freeze), no console errors.
- i18n: renamed the `exposureLayers.provinceView` key namespace to
  `exposureLayers.regionView` (added `districtOption`) across all 7 locales
  — safe rename, this feature was still unreleased at the time.
- `npx vitest run` (227/227), `npm run build`, and `npx eslint` (same single
  pre-existing unrelated error as before) all re-confirmed green after this
  extension.

## Post-implementation extension 2: independent multi-toggle (not mutually exclusive)

Requested directly after the ADM2 extension above, based on live feedback:
Hexagons/Provinces/Districts should each be an independent on/off toggle —
turning Provinces on/off must never affect Districts (or Hexagons), so any
combination can render on the map at once, instead of only one "mode" being
active at a time.

- Replaced the single `populationViewMode` ref (`'hexagon' | 'province' |
  'district'` — one active value per dataset) with `regionViewActive`
  (`{ [datasetId]: { hexagon, province, district: boolean } }`, default
  `{ hexagon: true, province: false, district: false }`) and a new
  `toggleRegionLevel(dataset, level)` that flips only that one level's
  boolean and calls `enableRegionView`/`disableRegionView`/
  `setHexagonSubLayersVisibility` for that level alone — siblings untouched.
- `regionViewLoading` (the "Yükleniyor…" state from the first extension)
  is now keyed by `${datasetId}:${level}` instead of just `datasetId`, so
  turning Provinces and Districts on back-to-back gives each its own
  independent loading state instead of one clobbering the other.
- **Z-order fix, needed once both could render together**: Districts must
  always visually render above Provinces regardless of which the user
  toggled on first. `map.addLayer()` with no `beforeId` always stacks a new
  layer on top of everything already present — fine when Districts is
  added after Provinces, but backwards if Provinces is (re-)enabled while
  Districts is already active (it would land on top, hiding Districts).
  Fixed by passing Districts' existing fill layer as `beforeId` when adding
  Provinces' layers, only when Districts is already present — Districts
  itself needs no special handling since a plain append already lands on
  top of Provinces the other way around.
- Live-verified in a real browser (test account) against Turkey: turned
  Provinces on (Hexagons stayed active), turned Districts on too (all three
  showed active simultaneously, district shapes correctly rendered above
  province shapes), then turned Provinces off alone (Districts stayed
  active and rendered, hexagon cells visible underneath in the gaps) — no
  console errors, exactly the requested independence.
- `npx vitest run` (227/227), `npm run build`, `npx eslint` (same single
  pre-existing unrelated error) all re-confirmed green.

## Post-implementation extension 3: fixed z-order so province borders stay visible over districts

Requested directly after extension 2, based on live feedback that turning
both Provinces and Districts on made it impossible to tell which district
belongs to which province — the district fill/line/label group was landing
entirely above the province group (extension 2's `insertBefore` logic moved
one *whole* level's layers relative to the other's fill only), completely
covering the province's own border line.

- Replaced the per-level `insertBefore` heuristic with `enforceRegionLayerOrder(dataset)`,
  called after every `enableRegionView()` add. It repeatedly calls
  `map.moveLayer(id)` (no `beforeId` — MapLibre's "move to very top") across
  a fixed list, bottom-to-top: province-fill, district-fill, district-line,
  **province-line**, district-label, province-label. Calling `moveLayer`
  with no `beforeId` in this exact sequence leaves every listed layer in
  that relative order at the very top of the stack — regardless of which
  order the toggles were actually clicked in — with hexagon's layers
  (never touched) implicitly staying below all of them.
- Styled province's line distinctly from district's: `line-width: 2.5`,
  `line-color: '#ffffff'`, opacity floored at `0.85` (vs. district's
  unchanged thin `#7f0000`/`width:1`) — reads as the "official" boundary
  the district shapes sit inside of, per the live request ("resmi sınırlar
  belli olmalı", "ilçeler o sınırların içinde kalmalı").
- Left province's *fill* untouched (still renders normally when Districts
  is off; gets fully covered by district's fill when both are on, which is
  expected/harmless — only the *border line* needed fixing, not the fill).
- Live-verified in a real browser (test account), Ankara area, TR, both
  Provinces and Districts on simultaneously: a clearly visible thick white
  province border now cuts across the view (e.g. along the Beypazarı/
  Ankara-province edge) while district shapes and labels (Polatlı 87.7K,
  Nallıhan 24K, Haymana 16.7K, etc.) render inside it — confirms districts
  now read as visually grouped within their province's border.
- `npx vitest run` (227/227), `npm run build`, `npx eslint` (same single
  pre-existing unrelated error) all re-confirmed green.

## Post-implementation extension 4: admin-uploadable district/village levels + level column

Requested directly after extension 3, prompted by two concerns: (a) an
admin might find a bundled/geoBoundaries-sourced level (e.g. Turkey's or
Madagascar's district set) inaccurate and want to correct it themselves,
and (b) village-level (ADM3) data has no free bundled source at all, so the
only way it can ever exist is an admin uploading it.

- **Migration `20260727040000_country_boundaries_level.sql`** (applied to
  the linked remote project via `supabase db push`): adds a `level TEXT NOT
  NULL DEFAULT 'province' CHECK (level IN ('province','district','village'))`
  column to `country_boundaries`, and widens its primary key from
  `(country_code)` to `(country_code, level)`. The default backfills every
  existing row (previously one boundary set per country, e.g. Madagascar's
  ADM1 from spec 040) to `'province'` — zero behavior change for anything
  already uploaded.
- **`src/data/boundaries/index.js`**: removed the `if (level === 'province')`
  gate around the DB lookup — every level now checks `country_boundaries`
  first (filtered by both `country_code` and the new `level` column), only
  falling back to a bundled file if nothing's there. This is what makes
  admin-correction of district data possible, and is the sole source for
  village data (no `BUNDLED_LOADERS.village` exists).
- **`BoundaryUploadForm.vue`** (Admin Panel → Veri Yönetimi → Sınır Verisi):
  added a "Seviye *" dropdown (İl (ADM1) / İlçe (ADM2) / Köy (ADM3)) next to
  the existing country selector. The upsert now includes `level` and targets
  `onConflict: 'country_code,level'` (required once the PK became
  composite) — re-uploading for the same country+level replaces only that
  level, leaving the other two untouched.
- **`MapView.vue`**: extended `REGION_LEVELS` to `['province', 'district',
  'village']` and added a fourth "Köyler" toggle button, using the exact
  same generalized `enableRegionView`/`enforceRegionLayerOrder` machinery
  from extensions 2-3 — district's border styling was bumped from the
  original thin style to a medium one (`width: 1.5`, floor opacity `0.5`)
  now that it plays the same "coarser border over finer fill" role toward
  village that province plays toward district.
- **Found and fixed a real bug via live testing**: the fire-and-forget
  boundary-availability check in `addExposureLayer()` was still hardcoded
  to exactly `['province', 'district']` from extension 2 — adding
  `'village'` to `REGION_LEVELS` elsewhere didn't automatically cover it, so
  the Villages button stayed permanently disabled even with real data
  present in the DB. Fixed by looping over `REGION_LEVELS` there too instead
  of hardcoding the two levels.
- **Live end-to-end test** (test account, super_admin): uploaded a 2-feature
  test GeoJSON as Malaysia's `village` level through the real admin form,
  confirmed the success message and the Villages button becoming enabled on
  the map (after the bug fix above), then deleted the test row via the
  app's own authenticated Supabase client (RLS `super_admin_delete_boundary`
  policy) — confirmed via a direct `supabase db query` that only Malaysia's
  original `province` row remains, no test residue left in the shared
  database.
- `npx vitest run` (227/227), `npm run build`, `npx eslint` (same single
  pre-existing unrelated error) all re-confirmed green after this extension.
