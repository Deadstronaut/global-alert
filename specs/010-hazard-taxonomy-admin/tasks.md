# Tasks: Hazard Taxonomy Admin

**Input**: Design documents from `specs/010-hazard-taxonomy-admin/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/hazard-taxonomy-crud.md, quickstart.md

**Context**: Greenfield feature — 2 new tables (`hazard_types`, `hazard_thresholds`), no Edge Function (plain RLS-gated CRUD). Fixes an existing Constitution Principle I violation (hazard types/thresholds hardcoded across 6+ files). Zero regression required for the 9 hazard types already in production use (FR-007, SC-003).

## Phase 1: Setup

- [X] T001 Create migration file `supabase/migrations/20260707130000_hazard_taxonomy.sql` with the standard header comment (purpose, covered FRs, note on the zero-regression seed data requirement).

## Phase 2: Foundational (blocking prerequisites)

- [X] T002 In the migration, create the `hazard_types` table per data-model.md (code PK, display_name, category CHECK, description, is_active, timestamps).
- [X] T003 In the migration, create the `hazard_thresholds` table per data-model.md (hazard_type_code PK/FK to hazard_types, metric_name, unit, breakpoints JSONB, updated_at).
- [X] T004 In the migration, create function `validate_hazard_breakpoints()` (BEFORE INSERT OR UPDATE trigger on `hazard_thresholds`) that raises an exception if `NEW.breakpoints`'s `min_value` values are not strictly ascending (FR-006), and attach it.
- [X] T005 In the migration, add RLS to both tables: `super_admin_hazard_types_all`/`super_admin_hazard_thresholds_all` (FOR ALL, super_admin only, with `DROP POLICY IF EXISTS` guards for idempotency per this repo's established convention), and `read_active_hazard_types`/`read_active_hazard_thresholds` (FOR SELECT, `TO authenticated`, active-only unless caller is super_admin, per data-model.md).
- [X] T006 In the migration, attach `set_updated_at()` and `log_table_change()` triggers to both tables (FR-012).
- [X] T007 In the migration, insert the 9 seed `hazard_types` rows and their corresponding `hazard_thresholds` rows exactly as specified in data-model.md (5 with real breakpoints reproducing `SEVERITY_FN`, 4 with an empty `[]` array) — this is the zero-regression requirement (FR-007, FR-009, SC-003), get these values character-for-character correct against `src/utils/severity.js`.
- [X] T008 Create `src/stores/hazardTypes.js` (Pinia): `fetchHazardTypes()` (loads `hazard_types` + `hazard_thresholds` joined, caches in a ref), `activeHazardTypes` (computed array of active codes+display names), and a bundled `FALLBACK_THRESHOLDS` constant containing today's exact `SEVERITY_FN` values (copied from `src/utils/severity.js`) used when the store hasn't loaded or the fetch failed (FR-011). Call `fetchHazardTypes()` once at app boot from `src/App.vue`'s existing `onMounted` (alongside `disasterStore.startWebSocket()`) so the registry is already warm by the time any of the 6 migrated call sites (Phase 5) mount, rather than each one triggering its own fetch.
- [X] T009 In the same store, implement `computeSeverity(hazardType, value)`: evaluate the cached (or fallback) breakpoints array for `hazardType` by finding the highest `min_value` breakpoint `<= value`, returning `'low'` if no breakpoints exist for that hazard type at all (FR-008).
- [X] T010 [P] Create `tests/unit/hazardThresholdEvaluation.test.js` (Vitest) covering: correct severity for a value at/above/below each breakpoint, the drought-shape case (only 4 levels present), an empty-breakpoints-array fallback to `'low'`, and that the store's `FALLBACK_THRESHOLDS` values exactly match `src/utils/severity.js`'s current `SEVERITY_FN` outputs for a set of representative inputs (regression guard for FR-007/SC-003).
- [X] T011 Update `src/utils/severity.js`'s `computeSeverity()` to delegate to `useHazardTypesStore().computeSeverity()` (keeping the same exported function signature so no caller needs to change), removing the now-redundant local `SEVERITY_FN` map (its values live on in the store's `FALLBACK_THRESHOLDS`, T008).

**Checkpoint**: Registry + thresholds schema, seed data, and the store's severity-evaluation logic are ready and tested — admin UI and the 6-file migration can begin.

---

## Phase 3: User Story 1 - Manage the hazard type registry (Priority: P1)

**Goal**: A super_admin can view, create, and deactivate hazard types; every other role is denied.

**Independent Test**: Log in as super_admin, confirm all 9 seeded types appear, add a 10th, deactivate one, then confirm a non-super_admin role cannot reach the tab (quickstart.md Scenario 1).

- [X] T012 [US1] Create `src/components/admin/HazardTypeFormModal.vue`: fields for code (disabled/read-only in edit mode — codes are immutable once created, since they're referenced by string elsewhere), display_name, category (select), description; on submit, surface a duplicate-code unique-violation as a clear "code already exists" message (FR-004), not a raw Postgres error.
- [X] T013 [US1] Add `createHazardType`/`updateHazardType`/`deactivateHazardType` methods to `src/stores/hazardTypes.js`, following the same direct-Supabase-client pattern as `sources.js`/`contacts.js` (no allowlist — RLS is authoritative).
- [X] T014 [US1] Create the "Hazard Taxonomy" tab content in `src/views/AdminView.vue` (or a new `src/components/admin/HazardTaxonomyPanel.vue` mounted from it, matching the `ContactsPanel.vue` pattern from spec 009): a table listing all hazard types (code, display_name, category, is_active), an "add" button opening `HazardTypeFormModal.vue`, and a deactivate/reactivate action per row.
- [X] T015 [US1] Add the "Hazard Taxonomy" tab button to `src/views/AdminView.vue`, gated `v-if="auth.isSuperAdmin"` (NOT `canAdmin`/`canCreateUsers` — this registry is genuinely super_admin-only, unlike every other admin tab in this app, per FR-002/data-model.md's RLS).

**Checkpoint**: Registry is fully manageable by super_admin; every other role is denied at both the UI and RLS layer.

---

## Phase 4: User Story 2 - Configure severity threshold breakpoints (Priority: P1)

**Goal**: A super_admin can view/edit a hazard type's breakpoints, with invalid (non-ascending) breakpoints rejected, and edits taking effect immediately for new event classification.

**Independent Test**: Edit earthquake's "critical" breakpoint from 7.0 to 7.5, submit a magnitude-7.2 test event via Manual Entry, confirm it now classifies "high" instead of "critical" (quickstart.md Scenario 2).

- [X] T016 [US2] Create `src/components/admin/HazardThresholdEditor.vue`: shows the selected hazard type's `metric_name`/`unit` and an editable ordered list of `{min_value, severity}` rows (add/remove/reorder rows), with client-side ascending-order validation before submit (mirrors FR-006/T004's server-side guard).
- [X] T017 [US2] Wire `HazardThresholdEditor.vue` into the Hazard Taxonomy tab (T014) — e.g. opened from each hazard type row ("edit thresholds" action) — using an `upsertThresholds(hazardTypeCode, payload)` method added to `src/stores/hazardTypes.js` (contracts/hazard-taxonomy-crud.md).
- [X] T018 [US2] After a successful threshold save, invalidate/refresh the store's cached thresholds (re-fetch or locally patch the cache) so `computeSeverity()` reflects the edit immediately without a page reload (FR-007 "no deploy needed").

**Checkpoint**: Threshold edits are live-effective immediately; invalid breakpoint orderings are rejected client- and server-side.

---

## Phase 5: User Story 3 - Frontend hazard-type selectors read from the registry (Priority: P2)

**Goal**: The 6 hardcoding call sites read from the shared store instead of a local array, with a working bundled fallback.

**Independent Test**: Add a hazard type via Story 1, confirm it appears in all 6 forms without a code change; confirm all 6 still show a usable list if the registry fetch fails (quickstart.md Scenarios 4-5).

- [X] T019 [P] [US3] Migrate `src/components/admin/ContactFormModal.vue`'s `HAZARD_TYPES` constant to `useHazardTypesStore().activeHazardTypes`.
- [X] T020 [P] [US3] Migrate `src/components/admin/FileImportForm.vue`'s `HAZARD_TYPES` constant the same way.
- [X] T021 [P] [US3] Migrate `src/components/admin/ManualEntryForm.vue`'s `HAZARD_TYPES` constant the same way.
- [X] T022 [P] [US3] Migrate `src/components/admin/SourceFormModal.vue`'s `HAZARD_TYPES` constant the same way.
- [X] T023 [P] [US3] Migrate `src/views/CapView.vue`'s `HAZARD_TYPES` constant the same way.
- [X] T024 [P] [US3] Migrate `src/views/IncidentsView.vue`'s `HAZARD_TYPES` constant the same way.
- [X] T025 [US3] Ensure `src/stores/hazardTypes.js`'s `activeHazardTypes` computed falls back to a bundled static list (the 9 seeded codes) when `fetchHazardTypes()` hasn't completed or errored, so none of the 6 migrated call sites ever render an empty selector (FR-011, SC-005) — verify by simulating a failed fetch in each.

**Checkpoint**: All 6 call sites are registry-driven; adding/deactivating a hazard type propagates everywhere with no further code change; offline/error fallback works.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] Add a `hazardTaxonomy` i18n key block to `src/i18n/locales/tr.json` covering all new UI text (tab label, form fields, empty states, validation errors).
- [X] T027 [P] Add the same i18n key block (translated) to `src/i18n/locales/en.json`.
- [X] T028 [P] Add the same i18n key block (translated) to `src/i18n/locales/es.json`.
- [X] T029 [P] Add the same i18n key block (translated) to `src/i18n/locales/fr.json`.
- [X] T030 [P] Add the same i18n key block (translated) to `src/i18n/locales/ru.json`.
- [X] T031 [P] Add the same i18n key block (translated) to `src/i18n/locales/ar.json`.
- [X] T032 [P] Add the same i18n key block (translated) to `src/i18n/locales/zh.json`.
- [X] T033 Wire all new UI text (`HazardTypeFormModal.vue`, `HazardThresholdEditor.vue`, the Hazard Taxonomy tab) through `t('hazardTaxonomy...')` using the keys from T026-T032.
- [X] T034 Run `npm run test` and confirm `hazardThresholdEvaluation.test.js` (T010) plus all existing suites pass with zero regressions.
- [X] T035 Run `npm run build` and confirm a clean build with no new console errors/warnings beyond the existing known chunk-size warnings.
- [X] T036 Kod seviyesinde doğrulandı (2026-07-15): `20260707130000_hazard_taxonomy.sql` production'da uygulanmış olduğu REST API ile doğrulandı (`hazard_types` sorgulanabiliyor). Tarayıcıda elle click-through (5 senaryo) kullanıcıya bırakıldı.
- [X] T037 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: mark spec 010/Hazard Taxonomy Admin's completion status, note what remains out of scope (backend runtime re-pointing, hierarchical relationships, regional overrides, encyclopedia UI — Assumptions/research.md), and update the overall totals row.

## Dependencies

- Phase 1 (T001) → Phase 2 (T002-T011) → all user story phases.
- Phase 2 is a hard blocker: schema, seed data, and the store's severity-evaluation logic are relied on by every subsequent story.
- US1 (Phase 3) and US2 (Phase 4) both depend only on Phase 2, not on each other's UI — but US2's threshold editor is opened from US1's registry list (T017), so build T012-T015 before T016-T018 in practice even though they're logically independent stories.
- US3 (Phase 5) depends on Phase 2 only (the store must exist to migrate call sites to it) — fully independent of US1/US2, could be built in parallel by a different contributor.
- Phase 6 (Polish) depends on all prior phases being functionally complete.

## Parallel Execution Examples

- T019-T024 (the 6 call-site migrations) are fully parallelizable — independent files, no shared state beyond the already-built store.
- US3 (Phase 5) can be built entirely in parallel with US1/US2 (Phases 3-4) once Phase 2 is done.
- T026-T032 (the 7 locale files) are fully parallelizable.

## Implementation Strategy

**MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1) — a manageable, super_admin-visible hazard registry with zero-regression seed data already delivers real value (taxonomy is no longer invisible/hardcoded). Phase 4 (US2, threshold editing) is the other P1 half and should ship alongside US1 for this feature to actually close the constitution violation it exists to fix. Phase 5 (US3, the 6-file migration) is P2 and can trail slightly behind — until it ships, the registry exists but isn't yet the single source of truth everywhere, which is a real but bounded and independently-completable gap. Phase 6 (i18n) should ship alongside whichever user stories ship, not be deferred indefinitely, per Constitution Principle VI.
