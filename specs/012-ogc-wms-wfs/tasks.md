---

description: "Task list for OGC WMS/WFS Map Layers (spec 012)"
---

# Tasks: OGC WMS/WFS Map Layers

**Input**: Design documents from `/specs/012-ogc-wms-wfs/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/map-layers.md, quickstart.md

**Tests**: Included — URL-safety validation is a security-relevant, non-negotiable test-first zone (constitution Development Workflow & Quality Gates).

**Organization**: Tasks are grouped by user story (US1–US3) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `tests/unit/`, `supabase/migrations/`, `scripts/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707150000_map_layers.sql` with a header comment describing scope (MHEWS-FR-0037, MHEWS-SD-MAP-03)
- [X] T002 [P] Create `scripts/add-map-layers-i18n.cjs` skeleton (locale-block object + write loop), copied from the `scripts/add-hazard-taxonomy-i18n.cjs` pattern

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The registry table and the URL-safety validator are shared by all three user stories.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T003 Implement the `map_layers` table in `supabase/migrations/20260707150000_map_layers.sql`: `id` (UUID PK), `display_name` (TEXT NOT NULL), `source_type` (TEXT NOT NULL, `CHECK IN ('wms','wfs')`), `endpoint_url` (TEXT NOT NULL), `layer_name` (TEXT NOT NULL), `is_active` (BOOLEAN NOT NULL DEFAULT true), `created_by` (UUID FK → `auth.users(id)` ON DELETE SET NULL), `created_at`/`updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- [X] T004 Add RLS policies to `map_layers` in the same migration: `super_admin` `FOR ALL`; all authenticated roles `FOR SELECT USING (is_active = true)`; idempotent via `DROP POLICY IF EXISTS` before create
- [X] T005 Add the existing `set_updated_at()` and `log_table_change()` triggers to `map_layers` in the same migration, idempotent via `DROP TRIGGER IF EXISTS` before create
- [X] T006 [P] Implement `isSafeLayerEndpointUrl(url)` in `src/utils/mapLayerUrlSafety.js`: returns `false` for non-`https://` URLs and for hostnames that are `localhost`, loopback (`127.0.0.0/8`, `::1`), RFC 1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), or link-local (`169.254.0.0/16`); `true` otherwise
- [X] T007 [P] Write `tests/unit/mapLayerUrlSafety.test.js` (Vitest) covering: valid public HTTPS URL accepted; `http://` rejected; `localhost`/`127.0.0.1` rejected; each private IP range rejected; a valid public IP/domain accepted

**Checkpoint**: Registry table and URL-safety validator complete and tested — all user stories can now proceed.

---

## Phase 3: User Story 1 - Register an external OGC map layer (Priority: P1) 🎯 MVP

**Goal**: A Tenant Admin (super_admin) can register a WMS or WFS layer; unsafe URLs and non-admin attempts are rejected.

**Independent Test**: Register a WMS endpoint with a layer name as super_admin; confirm it saves inactive by default; confirm an unsafe URL and a non-super_admin attempt are both rejected.

### Implementation for User Story 1

- [X] T008 [US1] Create `src/stores/mapLayers.js` Pinia store: `fetchMapLayers()`, `activeMapLayers` computed, `createMapLayer`/`updateMapLayer`/`deactivateMapLayer`/`reactivateMapLayer` actions (validating `isSafeLayerEndpointUrl()` before calling Supabase on create/update), following the `src/stores/sopDocuments.js` pattern
- [X] T009 [US1] [P] Create `src/components/admin/MapLayerFormModal.vue` (display name, source-type select `wms`/`wfs`, endpoint URL input, layer/feature-type name input, save/cancel; client-side URL-safety check with a clear rejection message), following `SopDocumentFormModal.vue`
- [X] T010 [US1] [P] Create `src/components/admin/MapLayerRegistryPanel.vue` (list of layers, "+ Add" button opening `MapLayerFormModal`, deactivate/reactivate actions), following `SopRepositoryPanel.vue`
- [X] T011 [US1] Add a "🗺️ Map Layers" tab to `src/views/AdminView.vue`, gated `v-if="auth.isSuperAdmin"`, rendering `MapLayerRegistryPanel`
- [ ] T012 [US1] Manually verify `quickstart.md` Scenario 1 against a dev Supabase instance: valid WMS/WFS registration succeeds inactive-by-default, unsafe URL rejected, non-super_admin rejected

**Checkpoint**: User Story 1 fully functional and independently testable — the registry exists and is safely gated.

---

## Phase 4: User Story 2 - Toggle and adjust an OGC layer on the map (Priority: P1)

**Goal**: Any authenticated user can toggle an active WMS/WFS layer on the map and adjust its opacity, live, without a page reload.

**Independent Test**: With one active WMS layer, open the map, toggle it on, confirm the raster overlay renders; adjust opacity and confirm the rendered transparency changes; toggle off and confirm it disappears. Repeat for a WFS layer.

### Implementation for User Story 2

- [X] T013 [US2] Wire `mapLayersStore.fetchMapLayers()` into `src/App.vue`'s existing `onMounted`, alongside the existing `hazardTypesStore`/`sopDocumentsStore` fetch calls
- [X] T014 [US2] Add a layer-control panel section to `src/components/MapView.vue` listing `mapLayersStore.activeMapLayers`, each with a visibility toggle and an opacity slider (reactive component state per spec.md FR-009 — not persisted)
- [X] T015 [US2] Implement WMS rendering in `src/components/MapView.vue`: on toggle-on, `map.addSource()` with a `raster` source built from the WMS `GetMap` tile-URL template (per `contracts/map-layers.md`) and `map.addLayer()` with `raster-opacity` bound to the layer's current opacity state; on toggle-off, `map.removeLayer()`/`map.removeSource()`
- [X] T016 [US2] Implement WFS rendering in `src/components/MapView.vue`: on toggle-on, fetch the WFS `GetFeature` GeoJSON response (per `contracts/map-layers.md`), `map.addSource()` with a `geojson` source, and `map.addLayer()` with geometry-appropriate paint (circle/line/fill) bound to the layer's current opacity state; on fetch failure, leave the toggle "on" in the UI but add no source/layer (silent render failure per spec.md Edge Cases); on toggle-off, remove the added layer(s)/source
- [X] T017 [US2] Wire the opacity slider's `input` event to `map.setPaintProperty(layerId, '<type>-opacity', value)` for the currently-rendered layer (no source re-fetch or layer removal/re-add on opacity change alone)
- [ ] T018 [US2] Manually verify `quickstart.md` Scenarios 2, 3, and 5: WMS toggle/opacity, WFS toggle/opacity, and silent failure on an unreachable endpoint

**Checkpoint**: User Stories 1 AND 2 both work independently — layers can be registered and rendered/controlled on the map.

---

## Phase 5: User Story 3 - Deactivate or edit a registered layer (Priority: P2)

**Goal**: A Tenant Admin can edit or deactivate/reactivate a layer; deactivated layers are fully absent (not greyed out) from every user's layer panel.

**Independent Test**: Deactivate an active layer and confirm it disappears entirely from the map's layer panel on next load; edit its display name and confirm the change is reflected.

### Implementation for User Story 3

- [X] T019 [US3] Confirm (or extend if needed) `MapLayerFormModal.vue`/`MapLayerRegistryPanel.vue` from Phase 3 already support edit-in-place (title/endpoint change) and deactivate/reactivate toggling — these were built generically in T009/T010, so this task is verification-and-any-gap-closing, not net-new UI
- [X] T020 [US3] Confirm `mapLayersStore.activeMapLayers` (consumed by `MapView.vue`'s layer panel, T014) is naturally re-fetched on next map load, so a deactivated layer is absent (not present-but-disabled) — always call `mapLayersStore.fetchMapLayers()` in `MapView.vue`'s own `onMounted` (harmless even if `App.vue` already fetched it, since the store's fetch is idempotent-safe) rather than relying solely on `App.vue`'s boot-time fetch
- [ ] T021 [US3] Manually verify `quickstart.md` Scenario 4: deactivation removes the layer from the panel entirely on next load; reactivation and display-name edits are reflected correctly

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [P] Populate `scripts/add-map-layers-i18n.cjs` with all new UI keys (Map Layers admin tab/form, layer panel labels, opacity control, rejection messages) across all 7 locales (tr/en/es/fr/ru/ar/zh)
- [X] T023 Run `scripts/add-map-layers-i18n.cjs` and verify all 7 `src/i18n/locales/*.json` files updated correctly
- [X] T024 Run `npm run test` and confirm all existing and new Vitest tests pass with no regressions; additionally (FR-008 verification) confirm no WFS/WMS fetch response is ever written to a Supabase table by grepping the diff for stray `.insert()`/`.upsert()` calls near the new map-layer rendering code in `MapView.vue`
- [X] T025 Run `npm run build` and confirm a clean build
- [X] T026 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Data Ingestion & Monitoring module's last remaining gap (OGC WMS/WFS adapter) is now closed — update its completion percentage accordingly
- [ ] T027 Manually verify `quickstart.md` Scenario 6: all new UI text renders correctly (no missing-key fallbacks) across all 7 locales, including correct Arabic RTL layout

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all three user stories (registry table + URL validator are shared)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational AND on User Story 1's registry existing (needs at least one registered/active layer to render) — sequenced after US1
- **User Story 3 (Phase 5)**: Depends on User Story 1's admin UI (T009/T010) and User Story 2's map-side re-fetch behavior (T014) already existing — mostly a verification pass confirming those were built generically enough, not large net-new work
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Parallel Opportunities

- T002 (Setup) can run in parallel with T001
- T006 and T007 (Foundational URL validator + its tests) can run in parallel with T003–T005 (migration) — different files
- T009 and T010 (US1 form + panel components) can run in parallel — different files
- T015 and T016 (US2 WMS vs WFS rendering) touch the same file (`MapView.vue`) but are logically independent branches (`source_type === 'wms'` vs `'wfs'`) — sequence to avoid merge conflicts within the same file rather than true parallel execution

---

## Parallel Example: Foundational

```bash
# Once Setup (Phase 1) is done, these can run in parallel:
Task: "Implement map_layers table + RLS + triggers in supabase/migrations/20260707150000_map_layers.sql"
Task: "Implement isSafeLayerEndpointUrl() in src/utils/mapLayerUrlSafety.js + its Vitest tests"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (registry table + URL validator + tests) — CRITICAL
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: `quickstart.md` Scenario 1 — the registry itself is safely gated and functional, even before any map rendering exists

### Incremental Delivery

1. Setup + Foundational → registry table + URL safety live
2. Add US1 → validate → admins can safely register layers (MVP)
3. Add US2 → validate → layers actually render/toggle/adjust on the map (the module's real value)
4. Add US3 → validate → edit/deactivate lifecycle confirmed
5. Polish (i18n, docs, test/build verification)

---

## Notes

- [P] tasks = different files, no dependencies
- No health-monitoring state machine, caching, or retry logic is introduced for `map_layers` — do not add tasks for these (see plan.md's Constitution Check, Principle VIII)
- Migrations are provided as exact CLI commands to the user for manual application once implementation is complete, per this project's established practice
- Commit only when explicitly requested by the user
