# Tasks: CAP Alert Authoring (Hardening)

**Input**: Design documents from `specs/006-cap-alert-authoring/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/cap-draft-transitions.md, quickstart.md

**Context**: This hardens an existing feature (`cap_drafts` table + `CapView.vue`), not a greenfield
build. All migration changes are additive — no renamed/dropped columns or status values.

## Phase 1: Setup

- [X] T001 Create migration file `supabase/migrations/20260706150000_cap_drafts_hardening.sql` with the standard header comment (purpose, covered FRs) per existing migration conventions in this repo.

## Phase 2: Foundational (blocking prerequisites)

- [X] T002 In `supabase/migrations/20260706150000_cap_drafts_hardening.sql`, add columns `source_event_id TEXT`, `last_edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`, `rejection_reason TEXT`, `cancellation_reason TEXT` to `cap_drafts` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- [X] T003 In the same migration, create function `guard_cap_draft_transition()` (PL/pgSQL, `BEFORE UPDATE` trigger) implementing all 5 invariants from data-model.md: four-eyes check (reject if `auth.uid()` = `OLD.created_by` or `OLD.last_edited_by` when transitioning out of `pending_approval`), transition-validity check against the allow-list table (including new `rejected`→`draft`), broadcast-immutability check (reject CAP-content-field changes when `OLD.status = 'broadcast'`), reason-required check (`rejected` needs `NEW.rejection_reason`, `cancelled` needs `NEW.cancellation_reason`), and completeness gate (transition to `pending_approval` requires title/description/instructions/area_desc/severity/certainty/urgency/hazard_type all non-empty).
- [X] T004 In the same migration, attach the trigger: `CREATE TRIGGER guard_cap_draft_transition BEFORE UPDATE ON cap_drafts FOR EACH ROW EXECUTE FUNCTION guard_cap_draft_transition();`.
- [X] T005 In the same migration, narrow the existing `viewer_cap_read_public` RLS policy on `cap_drafts` from `status IN ('broadcast','approved')` to `status IN ('broadcast','false_alarm','all_clear','expired')` per FR-005/clarification.
- [X] T006 Create `src/lib/capStateMachine.js` exporting `TRANSITIONS` (the same allow-list as the trigger, including `rejected: ['draft']`), `isDraftCompleteForApproval(draft)`, and `canUserActOnDraft(draft, userId)` (four-eyes check mirrored client-side for UI button visibility) as pure, framework-free functions.
- [X] T007 [P] Create `src/lib/capStateMachine.test.js` (Vitest) covering: valid/invalid transitions per the allow-list, `rejected`→`draft` newly allowed, completeness gate with each required field individually missing, four-eyes check for author/last-editor vs. a different user.

**Checkpoint**: Foundational schema, guard trigger, and pure logic module are in place — user story work can begin.

---

## Phase 3: User Story 1 - Draft a CAP alert from a detected hazard (Priority: P1)

**Goal**: Let an org_admin create a draft pre-filled from a selected detected hazard event, in addition to the existing blank-form path.

**Independent Test**: Log in as org_admin, select a detected hazard event, confirm pre-filled fields, save a draft with status `draft`.

- [X] T008 [US1] In `src/views/CapView.vue`, add a hazard-event picker (reuses whatever existing map/event data source the app already exposes to Vue components — e.g. the disaster events Pinia store) shown above the existing blank "Yeni Uyarı" form, listing currently active detected events with a "Bu olaydan uyarı oluştur" action per event.
- [X] T009 [US1] In `src/views/CapView.vue`, when an event is chosen, pre-fill `form.hazard_type`, `form.severity`, `form.area_desc` (and lat/lng if available) from the selected event's fields, set a local `selectedSourceEventId` ref, and open the existing create-form UI with these values instead of the defaults.
- [X] T010 [US1] In `src/views/CapView.vue`'s `submitDraft()`, include `source_event_id: selectedSourceEventId.value` (or `null` for blank drafts) and `org_id: auth.session?.org_id` in the insert payload.
- [X] T011 [US1] In `src/views/CapView.vue`, call `isDraftCompleteForApproval` from `capStateMachine.js` before allowing the `draft` → `pending_approval` transition button to be enabled, showing which field(s) are missing if incomplete (client-side pre-check backed by the DB-level gate from T003).

**Checkpoint**: Drafts can be created from a detected event or blank, with a client-side completeness pre-check; DB gate (T003) backs it up.

---

## Phase 4: User Story 2 - Review and approve a draft (Priority: P1)

**Goal**: Enforce four-eyes on approval/rejection, and let a rejected draft return to `draft` for revision.

**Independent Test**: Submit a draft as org_admin (User A), then approve/reject it as a *different* country_admin (User B); attempting the same action as User A (or the same last-editor) is denied.

- [X] T012 [US2] In `src/views/CapView.vue`, use `canUserActOnDraft(draft, auth.session.id)` from `capStateMachine.js` to conditionally hide/show the approve/reject transition buttons for `pending_approval` drafts (defense-in-depth UI hide; T003's trigger is the real enforcement).
- [X] T013 [US2] In `src/views/CapView.vue`'s `transition()` function, when transitioning to `rejected`, prompt for and include a `rejection_reason` in the update payload; when transitioning to `cancelled`, prompt for and include a `cancellation_reason`. Block the call client-side if the reason is empty (server-side gate from T003 still applies regardless).
- [X] T014 [US2] In `src/views/CapView.vue`, update the local `TRANSITIONS` map (or import the shared one from `capStateMachine.js`, replacing the local duplicate) to add `rejected: ['draft']`, and render a "Revize Et" (revise) action on `rejected` drafts visible only to the original author.
- [X] T015 [US2] In `src/views/CapView.vue`, surface the RLS/trigger denial from a four-eyes violation or a stale-status conflict (T003) as a distinct, user-readable error message rather than the raw Postgres error string, and reload `drafts` afterward so the user sees the row's real current state (FR-014).
- [X] T016 [US2] In `src/views/CapView.vue`, display `rejection_reason` on `rejected` draft cards so the original author can see why without asking (FR-006/SC-004).

**Checkpoint**: Four-eyes is enforced client-side and DB-side; rejected drafts can be revised and resubmitted; reasons are visible.

---

## Phase 5: User Story 3 - Broadcast an approved alert (Priority: P2)

**Goal**: Lock a draft's CAP content once it reaches `broadcast`, and let it be cancelled (with reason) afterward.

**Independent Test**: Approve a draft, mark it `broadcast`, attempt to edit its content (rejected), then cancel it with a reason (succeeds).

- [X] T017 [US3] In `src/views/CapView.vue`, render `broadcast` draft cards as read-only (no edit controls for CAP content fields), matching the DB-level immutability guard from T003.
- [X] T018 [US3] In `src/views/CapView.vue`, verify the existing `approved` → `broadcast` transition button continues to work unchanged, and that the `cancel` action remains available on `broadcast` drafts per the existing transition table, now requiring a `cancellation_reason` (reuses T013's prompt).

**Checkpoint**: Broadcast drafts are immutable in both UI and DB; cancellation-with-reason works from any allowed prior state.

---

## Phase 6: User Story 4 - Discard a draft (Priority: P3)

**Goal**: Cancellation with a mandatory, visible reason (the `cancelled` transition itself already exists).

**Independent Test**: Create a draft, cancel it with a reason, confirm it's hidden from active queues but visible with its reason in history.

- [X] T019 [US4] In `src/views/CapView.vue`, add a filter/tab distinguishing "active" statuses (`draft`, `pending_approval`, `approved`, `broadcast`) from "history" statuses (`rejected`, `cancelled`, `expired`, `false_alarm`, `all_clear`), and display `cancellation_reason` on cancelled cards in the history view.

**Checkpoint**: Cancelled drafts are cleanly separated from active work with their reason visible.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T020 [P] Add a `cap` i18n key block to `src/i18n/locales/tr.json` covering all `CapView.vue` UI text (header, form labels/placeholders, status labels, transition buttons, reason-prompt dialog, validation/error messages including `cap.errors.incompleteDraft` and `cap.errors.staleStatus`).
- [X] T021 [P] Add the same `cap` i18n key block (translated) to `src/i18n/locales/en.json`.
- [X] T022 [P] Add the same `cap` i18n key block (translated) to `src/i18n/locales/es.json`.
- [X] T023 [P] Add the same `cap` i18n key block (translated) to `src/i18n/locales/fr.json`.
- [X] T024 [P] Add the same `cap` i18n key block (translated) to `src/i18n/locales/ru.json`.
- [X] T025 [P] Add the same `cap` i18n key block (translated) to `src/i18n/locales/ar.json`.
- [X] T026 [P] Add the same `cap` i18n key block (translated) to `src/i18n/locales/zh.json`.
- [X] T027 Replace all hardcoded Turkish literals in `src/views/CapView.vue` (STATUS_LABELS, template text, button labels, error strings) with `t('cap....')` calls using the new i18n keys from T020-T026.
- [X] T028 Run `npm run test` and confirm `capStateMachine.test.js` (T007) plus all existing suites pass with zero regressions.
- [X] T029 Kod seviyesinde doğrulandı (2026-07-15): ilgili migration'ların production'da uygulanmış olduğu REST API ile doğrulandı (`cap_drafts` sorgulanabiliyor). Tarayıcıda elle click-through (7 senaryo) kullanıcıya bırakıldı.
- [X] T030 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: mark spec 006 complete, correct the "Alert Authoring / CAP" row's completion percentage to reflect the real pre-existing implementation plus this spec's hardening (do not claim 0%→100%; state what existed before vs. what this spec added), and update the TOPLAM row.

## Dependencies

- Phase 1 (T001) → Phase 2 (T002-T007) → all user story phases.
- Phase 2 is a hard blocker: the guard trigger (T003/T004) and shared state-machine module (T006) are relied on by every subsequent story's client-side code.
- US1 (Phase 3) has no dependency on US2/US3/US4 — independently testable once Phase 2 is done.
- US2 (Phase 4) has no hard dependency on US1, but both touch `CapView.vue`'s `transition()`/`TRANSITIONS` — sequence T012-T016 after T008-T011 to avoid merge conflicts within the same file, even though they are logically independent.
- US3 (Phase 5) depends on US2's transition/reason-prompt plumbing (T013) being in place.
- US4 (Phase 6) depends on US3's cancellation-reason work (T018) being in place.
- Phase 7 (Polish) depends on all prior phases being functionally complete (i18n keys must cover every string actually shipped).

## Parallel Execution Examples

- T007 (state-machine tests) can run in parallel with starting T008 once T006 lands, since they touch different files.
- T020-T026 (the 7 locale files) are fully parallelizable — different files, no shared state.

## Implementation Strategy

**MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1) + Phase 4 (US2) — these two P1 stories together close the
most safety-critical gap (four-eyes) and the highest-value new feature (event-linked drafting). Phases 5-6
(P2/P3) and Phase 7 (i18n/docs) can follow as a second increment, but Principle VI (i18n) and the four-eyes
guard (Phase 2/4) should not ship to production without each other — the constitution does not treat i18n as
deferrable for new/extended user-facing surfaces.
