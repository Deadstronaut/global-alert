---

description: "Task list for Region-Scoped Dissemination Targeting (spec 015)"
---

# Tasks: Region-Scoped Dissemination Targeting

**Input**: Design documents from `/specs/015-region-dispatch-targeting/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/region-dispatch-matching.md, quickstart.md

**Tests**: Included — `matchesContact()` is recipient-determining logic for alert dispatch, the same class of
non-negotiable test-first zone as CAP export/state machines per the constitution.

**Organization**: Tasks are grouped by user story (US1–US2) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/functions/`, `supabase/migrations/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707180000_cap_drafts_region_code.sql` with a header comment describing scope (Dissemination region-scoped targeting, spec 015)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `region_code` column on `cap_drafts` is the data both user stories depend on — US1's matching logic
has nothing to read without it, and US2's form input has nowhere to write.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T002 Add `region_code TEXT NULL` column to `cap_drafts` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the new migration — idempotent, no default needed (NULL is the correct default), no NOT NULL constraint (must stay optional per FR-002)

**Checkpoint**: `cap_drafts` can now store a region; nothing reads or writes it yet.

---

## Phase 3: User Story 1 - Operator scopes an alert to the affected region (Priority: P1) 🎯 MVP

**Goal**: A broadcast CAP alert with a region set reaches only contacts in that region (plus region-unset contacts);
an alert with no region set behaves exactly as before.

**Independent Test**: Create two contacts in the same country with different `region_code` values; broadcast a CAP
alert with a `region_code` matching only one of them; confirm only the matching contact's dispatch receipt is
created (per quickstart.md Scenario 1), and confirm a region-less draft still reaches both (Scenario 2).

### Implementation for User Story 1

- [X] T003 [P] [US1] In `supabase/functions/shared/dispatchMatching.ts`, add `region_code: string | null` to both the `DispatchableContact` and `DispatchableCapDraft` interfaces (contract: `contracts/region-dispatch-matching.md`)
- [X] T004 [US1] In the same file, extend `matchesContact()` with the region rule: exclude the contact only if both `contact.region_code` and `draft.region_code` are non-null/non-empty after `trim()` + `toLowerCase()` and they differ; otherwise the region check always passes. Must be ANDed with all existing checks (country_code, hazard_type_filter, opt-in), never replacing them
- [X] T005 [P] [US1] Extend `supabase/functions/shared/dispatchMatching.test.ts` with the 7 test cases from `contracts/region-dispatch-matching.md`'s table (both-null, contact-only, draft-only, exact match, case/whitespace-insensitive match, genuine mismatch, empty-string-treated-as-unset); also update the existing `baseContact`/`draft` fixtures to include `region_code: null` so they stay consistent with the now-required interface field (analysis finding F2 — masked by `--no-check` at runtime, but fixtures should still match their declared type)
- [X] T006 [US1] In `supabase/functions/dispatch-alert/index.ts`, update the `draftForMatching` object construction (currently `{ country_code: draft.country_code, hazard_type: draft.hazard_type }`) to also include `region_code: draft.region_code` — without this, `region_code` never reaches `matchesContact()` even though the column and matching logic exist (research.md's "wiring fix" finding)

**Checkpoint**: User Story 1 fully functional and independently testable — region-scoped dispatch works end-to-end at the data/matching/wiring layer, even before any UI exists to set a region (a region could already be set via direct DB access for testing).

---

## Phase 4: User Story 2 - Operator records which region an alert affects (Priority: P2)

**Goal**: An operator can enter a region value in the CAP draft authoring form, using the same free-text convention
as the existing contact region field; leaving it blank preserves country-wide targeting.

**Independent Test**: Open the alert drafting form, enter a region value, save the draft, reopen it, and confirm the
value persists and displays (quickstart.md Scenario 5).

### Implementation for User Story 2

- [X] T007 [US2] In `src/views/CapView.vue`, add an optional text input for `region_code` next to the existing `area_desc` field in the draft create/edit form, bound to the draft's `region_code` value and included in the insert/update payload
- [X] T008 [P] [US2] Add `cap.regionCode` (label) i18n key to all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh) — small enough to hand-edit directly, consistent with prior specs' i18n additions

**Checkpoint**: Both user stories independently functional — operators can set a region from the UI (US2) and dispatch correctly narrows by it (US1).

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T009 Run `npm run test` (frontend Vitest) and `deno test --no-check --allow-net --allow-env supabase/functions/shared/` (established project command per specs 001/003/004/005/008/009 — `--no-check` works around a pre-existing esm.sh type-declaration mismatch, unrelated to this feature) and confirm all existing and new tests pass with no regressions (analysis finding F1)
- [X] T010 Run `npm run build` and confirm a clean build
- [X] T011 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Dissemination module's "polygon/geofence bazlı hedefleme (şu an sadece ülke bazlı)" remaining-gap line is now closed at the region-code-matching level — update its completion percentage accordingly (note: full PostGIS/polygon geofencing remains explicitly out of scope, tracked separately under Risk & Scenario Modeling)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both user stories (`region_code` column underpins both)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational only — independent of US1's matching-logic changes, though the
  two stories are only *meaningfully* observable together (a UI to set a region, and matching logic that uses it)
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- T003 and T005 can be scaffolded in parallel (interface change vs. its test file), though T005's new cases assert
  against T004's not-yet-written logic — sequence T003 → T004 → T005 in practice despite the [P] marker being valid
  for T003 alone
- T007 and T008 (UI input + i18n) can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (`region_code` column)
3. Complete Phase 3: User Story 1 (matching logic + wiring fix)
4. **STOP and VALIDATE**: quickstart.md Scenarios 1–4 — region-scoped dispatch works correctly even without a UI
   entry point (region could be set directly for validation)

### Incremental Delivery

1. Setup + Foundational → column exists
2. Add Story 1 → validate → dispatch correctly narrows by region when set programmatically
3. Add Story 2 → validate → operators can set a region from the authoring UI
4. Polish (test/build verification, docs)

---

## Notes

- No new table — this is a single additive column plus a pure-function extension (plan.md's Structure Decision)
- Migrations are provided as exact CLI commands to the user for manual application once implementation is complete
- Commit only when explicitly requested by the user
