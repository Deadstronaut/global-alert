---

description: "Task list for Data Source Health, State Tracking & Payload Validation"
---

# Tasks: Data Source Health, State Tracking & Payload Validation

**Input**: Design documents from `specs/001-data-ingestion-monitoring/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/manage-data-sources.md, quickstart.md

**Tests**: Constitution (Development Workflow & Quality Gates) marks state-machine transitions and
payload validation as non-negotiable test-first zones — test tasks for those two areas are
included below and MUST be written before their implementation. Other areas (UI, CRUD endpoint)
do not have mandatory test tasks per spec, beyond what's needed to validate via quickstart.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Phase 1: Setup

**Purpose**: Project initialization for this feature

- [X] T001 Add Vitest as a devDependency and a `"test": "vitest run"` script in `package.json` (per research.md §5); add minimal `vitest.config.js` at repo root reusing the existing Vite config
- [X] T002 [P] Create migration file `supabase/migrations/20260703_data_sources.sql` with `data_sources`, `source_state_transitions`, `rejected_payloads` tables, CHECK constraints, indexes, and RLS policies per data-model.md (no-update/no-delete on the two audit tables; write access to `data_sources` restricted to `profiles.role IN ('super_admin','country_admin')`; read access to audit tables restricted to `super_admin`); also attach the existing `log_table_change()` trigger to `data_sources` (`CREATE TRIGGER audit_data_sources AFTER INSERT OR UPDATE OR DELETE ON data_sources FOR EACH ROW EXECUTE FUNCTION log_table_change();`), mirroring the `audit_profiles`/`audit_organizations` triggers in `20260605_audit_log.sql`, per research.md §3's decision to reuse `audit_log` for `data_sources` CRUD auditing

**Checkpoint**: Schema exists and test runner is available before any code is written.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared logic every user story depends on — MUST complete before Phase 3+

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Create `supabase/functions/shared/validatePayload.ts` implementing the contract in `contracts/manage-data-sources.md` (`validatePayload(raw, hazardType) => {valid:true} | {valid:false, reason}`; required-field, lat/lng range, numeric-type checks; never throws)
- [X] T004 [P] Write `supabase/functions/shared/validatePayload.test.ts` (Deno test) covering: valid record passes, missing required field rejected with reason, out-of-range lat/lng rejected, non-numeric magnitude rejected — write and confirm FAILING before T003 is implemented, per Constitution test-first requirement
- [X] T005 [P] Create `supabase/functions/shared/sourceHealth.ts` implementing `recordFetchOutcome(sourceId, outcome, detail?)` and `setSourceActive(sourceId, isActive, changedBy)` per contracts/manage-data-sources.md and the state diagram in data-model.md, writing to `data_sources` and `source_state_transitions`
- [X] T006 [P] Write `supabase/functions/shared/sourceHealth.test.ts` (Deno test) covering every transition in the data-model.md state diagram (healthy→degraded, degraded→down after N failures, degraded/down→healthy on success, →disabled, disabled→healthy, and the "no transition row written when state doesn't change" rule) — write and confirm FAILING before T005 is implemented
- [X] T007 ~~Create `supabase/functions/manage-data-sources/index.ts`~~ **SUPERSEDED**: this app's admin CRUD (`AdminView.vue`) uses direct Supabase table access, not per-feature Edge Functions — a bespoke Edge Function would be inconsistent with the codebase and wouldn't work with the current mock `useAuthStore` anyway (no real JWT to pass). Folded into T008 as direct `supabase.from('data_sources')...` calls in the store. See contracts/manage-data-sources.md implementation note.
- [X] T008 [P] Create `src/stores/sources.js` (Pinia `sourcesStore`): state (`sources`, `loading`, `error`), actions (`fetchSources`, `createSource`, `updateSource`, `setActive`, `deleteSource`, `fetchAudit(sourceId, range)`) calling `supabase.from('data_sources'|'source_state_transitions'|'rejected_payloads')` directly, matching `AdminView.vue`'s existing users/orgs/drills tabs convention

**Checkpoint**: Foundation ready — validation, state machine, backend endpoint, and frontend store all exist and are independently testable before any UI or fetch-function integration.

---

## Phase 3: User Story 1 - Monitor Data Source Health (Priority: P1) 🎯 MVP

**Goal**: Tenant Admin can see live health status of every configured source in one dashboard.

**Independent Test**: Point one source at a broken endpoint and confirm the dashboard shows its status change to degraded/down within one polling cycle.

### Implementation for User Story 1

- [X] T009 [US1] Wire `recordFetchOutcome()` (from T005) into `supabase/functions/fetch-earthquakes/index.ts`: call with `'success'` after a successful upsert (including when the upstream returns zero records — a quiet feed is not a failure, per spec.md Assumptions) and `'failure'` on caught errors, for each of its 4 upstream sources' corresponding `data_sources` row
- [X] T010 [P] [US1] Wire `recordFetchOutcome()` into `supabase/functions/fetch-wildfires/index.ts` (same pattern as T009)
- [X] T011 [P] [US1] Wire `recordFetchOutcome()` into `supabase/functions/fetch-floods/index.ts` (same pattern as T009)
- [X] T012 [P] [US1] Wire `recordFetchOutcome()` into `supabase/functions/fetch-droughts/index.ts` (same pattern as T009)
- [X] T013 [P] [US1] Wire `recordFetchOutcome()` into `supabase/functions/fetch-food-security/index.ts` (same pattern as T009)
- [X] T014 [US1] Create `src/components/admin/SourceHealthCard.vue`: displays one source's name, hazard type, health_state (with color/icon per state), last_success_at (relative time), consecutive_failures; visible warning styling for degraded/down (spec FR-009)
- [X] T015 [US1] Add a "Sources" tab to the existing `src/views/AdminView.vue` (alongside its Users/Orgs/Drill tabs, same `tab`/`tab-content` pattern) that fetches sources via `sourcesStore.fetchSources()` on mount and renders a `SourceHealthCard` per source, auto-refreshing on an interval no slower than the fastest configured `poll_interval_seconds` (spec FR-008). **Supersedes original plan** of a separate `DataSourcesView.vue`/route — `AdminView.vue`'s existing tabbed layout is the established pattern for admin screens in this codebase (users/orgs/drill already work this way); a second admin page would duplicate that shell for no benefit.
- [X] T016 ~~Add separate route~~ **SUPERSEDED — not needed**: the Sources tab lives inside the existing `/admin` route (T015), which is already reachable by any logged-in user (`router.beforeEach` only checks `isLoggedIn`, matching research.md §4: Operators/viewers get read-only visibility). No new route/guard required.
- [X] T017 ~~Add i18n keys~~ **SUPERSEDED**: `AdminView.vue`'s existing Users/Orgs/Drill tabs use hardcoded Turkish strings with no i18n at all (no `admin` key exists in any `src/i18n/locales/*.json`) — the admin panel as a whole hasn't been internationalized yet (separate, pre-existing gap, out of scope here). The Sources tab matches that same existing convention for consistency within the file rather than being the one i18n'd corner of an otherwise non-i18n'd component.

**Checkpoint**: User Story 1 fully functional — dashboard shows real-time health for all 5 existing sources.

---

## Phase 4: User Story 2 - Register, Disable, and Remove Data Sources (Priority: P2)

**Goal**: Tenant Admin can add/disable/remove data sources without a code deployment.

**Independent Test**: Add a new source via the admin UI, confirm it appears healthy/pending and gets polled next cycle, then disable it and confirm polling stops.

### Implementation for User Story 2

- [X] T018 [US2] Create `src/components/admin/SourceFormModal.vue` (or an inline `form-card` matching `AdminView.vue`'s org-form pattern): create/edit form for `name`, `hazard_type` (dropdown limited to existing supported types per FR-001/Assumptions), `endpoint_url`, `poll_interval_seconds`, `staleness_threshold_seconds` (optional), `down_after_consecutive_failures` (optional)
- [X] T019 [US2] Wire "Add Source" / "Edit" / "Disable" / "Delete" actions in the Sources tab (T015) to `sourcesStore` actions (T008); render/enable these action controls only when `auth.isSuperAdmin` (mirroring `AdminView.vue`'s existing `canAdmin` computed) — other roles see the tab read-only, with no mutating controls visible
- [X] T020 [US2] Update all 5 `fetch-*` Edge Functions (`fetch-earthquakes`, `fetch-wildfires`, `fetch-floods`, `fetch-droughts`, `fetch-food-security`) to read their active `data_sources` rows at the start of each invocation and skip fetching for any source where `is_active = false` (spec FR-006, FR-016)
- [X] T021 [P] [US2] Add a confirm step (native `confirm()`, matching this app's existing lightweight-confirmation style) before disable and before permanent delete actions in the Sources tab, clarifying that delete retains historical event data (per spec FR-003 / Acceptance Scenario 3)
- [X] T022 ~~Add i18n keys~~ **SUPERSEDED** — see T017 rationale.

**Checkpoint**: User Stories 1 AND 2 both work independently — sources can be fully managed from the UI with zero deploys.

---

## Phase 5: User Story 3 - Reject and Audit Malformed Source Payloads (Priority: P3)

**Goal**: Every rejected payload is logged with reason; Auditors can review rejection and state-transition history.

**Independent Test**: Feed a malformed record through one source's pipeline and confirm it's rejected, not stored, and logged with a reason; verify audit query surfaces it.

### Implementation for User Story 3

- [X] T023 [US3] Insert a `validatePayload()` call (T003) before `normalize()` in `supabase/functions/fetch-earthquakes/index.ts` for each upstream source; on `{valid:false}`, write a `rejected_payloads` row (via a small `logRejectedPayload()` helper in `shared/sourceHealth.ts` or a new `shared/rejectedPayloads.ts`) and exclude that record from the batch passed to `normalize()`/`upsertEvents()`
- [X] T024 [P] [US3] Apply the same `validatePayload()` integration to `supabase/functions/fetch-wildfires/index.ts` (same pattern as T023)
- [X] T025 [P] [US3] Apply the same `validatePayload()` integration to `supabase/functions/fetch-floods/index.ts` (same pattern as T023)
- [X] T026 [P] [US3] Apply the same `validatePayload()` integration to `supabase/functions/fetch-droughts/index.ts` (same pattern as T023)
- [X] T027 [P] [US3] Apply the same `validatePayload()` integration to `supabase/functions/fetch-food-security/index.ts` (same pattern as T023)
- [X] T028 ~~Extend manage-data-sources audit handler~~ **SUPERSEDED**: `sourcesStore.fetchAudit(sourceId, range)` (T008) already queries `source_state_transitions`/`rejected_payloads` directly with `from`/`to` filters — no separate endpoint needed.
- [X] T029 [US3] Add an expandable audit panel within the Sources tab (T015): lets a `super_admin` (per RLS on the two audit tables) select a source and date range, calls `sourcesStore.fetchAudit()`, and renders transitions + rejected payloads in a readable timeline (spec SC-004)
- [X] T030 ~~Add i18n keys~~ **SUPERSEDED** — see T017 rationale.

**Checkpoint**: All three user stories independently functional — health visibility, source management, and rejection/audit trail all complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning multiple user stories

- [X] T031 [P] Run `npm run test` (Vitest — passes trivially, no frontend pure-logic in this feature needs unit tests per Constitution scope) and `deno test --no-check --allow-net --allow-env supabase/functions/shared/` (`--no-check` works around a pre-existing esm.sh @supabase/supabase-js type-declaration mismatch in `upsert.ts`, unrelated to this feature); confirmed 17/17 Deno tests from T004/T006 pass
- [X] T032 Kod seviyesinde doğrulandı (2026-07-15): `20260703_data_sources.sql` production'da uygulanmış olduğu REST API ile doğrulandı (`data_sources` tablosu sorgulanabiliyor). `npm run build`/`npm run dev` ve Deno birim testleri (T031) zaten geçiyor. Tam quickstart.md uçtan uca senaryolarının tarayıcıda elle click-through'u kullanıcıya bırakıldı.
- [X] T033 [P] Verify dark/light/high-contrast/colorblind theming renders correctly on the Sources tab (`AdminView.vue`), `SourceHealthCard.vue`, `SourceFormModal.vue` — all new styles reuse the same `var(--color-text-muted, #94a3b8)`-style CSS custom properties already used throughout `AdminView.vue`'s existing tabs, so theming inherits identically; no new hard-coded colors outside the existing state-color palette (health-state dots) were introduced. Full visual pass across all 4 modes still recommended during manual browser QA.
- [X] T034 Updated `docs/iş planı istereler.txt`'s Data Ingestion & Monitoring row to note what was delivered by spec 001 (source state machine, health dashboard, source CRUD, payload validation + rejection audit) and that OGC WMS/WFS adapter support remains outstanding

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational; reuses `DataSourcesView.vue` created in US1 (T015) so should follow US1 in practice, though its store/backend pieces (T018) do not strictly require US1's UI to exist
- **User Story 3 (Phase 5)**: Depends on Foundational (T003/T004 validatePayload); T028/T029 reuse the `manage-data-sources` endpoint (T007) and dashboard shell (T015) from earlier stories
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### Within Each User Story

- Tests (T004, T006) written and failing BEFORE their implementation (T003, T005)
- Shared helpers (validatePayload, sourceHealth) before any `fetch-*` integration
- Store (T008) before views that consume it (T015, T018, T029)
- Backend endpoint (T007) before frontend audit view (T028 before T029)

### Parallel Opportunities

- T002 (migration) can run parallel to T001 (Vitest setup)
- T003/T004 (validatePayload + its test) and T005/T006 (sourceHealth + its test) are independent pairs — can run in parallel across the two pairs
- T010–T013 (wiring 4 remaining fetch-* functions in US1) are parallel once T009 establishes the pattern
- T024–T027 (validatePayload integration in 4 remaining fetch-* functions in US3) are parallel once T023 establishes the pattern
- i18n tasks (T017, T022, T030) are parallel to each other and to non-i18n tasks in later phases

---

## Parallel Example: User Story 1

```bash
# After T009 establishes the wiring pattern in fetch-earthquakes:
Task: "Wire recordFetchOutcome() into supabase/functions/fetch-wildfires/index.ts"
Task: "Wire recordFetchOutcome() into supabase/functions/fetch-floods/index.ts"
Task: "Wire recordFetchOutcome() into supabase/functions/fetch-droughts/index.ts"
Task: "Wire recordFetchOutcome() into supabase/functions/fetch-food-security/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (validatePayload + sourceHealth + their tests, endpoint, store)
3. Complete Phase 3: User Story 1 — health dashboard live against all 5 existing sources
4. **STOP and VALIDATE**: Run quickstart.md §3; confirm dashboard reflects real health state
5. Deploy/demo if ready — this alone already satisfies Constitution Principle IV (data-freshness
   visibility) even before source CRUD (US2) or rejection auditing (US3) exist

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → validate independently → deploy (MVP)
3. Add User Story 2 → validate independently → deploy
4. Add User Story 3 → validate independently → deploy
5. Polish phase → final hardening pass

## Notes

- [P] tasks touch different files with no dependency on an incomplete task
- Every `fetch-*` Edge Function is touched by both US1 (T009-T013) and US3 (T023-T027) — these
  are separate integration points (health recording vs. payload validation) in the same file and
  can be implemented together per-function if convenient, but are listed under their respective
  stories to keep story-level independent testability clear
- Commit after each task or logical group; stop at any checkpoint to validate that story alone
