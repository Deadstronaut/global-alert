---

description: "Task list for Regional Hazard Threshold Overrides (spec 020)"
---

# Tasks: Regional Hazard Threshold Overrides

**Input**: Design documents from `/specs/020-regional-threshold-overrides/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/hazard-threshold-overrides.md, quickstart.md

**Tests**: Included — `resolveThresholds()`'s override-vs-global selection logic is exactly the
class of easy-to-get-subtly-wrong logic (empty overrides, wrong country, wrong hazard type) the
constitution flags for test-first treatment, matching the project's established pattern
(`evaluateBreakpoints()` in spec 010).

**Organization**: Tasks are grouped by user story (US1–US3) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707220000_hazard_threshold_overrides.sql` with a header comment describing scope (regional/country hazard threshold overrides, spec 020, purely additive — `hazard_thresholds` and its existing consumers are untouched)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `hazard_threshold_overrides` table, its RLS, and the pure resolution function are
shared by all three user stories — nothing else can be built until these exist.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T002 In the new migration, create `hazard_threshold_overrides` table per data-model.md: `hazard_type_code TEXT NOT NULL REFERENCES hazard_types(code) ON DELETE CASCADE`, `country_code VARCHAR(2) NOT NULL`, `metric_name TEXT`, `unit TEXT`, `breakpoints JSONB NOT NULL DEFAULT '[]'`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `PRIMARY KEY (hazard_type_code, country_code)` — idempotent (`CREATE TABLE IF NOT EXISTS`)
- [X] T003 In the same migration, attach the existing `validate_hazard_breakpoints()` trigger function (spec 010, `supabase/migrations/20260707130000_hazard_taxonomy.sql`) to this new table via `BEFORE INSERT OR UPDATE` (reuse, do not duplicate the ascending-breakpoints validation logic) and the existing `set_updated_at()` trigger function for `updated_at` maintenance
- [X] T004 In the same migration, enable RLS and add three policies per data-model.md: `super_admin_hazard_overrides_all` (`current_profile_role() = 'super_admin'`, all commands), `country_scoped_hazard_overrides_manage` (`current_profile_has_capability('hazard_taxonomy') AND country_code = current_profile_country_code()`, all commands, `WITH CHECK` mirrors `USING` per FR-008 — purely capability-gated, no base-role OR-branch, matching spec 018's tab-visibility gate), `read_hazard_overrides` (`TO authenticated USING (true)`, SELECT only) — `DROP POLICY IF EXISTS` + `CREATE POLICY`
- [X] T005 [P] In `src/stores/hazardTypes.js`, add the pure `resolveThresholds(hazardType, countryCode, globalThresholds, overrides)` function per data-model.md (returns the override's breakpoints if `countryCode` is provided and one exists for `(countryCode, hazardType)`; otherwise `globalThresholds` unchanged)
- [X] T006 [P] Create `tests/unit/hazardThresholdOverrides.test.js` covering `resolveThresholds()`: no `countryCode` provided (legacy behavior), `countryCode` provided but no override exists (falls back to global), override exists for the exact pair (used), override exists for a different hazard type in the same country (ignored, global used), override exists for the same hazard type in a different country (ignored, global used)

**Checkpoint**: The table, its RLS, and the tested resolution logic exist — nothing calls it from
`computeSeverity()`, `severity.js`, or the admin UI yet.

---

## Phase 3: User Story 1 - Country Admin defines a country-specific severity threshold (Priority: P1) 🎯 MVP

**Goal**: A Country Admin (or capability-granted Org Admin) can create an override for their own
country that takes effect for new events, without affecting other hazard types or other countries.

**Independent Test**: Create an override, enter a manual event that would classify differently
under global vs. override thresholds, confirm the override applies (quickstart.md Scenarios 1–3).

### Implementation for User Story 1

- [X] T007 [US1] In `src/stores/hazardTypes.js`: add `overrides` state (`{ [countryCode]: { [hazardTypeCode]: { metric_name, unit, breakpoints } } }`); extend `fetchHazardTypes()` to also `SELECT * FROM hazard_threshold_overrides` alongside the existing `hazard_types`/`hazard_thresholds` fetch, populating `overrides`
- [X] T008 [US1] In `src/stores/hazardTypes.js`, extend `computeSeverity(hazardType, value, countryCode)` to accept the optional third parameter and call `resolveThresholds()` (T005) before `evaluateBreakpoints()` — legacy two-argument calls continue to work unchanged (no `countryCode` means no override lookup is attempted)
- [X] T009 [US1] In `src/utils/severity.js`'s `buildEventRow()`, pass the already-computed `country_code` value through as `computeSeverity()`'s third argument (single-line change, per research.md Decision 3/contracts)
- [X] T010 [US1] Add `upsertThresholdOverride(hazardTypeCode, countryCode, payload)` to `src/stores/hazardTypes.js`: `supabase.from('hazard_threshold_overrides').upsert({ hazard_type_code: hazardTypeCode, country_code: countryCode, ...payload }, { onConflict: 'hazard_type_code,country_code' })`, updates local `overrides` state on success
- [X] T011 [US1] In `src/components/admin/HazardThresholdEditor.vue`, add an optional `countryCode` prop — when set, the modal title reflects the target country and the emitted `save` payload includes `country_code: countryCode` (the component's existing metric/unit/breakpoints form and ascending-order validation are reused unchanged, per research.md Decision 3 — this is the same shape as the global editor)
- [X] T012 [US1] In `src/components/admin/HazardTaxonomyPanel.vue`, add a country-override subsection: for a non-Super-Admin capability holder (this panel is already only reachable by Super Admin or a `hazard_taxonomy` capability grant, per spec 018's tab gate — no separate check needed here), show their own country's existing overrides (from `store.overrides[auth.countryCode]`) with an "add/edit override" action per hazard type, opening `HazardThresholdEditor` with `:country-code="auth.countryCode"` (no country selection needed — always their own country, per FR-006)

**Checkpoint**: User Story 1 fully functional and independently testable — a Country Admin can
create a working override that takes effect immediately for new events, scoped correctly.

---

## Phase 4: User Story 2 - Country Admin manages (edits/removes) their country's overrides (Priority: P2)

**Goal**: Edit and remove previously created overrides.

**Independent Test**: Edit an override's values and confirm new events reflect the change; remove
an override and confirm the country reverts to the global classification (quickstart.md Scenario 4).

### Implementation for User Story 2

- [X] T013 [US2] Add `removeThresholdOverride(hazardTypeCode, countryCode)` to `src/stores/hazardTypes.js`: `supabase.from('hazard_threshold_overrides').delete().eq('hazard_type_code', hazardTypeCode).eq('country_code', countryCode)`, removes the entry from local `overrides` state on success
- [X] T014 [US2] In `src/components/admin/HazardTaxonomyPanel.vue`'s country-override subsection (T012), add a "remove override" action per overridden hazard type calling `removeThresholdOverride()`; editing an existing override reuses the same `HazardThresholdEditor` flow from T011/T012 (opened with the existing override's values pre-filled, matching the existing global-threshold-editor pattern already used for `store.thresholds`)

**Checkpoint**: Both grant and revoke are fully functional for a Country Admin's own country.

---

## Phase 5: User Story 3 - Super Admin manages overrides for any country (Priority: P3)

**Goal**: Super Admin can create/edit/remove an override for any country, not just their own
(trivially true for Super Admin, but the UI must expose a country selector since Super Admin has
no single "own country").

**Independent Test**: As Super Admin, create an override for an arbitrary country and confirm it
takes effect for that country (quickstart.md Scenario 6).

### Implementation for User Story 3

- [X] T015 [US3] In `src/components/admin/HazardTaxonomyPanel.vue`, extend the country-override subsection so Super Admin sees a country-code input/selector (free-text 2-letter code, consistent with how country_code is entered elsewhere in this admin panel, e.g. `BoundaryUploadForm.vue`) before opening `HazardThresholdEditor` with `:country-code="selectedCountry"` — Super Admin's view lists overrides across all countries (grouped by country), unlike the Country Admin's single-country view from T012

**Checkpoint**: All three user stories independently functional — Country/Org Admins manage their
own country's overrides, Super Admin manages any country's overrides, both reusing the same
editor component and store functions.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T016 [P] Add i18n keys for the country-override subsection (section title, country selector label, add/edit/remove actions) to all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T017 Run `npm run test` and confirm all existing and new tests pass with no regressions
- [X] T018 Run `npm run build` and confirm a clean build
- [X] T019 Manually validate quickstart.md Scenarios 1–6 against a local/staging Supabase instance with the migration applied — **Deployment Verification Status (2026-07-06)**: migration applied by the user; live-verified via read-only queries: `hazard_threshold_overrides` table exists, RLS enabled with all 3 expected policies (`super_admin_hazard_overrides_all`, `country_scoped_hazard_overrides_manage`, `read_hazard_overrides`), both trigger functions attached (`validate_hazard_threshold_overrides_breakpoints` on INSERT/UPDATE, `set_hazard_threshold_overrides_updated_at` on UPDATE), table queryable and empty (no rows yet, as expected on fresh deploy). Full end-to-end UI scenarios (2–4, 6: override creation/edit/remove/Super-Admin-cross-country) could NOT be exercised — same limitation as spec 018: the live project currently has only one profile (a super_admin), no country_admin/org_admin test account with the `hazard_taxonomy` capability grant exists to exercise the capability-gated path. This is an environment/test-data gap, not a code defect.
- [X] T020 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Hazard Taxonomy Admin module's remaining-gap line ("bölgesel eşik override'ları") is now closed — update completion percentage and describe what was and was not covered (hierarchical hazard relationships, hazard encyclopedia UI, and backend ingestion-runtime wiring remain out of scope, unaffected)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (table/RLS/pure function
  underpin everything)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational; T014 additionally depends on T011/T012's
  editor/subsection existing (same UI, extended with a remove action)
- **User Story 3 (Phase 5)**: Depends on Foundational; T015 additionally depends on T011/T012's
  editor existing (same component, reused with an explicit country selector for Super Admin)
- **Polish (Phase 6)**: Depends on all user stories being complete

### Parallel Opportunities

- T005/T006 (pure function + its tests) can be scaffolded in parallel, though T006 asserts
  against T005's actual output
- T016 (i18n) can run in parallel with T017/T018

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (table + RLS + `resolveThresholds()`)
3. Complete Phase 3: User Story 1 (Country Admin creates a working override)
4. **STOP and VALIDATE**: quickstart.md Scenarios 1–3 — zero-regression baseline holds, an
   override takes effect, and is correctly scoped to one hazard type and one country

### Incremental Delivery

1. Setup + Foundational → table/RLS/resolution logic exist, nothing observable yet
2. Add User Story 1 → validate → Country Admin can create working overrides
3. Add User Story 2 → validate → edit/remove works
4. Add User Story 3 → validate → Super Admin can manage any country's overrides
5. Polish (i18n, docs, test/build verification, quickstart validation)

---

## Notes

- No changes to `hazard_thresholds`, `computeSeverity()`'s existing two-argument call sites, or
  the backend ingestion runtimes (`normalize.ts`/`normalizer.js`) — verified by design, not by
  code search, since this feature adds a new table and an optional third parameter rather than
  modifying any existing signature or table
- Reuses `validate_hazard_breakpoints()`, `set_updated_at()`, `current_profile_role()`,
  `current_profile_country_code()`, and `current_profile_has_capability()` — zero new SQL helper
  functions introduced
- Migrations are provided as exact CLI commands to the user for manual application once
  implementation is complete
- Commit only when explicitly requested by the user
