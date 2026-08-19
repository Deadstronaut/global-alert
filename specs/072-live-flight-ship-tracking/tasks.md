# Tasks: Live Flight & Ship Tracking

**Input**: Design documents from `specs/072-live-flight-ship-tracking/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/, quickstart.md

**Scope note**: Ship/AIS tracking is deferred (research.md §2, user decision 2026-08-19). All
tasks below cover flights only, plus the top-left quick-access grid (which includes a flights
toggle as one of its four icons, alongside three pre-existing controls).

**Tests**: Not explicitly requested for this feature; no test tasks generated (per Constitution
Development Workflow, this feature's logic is outside the four non-negotiable test-first areas —
dedup, severity mapping, CAP validation, proximity calc — none of which apply here).

## Phase 1: Setup

- [X] T001 Create `supabase/functions/fetch-live-flights/` directory matching the shape of existing `supabase/functions/fetch-food-security/` (no shared upsert/hazard_events dependency needed)

## Phase 2: Foundational

- [X] T002 [P] Add `showFlights` ref + `toggleFlights()` action to `src/stores/ui.js`, following the exact same pattern as `showTerminator`/`showNightLights` (default `false`), and export both from the store
- [X] T003 [P] Add i18n keys for the new dock button to all 7 locale files (`sidebar.modeFlights`, `modeFlightsStale`, plus `sidebar.modeTerminator/modeNightLights/modeTimeline/modeDynamicAtmosphere/modeHoverCards/globeLayersGroup` retrofitted for the 6 pre-existing dock buttons, which were hardcoded Turkish strings from earlier in this session — fixed while touching this file). Grid tooltip keys (`map.quickAccessGrid.*`) deferred — see Phase 5 note.

## Phase 3: User Story 1 - See live aircraft on the globe (Priority: P1) 🎯 MVP

**Goal**: Real, currently-in-flight aircraft appear on the 3D globe, refreshed periodically, with a real-data hover card, and a visible stale/unavailable state on fetch failure.

**Independent Test**: Enable the layer (once T-US2's dock button exists — see note below) and confirm aircraft appear at real positions that move over time; kill the edge function's upstream access and confirm a stale indicator appears instead of frozen/fake data.

> Note: US1 and US2 are implemented together in practice (the layer needs a way to be turned on) but are listed separately per spec.md's story split — US1 tasks are the data/rendering plumbing, US2 tasks are the dock UI trigger.

- [X] ~~T004 [US1] Implement `fetch-live-flights` edge function~~ SUPERSEDED 2026-08-20 — live-tested and confirmed OpenSky never responds to Supabase's edge egress IPs (indefinite hang, not a code bug). Replaced with `raster-importer/import-live-flights.ts` (Deno.cron, every 5 min, see cron.ts) which fetches OpenSky from the self-hosted Docker container instead and writes into a new `live_flights` table (migration `20260820000000_live_flights_table.sql`, anon-readable via RLS). The Edge Function was deleted (local file + undeployed from the live project).
- [X] ~~T005 [US1] Handle upstream fetch failure in the edge function~~ SUPERSEDED — same architecture change; `import-live-flights.ts` throws on failure (cron.ts logs it, next 5-min cycle retries) rather than needing its own stale-cache fallback, since the frontend now derives staleness from `live_flights.updated_at` directly (see T006).
- [X] T006 [US1] In `src/components/GlobeView.vue`, `fetchFlights()` now queries the `live_flights` table directly via supabase-js (`.from('live_flights').select(...)`) instead of invoking an Edge Function, on the same ~60s interval only while `uiStore.showFlights` is true; `stale` is computed client-side as "no row's `updated_at` within the last 12 minutes" (>2x the importer's 5-min cycle)
- [X] T007 [US1] In `src/components/GlobeView.vue`'s `initGlobe()`, add a three-globe custom 3D-object layer (`.objectsData()` per research.md §3) bound to `flightsData.value.states`, positioned by `lat`/`lng`, rendered as a small aircraft-shaped 3D object oriented by `headingDeg`, kept fully separate from the existing `.pointsData()` disaster-events layer
- [X] T008 [US1] Add a real-data hover label for the flights layer (`.objectLabel()`) showing `callsign`, `originCountry`, and `altitudeM`/`velocityMs` — gated by the same `showHoverInfo` toggle already in this file
- [X] T009 [US1] Add a visible stale/unavailable indicator (small orange dot on the dock button + swapped title text) driven by `flightsData.value.stale`

## Phase 4: User Story 2 - Toggle from the existing layer dock (Priority: P1)

**Goal**: A 7th icon button in the existing right-side `globe-layer-dock`, off by default, toggling only the flights layer.

**Independent Test**: Load the globe view fresh, confirm 7 dock buttons with flights off by default; click it and confirm only flight markers appear/disappear.

- [X] T010 [US2] Add the 🛩 dock button to `globe-layer-dock` in `src/components/GlobeView.vue`'s template, following the exact markup/class pattern of the existing 6 buttons, bound to `uiStore.showFlights` / `uiStore.toggleFlights()`, using the `sidebar.modeFlights` i18n key from T003
- [X] T011 [US2] Wire a `watch(() => uiStore.showFlights, …)` in `GlobeView.vue` that starts/stops the T006 fetch interval and clears `flightsData`/hides the layer when turned off (matches the `showTerminator`/`showNightLights` watcher pattern already in the file)

## Phase 5: User Story 3 - Top-left 2x2 quick-access grid (Priority: P2)

**Goal (revised 2026-08-20, twice)**: Four equally-sized icons (screenshot/download, radar-styled
flights toggle, shelters, community reports) in a 2x2 grid, top-left — **2D `MapView.vue` only**.
User initially asked for this on both 2D and 3D; after seeing GlobeView.vue's own right-side dock
already has a 🛩 flights toggle (T010), a second flights control on the globe was flagged as pure
duplication and removed — `GlobeView.vue` has no quick-access grid at all, only its 7-button dock.

**Resolved 2026-08-20** (see project_globe_visual_layers_spec072.md memory for the full exchange):
user chose to keep the radar-sweep visual meaning "flights" specifically — the original
Wind/Currents/Waves trigger at `MapView.vue`'s right-center now uses a new plain wind-icon SVG
instead of `RadarScanBadge`, freeing the radar animation to mean exactly one thing app-wide. 4th
grid icon is `showCommunityReports` (pairs naturally with shelters in the existing flyout,
already a real toggle — no new state invented). Screenshot/flights order later swapped (screenshot
now top-left) and icons changed from circular to square, both per direct user request. Shelters
icon's click was NOT wired to a flat store toggle — it calls `MapView.vue`'s existing rich
`toggleShelters()` local function via a new `sheltersClick` prop, preserving the pre-existing
flyout panel (title + both checkboxes), hint system, and mutual-exclusion with the exposure/WMS-
WFS panels entirely intact; only the old redundant trigger button was removed ("menü panel
açılmaları falan tüm herşeyini alman lazım" — carry over the panel behavior, don't lose it).

- [X] T012 [US3] Create `src/components/QuickAccessGrid.vue`: a 2x2 CSS grid of four equally-sized SQUARE icon buttons — (1) screenshot button calling the `captureFn` prop, (2) `RadarScanBadge` wrapped in a button toggling `uiStore.showFlights`, (3) shelters toggle (calls `sheltersClick` prop if provided, else `uiStore.toggleShelters()`), (4) community-reports toggle (`uiStore.showCommunityReports`) — reused existing i18n keys (`sidebar.modeFlights`, `impact.downloadMap`, `shelters.map.toggleLabel`, `communityReport.map.toggleLabel`) instead of new `map.quickAccessGrid.*` keys, avoiding duplicate translations across 7 locales
- [~] T013 [US3] SUPERSEDED — `rendererConfig: { preserveDrawingBuffer: true }` was added for GlobeView's screenshot capture, then removed again along with the rest of the 3D grid (see Goal note above); GlobeView.vue's `Globe()` construction is back to its original no-args form
- [~] T014 [US3] SUPERSEDED — `captureGlobeScreenshot()` and the 3D grid render were implemented then removed once the whole 3D grid was dropped; screenshot capture exists only in `MapView.vue` (`downloadMap()`, unchanged)
- [X] T015 [US3] `MapView.vue`: replaced the standalone `.map-download-btn` with `<QuickAccessGrid :capture-fn="downloadMap" :shelters-click="toggleShelters" ref="sheltersHintAnchorEl" />` (dead `.map-download-btn*` CSS removed); `RadarScanBadge` import removed from `MapView.vue` (now only used inside `QuickAccessGrid.vue`); original wind-panel trigger re-skinned to a plain wind SVG icon, left fully functional at its original right-center position; old `.shelters-layer-collapse-btn` trigger button removed (dead CSS removed) — its flyout body, hint system, and mutual-exclusion logic all untouched, just re-triggered from the grid now instead
- [X] T016 [US3] `.map-quick-access--top-left` reuses the exact same `--sidebar-width`/`--sidebar-collapsed` fixed-position + `legend-sidebar-collapsed` transition logic the old button had, applied to the grid wrapper instead. Also bumped `.top-controls-row`'s `top` offset (56px → 96px past the header) since the 2x2 grid (70px tall) is taller than the single pill button (22px) it used to clear — otherwise the shelters-flyout/search/exposure row would overlap the grid's bottom icon row.

## Phase 6: Polish & Cross-Cutting

- [X] T017 [P] Confirm all new UI text (dock button titles, stale indicator, grid tooltips) renders correctly across all 7 locales including Arabic RTL (Constitution VI) — all via existing/newly-added keys, no hardcoded strings remain in touched files
- [X] T018 Run `npm run build` and fix any type/compile errors introduced across the touched files — clean build confirmed 2026-08-20 (including after Phase 5)
- [~] T019 Follow quickstart.md's validation steps end-to-end — backend now proven live 2026-08-20: ran `import-live-flights.ts` directly, wrote 9,279 real aircraft into `live_flights`, confirmed both service-role and anon-key reads succeed (quickstart.md itself still describes the old Edge Function curl check — needs a rewrite, not done in this session). Frontend-in-browser steps still blocked by the app's login gate (no test credentials in this session); dev-server smoke test (page load, no console errors) passed throughout.

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6
- US1 and US2 are both P1 and tightly coupled (the layer is only testable end-to-end once the dock button exists) — implement them back-to-back as the MVP slice.
- US3 (P2) depends on US1/US2 only for the `showFlights` state to exist (T002); it does not depend on US1's rendering/edge-function work being complete, so it *could* be built in parallel by a second contributor once T002/T003 land.

## Parallel Execution Examples

- T002 and T003 (Phase 2) touch entirely different files and can run in parallel.
- T004/T005 (edge function) and T012/T013 (QuickAccessGrid scaffolding + renderer config) touch disjoint files and can run in parallel once Phase 2 is done.

## Implementation Strategy

**MVP = Phase 1–4** (US1 + US2): real flight data visible and toggleable from the existing dock.
Ship this first — it's the feature's actual point. **Phase 5** (the 2x2 grid) is a layout
convenience on top and can land as a fast-follow without blocking the MVP.
