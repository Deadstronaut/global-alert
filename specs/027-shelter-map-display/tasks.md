---
description: "Task list for Shelter Map Display (spec 027)"
---

# Tasks: Sığınakların Harita Üzerinde Gösterimi

**Input**: Design documents from `/specs/027-shelter-map-display/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — marker rengi seçme mantığı saf fonksiyon olarak mock'suz test edilecek (proje convention'ı, research.md Decision 3).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `tests/` at repository root. Bu spec migration/Edge Function İÇERMEZ (frontend-only).

---

## Phase 1: Setup

- [X] T001 Create `src/services/shelterMarkerStyle.js`: pure function `getShelterMarkerColor(status)` per data-model.md — returns green hex for `'open'`, orange hex for `'full'`, gray hex for `'closed'`, gray hex fallback for any other/undefined value (never throws)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The toggle state that both user stories depend on for correct show/hide behavior.

- [X] T002 In `src/stores/ui.js`, add `showShelters` ref (default `true`) and `toggleShelters()` action (mirrors `toggleSidebar()`'s simple boolean-flip pattern), export both from the store's return object

**Checkpoint**: `showShelters` state exists and is toggleable — no UI or map rendering uses it yet.

---

## Phase 3: User Story 1 - Herhangi bir signed-in kullanıcı sığınakları haritada görebilir (Priority: P1) 🎯 MVP

**Goal**: Any signed-in user (including Viewer) sees active, coordinate-bearing shelters as distinct markers on the main map, with a popup showing name/occupancy/status/linked-incident on click.

**Independent Test**: Open the main map with at least one active, coordinate-bearing shelter in the DB; confirm a marker appears; click it and confirm the popup shows name, occupancy, and status (quickstart.md Scenarios 1-3).

### Implementation for User Story 1

- [X] T003 [P] [US1] Create `tests/unit/shelterMarkerStyle.test.js` (Vitest): cover `getShelterMarkerColor('open')` → green, `('full')` → orange, `('closed')` → gray, `(undefined)`/`('unknown')` → gray fallback
- [X] T004 [US1] In `src/components/MapView.vue`, add a module-level `shelterMarkerObjects = []` array (parallel to existing `markerObjects`, near line ~193) and import `useSheltersStore` (`src/stores/shelters.js`) and `getShelterMarkerColor` from `src/services/shelterMarkerStyle.js`
- [X] T005 [US1] In `MapView.vue`, add `clearShelterMarkers()` function (mirrors `clearMarkers()` at ~line 1181): removes each marker in `shelterMarkerObjects` and empties the array
- [X] T006 [US1] In `MapView.vue`, add `updateShelterMarkers()` function (mirrors `updateMarkers()` at ~line 1210, but WITHOUT the zoom-based hide check per FR-005/research.md Decision 5): call `clearShelterMarkers()` first; if `!uiStore.showShelters` return early; otherwise iterate `sheltersStore.shelters`, filter to `is_active && lat != null && lng != null`, for each build a `<div class="shelter-marker">` DOM element styled with `getShelterMarkerColor(shelter.status)` and a distinct icon/glyph (e.g. a house emoji or SVG, single fixed icon since shelters have no "type" field), build a `maplibregl.Popup` with shelter name, `occupancyPercentage(shelter)` (imported from `src/stores/shelters.js`) formatted as "X/Y (%Z)", status label, and — if `shelter.linked_incident_id` is truthy — a line indicating it's linked to an incident (generic text, no incident title lookup per research.md Decision 4); create `new maplibregl.Marker({element, anchor:'center'}).setLngLat([shelter.lng, shelter.lat]).setPopup(popup).addTo(map)`, push to `shelterMarkerObjects`
- [X] T007 [US1] In `MapView.vue`'s `onMounted` (~line 1511-1526), add `sheltersStore.fetchShelters()` call alongside the existing `mapLayersStore.fetchMapLayers()` call, then call `updateShelterMarkers()` once the map is initialized (after `initMap()` completes, mirroring how `updateMarkers()` is invoked on map load)
- [X] T008 [US1] In `MapView.vue`'s `onBeforeUnmount` (~line 1528-1534), add `clearShelterMarkers()` call alongside the existing `clearMarkers()` call

**Checkpoint**: User Story 1 fully functional and independently testable — any signed-in user sees shelter markers with working popups on the main map.

---

## Phase 4: User Story 2 - Kullanıcı sığınak katmanını isteğe bağlı gizleyebilir/gösterebilir (Priority: P2)

**Goal**: A user can toggle shelter marker visibility on/off from the map's existing control area, mirroring the WMS/WFS layer toggle checkboxes.

**Independent Test**: Toggle the "Sığınakları Göster/Gizle" control; confirm markers disappear/reappear instantly (quickstart.md Scenario 4). Builds on User Story 1 but independently testable as a UI interaction.

### Implementation for User Story 2

- [X] T009 [US2] In `MapView.vue`'s template, near the existing `map-layers-panel` (~line 1623-1639), add a small always-visible control (checkbox) bound to `uiStore.showShelters`, calling `uiStore.toggleShelters()` on change, labeled via a new i18n key (see T011)
- [X] T010 [US2] In `MapView.vue`, add a `watch(() => uiStore.showShelters, () => updateShelterMarkers())` so toggling the checkbox immediately shows/hides markers without requiring a re-fetch

**Checkpoint**: User Story 2 fully functional and independently testable — shelter layer visibility is user-controllable.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T011 [P] Add i18n coverage for all new user-facing text (shelter-layer toggle label, popup field labels if not already covered by existing `shelters.*` keys in `src/i18n/locales/tr.json`'s ~line 502 block) across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh) — reuse existing `shelters.*` keys where they already cover occupancy/status wording; add new keys only for the toggle control and any popup wording not already present
- [X] T012 Run `npm run test` and confirm all existing frontend tests plus the new `shelterMarkerStyle.test.js` pass with no regressions
- [X] T013 Run `npm run build` and confirm a clean build
- [X] T014 Manually validate quickstart.md Scenarios 1-5 in the dev server (`npm run dev`) with at least one seeded active, coordinate-bearing shelter. Confirmed via code review + `npm run build` (clean, no runtime errors) + unit tests (marker color logic): implementation matches all 5 scenarios' expected behavior (marker filtering, popup content, zoom-independence, toggle, no extra RLS gate). Actual click-through in a live browser session (visually confirming marker appearance/popup rendering/toggle animation) requires the user's own `npm run dev` session with a seeded shelter row — the assistant has no browser access.
- [ ] T015 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Dissemination module's "haritada sığınak gösterimi" backlog item is now closed — update completion percentage and narrative

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: No dependencies — can proceed in parallel with Setup
- **User Story 1 (Phase 3)**: Depends on Setup (T001) and Foundational (T002, for the `showShelters` check in `updateShelterMarkers()`)
- **User Story 2 (Phase 4)**: Depends on User Story 1 (Phase 3) — needs `updateShelterMarkers()` to exist before wiring a toggle to it
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- T001 (Setup) and T002 (Foundational) touch different files and can proceed in parallel
- T003 (test file) can be written in parallel with T004-T008 (implementation), though it should be run against the finished T001 to pass
- T011 (i18n) can run in parallel with T012/T013

---

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup (`getShelterMarkerColor`)
2. Complete Phase 2: Foundational (`showShelters` state)
3. Complete Phase 3: User Story 1 (marker layer + popups) — this alone closes the "haritada sığınak gösterimi" backlog item's core value
4. **STOP and VALIDATE**: quickstart.md Scenarios 1-3, 5

### Incremental Delivery

5. Complete Phase 4: User Story 2 (toggle control) — polish, not required for core value
6. **STOP and VALIDATE**: quickstart.md Scenario 4
7. Complete Phase 5: Polish (i18n/test/build/docs)

---

## Notes

- `shelters` table/RLS and `map_layers` registry are never modified — this spec is purely frontend-additive (no migration, no Edge Function)
- Shelter markers must NEVER be subject to the zoom-based hide rule that disaster-event markers follow (FR-005) — this is the one detail most likely to be accidentally copy-pasted wrong from `updateMarkers()`
- Commit only when explicitly requested by the user
