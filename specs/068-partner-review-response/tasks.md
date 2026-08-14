---
description: "Task list for Partner Review Response Bundle"
---

# Tasks: Partner Review Response Bundle

**Input**: Design documents from `/specs/068-partner-review-response/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested in the spec; per Constitution, automated tests are mandatory only for deduplication rules, severity mapping, CAP XML validation, and proximity calculations — none of which this feature touches. No test tasks are generated; `quickstart.md` is the manual validation path.

**Organization**: Tasks are grouped by user story (US1–US7 from spec.md; US7b is explicitly deferred and has no tasks here).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Single Vue 3 SPA (`src/`) + Supabase backend (`supabase/`), per plan.md. No new top-level directories.

---

## Phase 1: Setup

**Purpose**: Nothing new to scaffold — this feature reuses the existing app, existing shadcn-vue `ui/collapsible` primitive, and existing i18n system. No setup tasks required.

*(Phase intentionally empty — proceed to Phase 2.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No infrastructure in this feature blocks more than one user story (each story's own migration/data work lives in that story's phase, per Task Organization rules). No foundational phase is required.

*(Phase intentionally empty — proceed directly to user story phases. User stories may be implemented in any order or in parallel; suggested order below follows spec priority with one adjustment noted in Implementation Strategy.)*

---

## Phase 3: User Story 2 - Consolidated, collapsible 2D layer panel (Priority: P1) 🎯 MVP (implemented first — see Implementation Strategy)

**Goal**: Disaster Filters, Shelters, Wind & Current, and Exposure appear as sections of one left-side panel in the 2D Map View, collapsed by default (accordion), using the existing shadcn-vue `Collapsible` primitive. 3D/Globe View is untouched.

**Independent Test**: Open 2D Map View; verify all four groups appear in one panel, collapsed by default; expand one, verify others stay collapsed and map remains mostly visible.

### Implementation for User Story 2

- [X] T001 [US2] Create a new `LayerPanelGroup` wrapper component at `src/components/map/LayerPanelGroup.vue` that wraps `ui/collapsible`'s `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` (imported from `src/components/ui/collapsible`) with a group title/icon prop and a default-collapsed state
- [X] T002 [US2] In `src/components/SidebarPanel.vue`, set `openSections.disasterFilters` to collapsed-by-default (`false`). **Deviation**: kept the existing hand-rolled `section-toggle`/`openSections` accordion mechanism instead of swapping in `LayerPanelGroup` — SidebarPanel's accordion already behaves identically (single-section collapse/expand); replacing it added risk with no user-visible benefit, so `LayerPanelGroup` was reserved for the three groups in MapView.vue that had no equivalent existing mechanism.
- [X] T003 [US2] **Revised approach** (see Implementation Notes below): kept the shelters panel's existing Button+Transition collapse mechanism and its hint-teleport subsystem (`sheltersHintAnchorEl`/`sheltersHintPos`) fully intact — rewriting it to use `LayerPanelGroup` would have broken that subsystem's anchor refs. Instead: (a) flipped `sheltersLayerPanelCollapsed` to default `true` (collapsed-by-default), (b) moved the panel into a new shared `.top-controls-left-column` wrapper alongside the WMS/WFS and Exposure panels.
- [X] T004 [US2] **Revised approach**: WMS/WFS panel (`.map-layers-panel`, previously had no collapse mechanism at all) now wrapped in `LayerPanelGroup`, collapsed by default. Exposure panel (`.exposure-layers-panel`) kept its existing Button+Transition + hint-teleport subsystem intact (same reasoning as T003) but flipped to collapsed-by-default and repositioned. Both now render inside `.layer-panel-stack`, itself inside `.top-controls-left-column` — the same shared left column as Shelters, instead of the grid's separate far-right column.
- [X] T005 [US2] **Not done as specified — explicit scope cut, documented in spec.md's Implementation Notes below**: `FlowControlPanel.vue` (Wind & Current) was deliberately left in its existing `severity-legend-stack` anchor point, not moved into the shared left column. Its own mount-point comment documents that its expand-upward positioning is fragile and order-dependent (a prior live-testing fix specifically tuned this). Relocating it without a browser to visually verify was judged too risky for this pass. Its own gear-icon dock already defaults to collapsed (`showSettings = ref(false)`), so it independently satisfies "collapsed by default" — just not physically consolidated into the same panel location. Flagged as follow-up.
- [X] T006 [US2] Assembled Shelters + WMS/WFS + Exposure into one shared `.top-controls-left-column` in `src/components/MapView.vue`'s 2D template, all collapsed by default. Disaster Filters (SidebarPanel) sits immediately adjacent (was already positioned directly left of this column). Wind & Current (FlowControlPanel) is the one group NOT physically relocated — see T005.
- [X] T007 [US2] Verified: `src/views/HomeView.vue` and `GlobeView.vue` were not touched by any edit in this story; confirmed via `npm run build` completing with no errors and no changes to those files.
- [X] T008 [P] [US2] i18n keys added for `impact.panel.modeStandard`/`modeAdvanced` (US7's mode toggle) in `en.json`/`tr.json`. The four layer-GROUP titles themselves reuse pre-existing i18n keys (`shelters.map.panelTitle`, `mapLayers.panelTitle`, `exposureLayers.panelTitle`, `windLayer.panelTitle`) which were already translated in all 7 locales — no new group-title keys were needed.

**Checkpoint**: 2D layer panel is unified and collapsible; 3D view unchanged.

---

## Phase 4: User Story 1 - Layer legend and controls only appear for active layers (Priority: P1)

**Goal**: Within the now-unified 2D panel, a layer's legend and transparency/filter controls render only while that layer is toggled active.

**Independent Test**: Toggle a single layer on with all others off; verify only that layer's legend/controls show; toggle off, verify they disappear.

### Implementation for User Story 1

- [X] T009 [US1] **Revised target**: audit found the real gap wasn't `severityLegend` (a global severity filter, not per-hazard) but the Disaster Filters accordion body's severity-breakdown chips, which rendered whenever a hazard type's accordion was expanded regardless of whether that hazard's layer toggle was ON. Fixed in `src/components/SidebarPanel.vue`: severity breakdown now only shows when `disasterStore.isLayerActive(dtype.key)` is true; otherwise shows a "turn this layer on" hint (`sidebar.layerInactiveHint`, added to all 7 locales).
- [X] T010 [US1] Audited: shelters panel has no separate "legend" (just two toggle checkboxes), so there was nothing to gate — no change needed.
- [X] T011 [US1] Audited: WMS/WFS and Exposure opacity sliders were **already** conditioned on `isLayerVisible(...)` (`v-if="isLayerVisible(layer.id)"` / `isLayerVisible(\`exposure-dataset-${dataset.id}\`)`) prior to this spec — no change needed, confirmed as already-compliant.
- [X] T012 [US1] Audited: `FlowControlPanel.vue`'s legend (`.flow-view-legend`) is already inside `v-if="uiStore.flowPanelOpen"` — the whole panel body, including its legend, already only renders while the panel (and by extension the layer it controls) is open — no change needed, confirmed as already-compliant.

**Checkpoint**: Legends/controls are now active-only across all four groups; combined with Phase 3, the full 2D layer panel experience matches the partner review's ask.

---

## Phase 5: User Story 4 - Set a warning radius when authoring a CAP alert (Priority: P2)

**Goal**: CAP authoring form exposes the existing `cap_drafts.radius_km` column as an optional, validated numeric field.

**Independent Test**: Create a CAP draft, enter radius, save, reopen — value persists; publish — value visible on published alert; invalid values rejected.

### Implementation for User Story 4

- [X] T013 [US4] Added "Warning Radius (km)" numeric input bound to `form.radius_km` in `src/views/CapView.vue`
- [X] T014 [US4] Added `isRadiusValid()` inline check (positive number or empty), blocks save with `cap.form.radiusInvalid` error
- [X] T015 [US4] Added `draft.radius_km` display on the draft card (📏 icon) — the CAP export path already referenced `radius_km`, only the authoring/display UI was missing
- [X] T016 [P] [US4] i18n keys (`radiusKm`, `radiusKmPlaceholder`, `radiusInvalid`) added to all 7 locale files

**Checkpoint**: Warning Radius is fully authorable, persisted, validated, and visible end-to-end.

---

## Phase 6: User Story 5 - Run impact analysis at the district (ADM2) level (Priority: P2)

**Goal**: Impact Analyzer's administrative-level selector gains a District option that calls the already-existing `loadRegionBoundaries(code, 'district')`.

**Independent Test**: Switch selector to District, pick one, verify scoped results; for a country without district data, verify a clear "not available" state instead of silent mis-scoping.

### Implementation for User Story 5

- [X] T017 [US5] **Revised target**: the actual admin-level-scoped call in `ImpactPanel.vue` is `resolveCascadeBoundary()` (feeds `CascadingRiskPanel`'s `admin-boundary-code`), not a separate impact-summary selector — added a Province/District toggle (`cascadeBoundaryLevel`) driving this function.
- [X] T018 [US5] `resolveCascadeBoundary()` now calls `loadRegionBoundaries(effectiveCountryCode.value, cascadeBoundaryLevel.value)`; `setCascadeBoundaryLevel()` re-triggers resolution on toggle
- [X] T019 [US5] Added `cascadeBoundaryLevelUnavailable` state + `impact.panel.adminLevelUnavailable` message when district boundary data isn't found for the selected country
- [X] T020 [P] [US5] i18n keys (`adminLevel`, `adminLevelProvince`, `adminLevelDistrict`, `adminLevelUnavailable`) added to `en.json`/`tr.json` — **note**: the `impact.panel.*` namespace was already only partially translated (5 of 7 locales missing several pre-existing keys like `haloIntensity`, `detailedTitle`) before this spec; new keys follow that same existing en/tr-only pattern rather than backfilling the pre-existing gap, which is out of this spec's scope.

**Checkpoint**: District-level impact analysis works for countries with data (tr, mg, my bundled, plus any DB-seeded country) and degrades clearly for others.

---

## Phase 7: User Story 3 - Upload a document to the SOP library (Priority: P2)

**Goal**: SOP editors can upload a PDF/DOCX file instead of typing body content; the existing AI-summary workflow runs against it.

**Independent Test**: Upload a sample PDF, verify storage + retrieval; trigger AI summary, verify existing approve/reject flow runs; verify oversized/unsupported files are rejected client-side.

### Implementation for User Story 3

- [X] T021 [US3] Migration `20260814090000_sop_documents_attachment.sql`: nullable `attachment_path`/`attachment_name`/`attachment_type` + all-or-nothing and MIME-allowlist CHECK constraints
- [X] T022 [US3] Migration `20260814091000_sop_documents_storage_bucket.sql`: private `sop-documents` bucket + `storage.objects` RLS policies. **Correction from plan.md/research.md**: the real existing write policy on `sop_documents` is `super_admin` OR `current_profile_has_capability('sop_repository')` (per `20260707200000_profile_capability_grants.sql`), NOT a flat `super_admin`/`country_admin`/`org_admin` list as originally assumed during planning — the storage policy mirrors the actual capability-grant condition, not the plan's simplified description.
- [X] T023 [US3] Added Typed/Upload mode toggle + file input (`.pdf`,`.docx` accept, 20MB client-side cap) to `SopDocumentFormModal.vue`
- [X] T024 [US3] Implemented `supabase.storage.from('sop-documents').upload(...)` with `{country_code}/{sop_document_id}/{filename}` path (client-generated UUID via `crypto.randomUUID()` for create-mode, since the row doesn't exist yet at upload time)
- [X] T025 [US3] `bodyContent` textarea remains available in Upload mode (labeled "optional, used for AI summary") so `aiAssistance.requestSummary(...)` keeps working unchanged — no automatic PDF text extraction was implemented (out of scope; editor can paste/type a short body manually if they want an AI summary)
- [X] T026 [US3] Client-side type/size rejection via `onAttachmentSelected()`, before any `supabase.storage` call
- [X] T027 [P] [US3] i18n keys added to **all 7** locale files (this `incidentTracking` namespace was already fully maintained across all locales, unlike `impact.panel`)

**Checkpoint**: SOP documents can be authored via upload end-to-end, using the existing review/approve/reject AI-summary flow unchanged.

---

## Phase 8: User Story 6 - Understand what the Contact Directory is for (Priority: P3)

**Goal**: Contact Directory's header and nav label clearly identify it as the alert-dissemination recipient list.

**Independent Test**: Open Contact Directory from admin nav; title/description and menu label are unambiguous.

### Implementation for User Story 6

- [X] T028 [P] [US6] `contacts.tabLabel` relabeled to "Alert Recipients" (and equivalents) across all 7 locale files
- [X] T029 [US6] Added `contacts.description` line beneath the header in `ContactsPanel.vue`, translated in all 7 locales

**Checkpoint**: Contact Directory's purpose is unambiguous from the UI alone.

---

## Phase 9: User Story 7 - Relocate Scenario Modeling as an advanced mode of Impact Analyzer (Priority: P3)

**Goal**: `ScenarioBuilder.vue` renders from inside `ImpactPanel.vue` as an "Advanced" sub-mode; no longer a separate top-level admin panel. Access level is explicitly frozen as-is (no role/RLS change — see spec's User Story 7b, deferred).

**Independent Test**: Open Impact Analyzer, confirm an "Advanced" mode opens Scenario Modeling with identical functionality; confirm it's no longer mounted at the `AdminView.vue` top level; confirm no access-level change.

### Implementation for User Story 7

- [X] T030 [US7] Added Standard/Advanced mode toggle to `ImpactPanel.vue`, mounting `ScenarioBuilder` in Advanced mode
- [X] T031 [US7] Removed `<ScenarioBuilder />` mount and its import from `AdminView.vue`
- [X] T032 [US7] **Correction from plan.md**: AdminView's actual gate is `canAdmin = isSuperAdmin || role === 'country_admin'` (org_admin excluded) — narrower than `ImpactPanel.vue`'s own pre-existing `canAnalyze` (which includes org_admin). Added a new `canAccessScenarioModeling` computed matching `canAdmin` exactly, so the move is a true no-op on access — using the broader `canAnalyze` would have silently expanded access to org_admin, violating FR-016a.
- [X] T033 [P] [US7] i18n keys (`modeStandard`, `modeAdvanced`) added to `en.json`/`tr.json` (same pre-existing `impact.panel` partial-coverage pattern as T020)

**Checkpoint**: Scenario Modeling is reachable only from within Impact Analyzer, with zero access-level change.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories together.

- [X] T034 [P] Validated all 7 locale JSON files parse correctly (`node -e "JSON.parse(...)"` on each) — did not visually verify RTL Arabic rendering in a browser (no browser available this session); recommend a manual pass before shipping.
- [X] T035 (partial) Ran `npm run build` — production build completed successfully (4807 modules, no errors) across every file touched in this feature, confirming template/script syntax correctness. **Not done**: the full interactive `quickstart.md` walkthrough (live browser + local Supabase instance) — no dev server/browser was available this session. Recommend running quickstart.md sections 1–6 manually before considering this feature done.
- [X] T036 Reviewed: "Warning Radius (km)" (CAP dissemination radius) is intentionally kept distinct from the existing impact-halo radius (magnitude-derived buffer, `effectiveRadiusKm`/`haloRadiusKm` in `ImpactPanel.vue`) — these are two different concepts by design (see spec.md's discussion of the partner's original "Warning Radius" ambiguity question), not a naming collision to resolve.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 (Setup) and Phase 2 (Foundational): empty, no blockers.
- Phases 3–9 (user stories): each is independently implementable once Phase 1/2 are confirmed empty; no cross-story blocking dependency exists. Suggested order below is priority-driven with one explicit reordering (see Implementation Strategy).
- Phase 10 (Polish): depends on whichever stories have been completed; run its i18n/quickstart checks against the actual set of shipped stories.

### User Story Dependencies

- **US2** (Phase 3): No dependency on other stories. Implemented first because US1 (legend gating) is easiest to implement correctly once the unified panel container (from US2) exists — both are P1, this is a sequencing choice, not a priority change.
- **US1** (Phase 4): Logically layers on top of US2's container but does not require it — could be implemented against the pre-existing scattered panels if US2 were skipped or delayed.
- **US4** (Phase 5): Fully independent — touches only `CapView.vue`.
- **US5** (Phase 6): Fully independent — touches only `ImpactPanel.vue`'s selector, and does not depend on US7's changes to the same file (different section of the component; implement in either order, or resolve a merge conflict if done in parallel by different people).
- **US3** (Phase 7): Fully independent — touches only `SopDocumentFormModal.vue` and its own new migrations.
- **US6** (Phase 8): Fully independent — i18n + `ContactsPanel.vue` only.
- **US7** (Phase 9): Fully independent of US1/US2/US3/US4/US6. Touches `ImpactPanel.vue` (same file as US5) and `AdminView.vue`/`ScenarioBuilder.vue` — if US5 and US7 are worked in parallel by different people, coordinate on `ImpactPanel.vue` to avoid merge conflicts (different sections of the file: admin-level selector vs. mode toggle).

### Parallel Opportunities

- All `[P]`-marked i18n tasks (T008, T016, T020, T027, T028, T033) can run in parallel with each other and with their story's non-i18n tasks, since locale files are independent of component logic changes.
- US4 (Phase 5), US3 (Phase 7), US6 (Phase 8) can be fully parallelized across different developers with zero file overlap with each other or with US1/US2.
- US5 (Phase 6) and US7 (Phase 9) both touch `ImpactPanel.vue` — parallelize with care (different sections) or sequence one after the other.

---

## Parallel Example: User Story 2 (Phase 3)

```bash
# T001 (new wrapper component) has no dependents blocking it — start immediately.
Task: "Create LayerPanelGroup wrapper component in src/components/map/LayerPanelGroup.vue"

# T002-T005 all depend on T001 existing, but are otherwise independent files/sections:
Task: "Replace disasterFilters section in src/components/SidebarPanel.vue"
Task: "Extract shelters panel in src/components/MapView.vue"
Task: "Extract exposure/WMS-WFS panels in src/components/MapView.vue"
Task: "Wrap FlowControlPanel.vue content"

# T008 (i18n) can run in parallel with all of the above:
Task: "Add i18n keys for four group titles across 7 locale files"
```

---

## Implementation Strategy

### MVP First (User Story 2, then User Story 1)

1. Skip Phase 1/2 (empty).
2. Complete Phase 3 (US2: unified collapsible 2D panel).
3. Complete Phase 4 (US1: active-only legend/controls within that panel).
4. **STOP and VALIDATE**: Run `quickstart.md` section 1 against the 2D Map View.
5. This pair (US1+US2) is the MVP — it's the single most-cited, highest-visibility item in the partner review.

### Incremental Delivery

1. US2 + US1 → validate → demo (MVP, addresses the partner's top structural complaint).
2. US4 (CAP radius) → validate → demo (small, low-risk, high partner-visibility fix).
3. US5 (ADM2 impact analysis) → validate → demo.
4. US3 (SOP upload) → validate → demo (touches new migrations, slightly higher risk — sequence after the pure-frontend stories if a single developer is doing this serially).
5. US6 (Contact Directory copy) → trivial, can be done anytime, even first, as a quick win.
6. US7 (Scenario Modeling relocation) → validate → demo; explicitly communicate to the partner that role-based restriction (US7b) is intentionally not included in this release.

### Parallel Team Strategy

With multiple developers, after confirming Phase 1/2 are empty:
- Developer A: US2 → US1 (Phase 3 → 4, same files, sequential for one person)
- Developer B: US4 (Phase 5) then US6 (Phase 8)
- Developer C: US3 (Phase 7, including the two migrations)
- Developer D: US5 (Phase 6) then US7 (Phase 9) — same person for both since they share `ImpactPanel.vue`, avoiding merge conflicts

---

## Notes

- No task in this list implements User Story 7b (role-based RLS restriction on Scenario Modeling) — that is explicitly deferred per spec.md and requires a separate future spec once the partner confirms the role taxonomy.
- Every user story here was scoped in spec.md specifically to avoid dependency on the still-open partner decisions (deployment model, full role taxonomy, 2D/3D parity, data ingestion limits, map control placement) — none of these tasks need to be redone regardless of how those decisions land.
- Commit after each task or logical group, per repository convention (see CLAUDE.md / project git guidance) — do not batch unrelated stories into one commit.
