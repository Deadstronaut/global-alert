---

description: "Task list for Data Source Country Scoping"
---

# Tasks: Data Source Country Scoping

**Input**: Design documents from `specs/002-source-scoping/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/source-scoping.md, quickstart.md

**Tests**: Constitution's non-negotiable test-first zones (dedup, severity mapping, CAP validation,
proximity calc) do not apply to this feature. A lightweight Vitest test for the new grouping helper
is still included as good practice (per research.md §5), but is not test-first-gated.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Phase 1: Setup

**Purpose**: Add the schema column this feature depends on

- [X] T001 Create migration file `supabase/migrations/20260706_data_sources_country_scope.sql`: `ALTER TABLE data_sources ADD COLUMN country_code TEXT;` plus `CREATE INDEX idx_data_sources_country_code ON data_sources (country_code);` — no CHECK constraint (country codes are an open, admin-managed set, matching `profiles.country_code`'s existing convention, per data-model.md); no backfill needed, column defaults to `NULL` (global) for all existing rows (per research.md §4)

**Checkpoint**: `data_sources.country_code` column exists in the migration file, ready for RLS policies.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: RLS enforcement and shared frontend logic every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 In `supabase/migrations/20260706_data_sources_country_scope.sql` (same file as T001), narrow the existing `public_read_data_sources` policy (from 001, currently `FOR SELECT USING (true)` with no `TO` clause) to the `anon` role only, and add a new `country_scoped_read_data_sources` policy for the `authenticated` role: `current_profile_role() = 'super_admin' OR country_code IS NULL OR country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())` — per contracts/source-scoping.md §2. This is what makes User Story 1 possible; no frontend change is needed for read-visibility since `sourcesStore.fetchSources()` already does an unfiltered `select('*')`.
- [X] T003 In the same migration file (T001/T002), narrow write access so a `country_admin` may only `INSERT`/`UPDATE` `data_sources` rows where `country_code` equals their own `profiles.country_code` (never `NULL`/global, never another country), while `super_admin` remains unrestricted — replace/extend 001's existing `admins_write_data_sources`/`admins_update_data_sources` policies per contracts/source-scoping.md §2. Blocks User Story 3.
- [X] T004 [P] Create `src/utils/sourceScope.js` implementing `groupSourcesByScope(sources, viewerCountryCode) => { global: Source[], local: Source[] }` per contracts/source-scoping.md §3 (pure function, no I/O, does not mutate input, returns `{ global: [], local: [] }` for empty input)
- [X] T005 [P] Write `tests/unit/sourceScope.test.js` (Vitest — path matches `vitest.config.js`'s `include: ['tests/unit/**/*.test.js']`, not colocated with `src/`) covering: mixed global+local input, local-only viewer with zero global sources, empty-local-group case (returns `local: []`, not an error), and a multi-country input where each local row retains its own `country_code` for labeling (super_admin case)

**Checkpoint**: RLS enforces correct read/write scoping at the database layer; `groupSourcesByScope()` exists and is unit-tested — both user stories that touch the UI (US1, US2) and the write-restriction story (US3) can now proceed independently.

---

## Phase 3: User Story 1 - Country Admin sees only relevant sources (Priority: P1) 🎯 MVP

**Goal**: A Country Admin's `sourcesStore.sources` never contains another country's local sources.

**Independent Test**: Log in as a Country Admin scoped to a country with no local sources configured (e.g. Madagascar); call `sourcesStore.fetchSources()` and confirm the resulting `sources` array contains zero entries with a non-null `country_code` other than the admin's own — this is already true after Phase 2 (T002) with no additional frontend code, since RLS filters at the database layer.

### Implementation for User Story 1

- [X] T006 [US1] Add a short comment in `src/stores/sources.js` above `fetchSources()` noting that country-scoped visibility is enforced entirely by RLS (T002) and that no client-side filtering should be added here — prevents a future well-meaning but redundant (and non-authoritative) client-side filter from being added (per research.md §2)

**Checkpoint**: User Story 1 fully functional and independently verifiable — this story requires no new UI, only the Foundational RLS policy.

---

## Phase 4: User Story 2 - Grouped display: global vs. local (Priority: P1)

**Goal**: The Sources tab visually separates global sources (top) from the viewing admin's local sources (bottom, behind a divider), omitting the local group entirely when it would be empty.

**Independent Test**: As an admin with both global and country-scoped sources visible, open the Sources tab and confirm two visually separated, internally-ordered groups (global above divider, local below); as an admin with zero local sources, confirm no divider or empty section renders.

### Implementation for User Story 2

- [X] T007 [US2] Modify the Sources tab in `src/views/AdminView.vue`: replace the current flat source list with `groupSourcesByScope(sourcesStore.sources, authStore.profile?.country_code)` (T004) and render the `global` group first, then — only when `local.length > 0` — a divider followed by the `local` group (FR-005, FR-006)
- [X] T008 [P] [US2] Add a thin divider style (reusing existing `AdminView.vue` CSS custom properties, e.g. `var(--color-border, ...)`-style tokens already used elsewhere in the file — no new hardcoded colors) between the Global and Local sections
- [X] T009 [US2] Modify `src/components/admin/SourceHealthCard.vue`: accept and render an optional country-code badge/label for country-scoped sources, shown when the viewer is `super_admin` (who may see multiple countries' local sources at once and needs to tell them apart — spec US2 acceptance scenario 3); omit the badge for a single-country admin's own local sources (redundant — they're all their own country) and for global sources (no country to show)

**Checkpoint**: All three groups (global-only, local-only, mixed) render correctly for every role; empty-local case shows no dangling divider.

---

## Phase 5: User Story 3 - Super Admin manages scope when creating/editing a source (Priority: P2)

**Goal**: `super_admin` can set any source's scope (global or any country); `country_admin` can only create/edit sources scoped to their own country.

**Independent Test**: As `super_admin`, create one source with "Global" scope and one scoped to a specific country, confirm both save and surface in the correct group for the correct audience (per US2). As a `country_admin`, confirm the scope field in the creation form is locked to their own country and that any attempt (e.g. a direct API call) to save a source with a different scope is rejected by RLS (T003).

### Implementation for User Story 3

- [X] T010 [US3] Modify `src/components/admin/SourceFormModal.vue`: for `super_admin`, add a scope picker (options: "Global" + a free-text/select country code field) that sets `country_code` in the submitted payload (`null` for Global); for `country_admin`, pre-fill and lock the field to their own `profiles.country_code`, with no way to select Global or another country (FR-008, FR-009)
- [X] T011 [US3] Confirm `src/stores/sources.js`'s existing `createSource(payload)`/`updateSource(id, payload)` (generic passthrough to `supabase.from('data_sources').insert/update(payload)`) require no code change to carry the new `country_code` field — add a short comment noting this is intentional passthrough, and that the RLS policies from T003 are the actual enforcement point if a payload's `country_code` violates the caller's permitted scope (surfaces as a Postgres error via the existing `error.value`/re-throw pattern)
- [X] T012 [US3] Add a user-facing error message in `SourceFormModal.vue` for the case where a save is rejected by RLS due to an invalid scope (e.g. a tampered request), translating the raw Postgres RLS error into a readable message consistent with the form's existing error-display convention

**Checkpoint**: All three user stories independently functional — correct read visibility (US1), grouped display (US2), and scope-restricted write access (US3) all complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning multiple user stories

- [X] T013 [P] Verify dark/light/high-contrast/colorblind theming renders correctly for the new divider (T008) and country badge (T009) — both should reuse existing CSS custom properties already used throughout `AdminView.vue`/`SourceHealthCard.vue`, so theming should inherit identically; confirm via manual visual pass across all 4 modes
- [X] T014 Update `docs/iş planı istereler.txt`'s Data Ingestion & Monitoring row to note that source-level country scoping (global vs. local visibility/management) has been delivered by spec 002, building on spec 001's health dashboard and source CRUD
- [X] T015 Run `npm run test` and confirm `tests/unit/sourceScope.test.js` (T005) passes with no regressions to existing 001-era Vitest/Deno tests
- [X] T016 Applied to the live/shared Supabase project (2026-07-06, user-approved). `supabase migration repair --status applied` reconciled the 001-era migrations already live but untracked by the CLI; the 5 remote-only entries with no local file (`20260221102710`, `20260410020512`, `20260410020909`, `20260514183132`, `20260514183611`) were marked `--status reverted` per the CLI's own guidance. `supabase db push --include-all` was **not** used for the remaining 13 pre-002 files flagged as "out of order" — inspection showed 6 of them (`20260603_organizations.sql`, `20260603_profiles.sql`, `20260605_cap_drafts.sql`, `20260605_drill_mode.sql`, `20260605_incidents.sql`, `20260703_registration_country_code.sql`) `CREATE POLICY` without a prior `DROP POLICY IF EXISTS`, and those policies already exist live — re-running them via `--include-all` would very likely fail with "policy already exists" mid-migration. Instead, `20260706_data_sources_country_scope.sql`'s content (fully idempotent: `IF NOT EXISTS` / `DROP POLICY IF EXISTS` throughout) was run directly via the Supabase Dashboard SQL Editor, bypassing the CLI's migration-history reconciliation entirely for this one file. Verified live via a read-only REST query: `data_sources.country_code` now exists with no error (table currently empty, 0 rows). **Update (2026-07-06, follow-up completed):** the root cause (multiple migration files sharing an identical date-only version string, e.g. 5 files all versioned `20260603`) has now been fully fixed, not just worked around:
1. All 7 non-idempotent `CREATE POLICY` statements were guarded with `DROP POLICY IF EXISTS` across the 6 files listed above **plus a 7th, previously-missed file** (`20260605_audit_log.sql` — `no_update_audit`, `no_delete_audit`, `super_admin_read_audit`); `20260603_organizations.sql`'s unguarded `ALTER TABLE profiles ADD CONSTRAINT` was wrapped in a `pg_constraint`-checking `DO` block.
2. Every date-collision migration file (18 files across the `20260603`/`20260605`/`20260703`/`20260704` groups) was renamed via `git mv` to a unique full timestamp (`YYYYMMDDHHMMSS`), reordered where necessary to respect real dependencies discovered during review (`profiles` before `organizations` — the latter's `ALTER TABLE profiles ADD CONSTRAINT` requires the table to already exist; `country_code` before `backfill_country_code` — the latter's `UPDATE` requires the column to already exist).
3. The old collision version strings were repaired to `reverted` and all 20 new/existing versions (18 renamed + `20260705` + `20260706`) repaired to `applied` in the remote `schema_migrations` table, one version at a time (batched repair calls intermittently failed with a generic `SqlError`; single-version calls succeeded reliably).
4. Verified: `supabase migration list --linked` now shows every version matching on both local and remote with zero unmatched entries, and `supabase db push --linked` reports **"Remote database is up to date."** — no `--include-all` needed anymore. Re-verified via read-only REST that `data_sources`, `organizations`, `profiles`, `cap_drafts`, `incidents`, `drill_sessions` are all still intact post-repair.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001 adds the column T002/T003's policies reference) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (T002) only — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational (T004 groupSourcesByScope); independent of US1's single comment-only task and of US3
- **User Story 3 (Phase 5)**: Depends on Foundational (T003); independent of US1/US2's UI work, though in practice it's tested against the grouped UI from US2 to see where a newly-scoped source lands
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### Within Each User Story

- Migration tasks (T001→T002→T003) are strictly sequential — same file, and T002/T003 reference the column T001 adds
- T004/T005 (grouping helper + its test) are independent of the migration tasks and of each other's story assignment — can proceed in parallel with Phase 1/2's SQL work
- SourceFormModal changes (T010) should follow SourceHealthCard's country-badge convention (T009) for visual consistency, though they touch different files and could technically proceed in parallel

### Parallel Opportunities

- T004 and T005 (grouping helper + test) can run in parallel with T001–T003 (migration/RLS) — different files, no shared dependency until a story needs both
- T008 (divider styling) can run in parallel with T007 (grouping wire-up) since T008 is a CSS-only addition
- T013 (theming verification) is parallel to T014/T015 (docs/tests) in Polish

---

## Parallel Example: Foundational Phase

```bash
# After T001 adds the column:
Task: "Add RLS read policy narrowing to authenticated/anon roles (T002)"
Task: "Create src/utils/sourceScope.js groupSourcesByScope() (T004)"
Task: "Write src/utils/sourceScope.test.js (T005)"
# T002 and T004/T005 touch different files and can proceed together;
# T003 should follow T002 in the same migration file.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001 — add column)
2. Complete Phase 2: Foundational (T002 — read RLS; T003 — write RLS; T004/T005 — grouping helper + test)
3. Complete Phase 3: User Story 1 (T006 — comment/verification only)
4. **STOP and VALIDATE**: Confirm via quickstart.md §4 that a newly onboarded country's admin sees zero unrelated local sources — this alone resolves the reported problem (Madagascar not seeing Turkey's Kandilli/AFAD), even before the UI grouping (US2) or scope-management UI (US3) exist
5. Deploy/demo if ready (pending T016's migration-repair + push approval)

### Incremental Delivery

1. Setup + Foundational → RLS enforcement + grouping helper ready
2. Add User Story 1 → validate independently → deploy (MVP — solves the core reported problem via RLS alone)
3. Add User Story 2 → validate independently → deploy (adds the requested visual grouping)
4. Add User Story 3 → validate independently → deploy (adds scope management UI)
5. Polish phase → final hardening pass, then the gated live migration (T016)

## Notes

- [P] tasks touch different files with no dependency on an incomplete task
- Commit after each task or logical group; stop at any checkpoint to validate that story alone
- T016 mirrors 001's T032 precedent (a live-database change deferred pending explicit user
  approval) — but additionally requires a `supabase migration repair` step first, since this
  project's migration-tracking history is currently out of sync with what's actually live
  (discovered 2026-07-05, documented in `docs/PROJE_DURUMU.md`)
