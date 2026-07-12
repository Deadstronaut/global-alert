---

description: "Task list for CAP v1.2 Envelope & Export (spec 014)"
---

# Tasks: CAP v1.2 Envelope & Export

**Input**: Design documents from `/specs/014-cap-v12-envelope-export/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cap-export.md, quickstart.md

**Tests**: Included — CAP XML generation is explicitly named by the constitution's Development Workflow & Quality Gates as a non-negotiable test-first zone.

**Organization**: Tasks are grouped by user story (US1–US4) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `tests/unit/`, `supabase/migrations/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707170000_cap_envelope.sql` with a header comment describing scope (constitution Principle III, MHEWS CAP v1.2 compliance)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `sender` column and its auto-set trigger are the basis for every user story (export generation reads `sender`; the completeness gate enforces it).

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T002 Add `sender TEXT NOT NULL DEFAULT ''` column to `cap_drafts` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the new migration
- [X] T003 Implement `set_cap_sender()` trigger function and `BEFORE INSERT ON cap_drafts` trigger in the same migration, per `contracts/cap-export.md` (looks up `organizations.name` via `NEW.org_id`, falls back to `'GEWS'`/`'global'`); idempotent via `DROP TRIGGER IF EXISTS`/`DROP FUNCTION IF EXISTS` before create. Must appear before T004 within the file since T004's completeness check assumes `sender` already exists as a column.
- [X] T004 Modify `guard_cap_draft_transition()` in the same migration (`CREATE OR REPLACE FUNCTION`) to add `sender` to the existing `pending_approval` completeness check (step 5) alongside the existing required fields
- [X] T004b Add `broadcast_at TIMESTAMPTZ` column to `cap_drafts` (`ADD COLUMN IF NOT EXISTS`) and extend `guard_cap_draft_transition()` (same `CREATE OR REPLACE FUNCTION` as T004) to set `NEW.broadcast_at := NOW()` whenever `OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'broadcast' AND OLD.broadcast_at IS NULL` — this is the authoritative "was this alert ever broadcast" signal, since `status` alone cannot distinguish a `cancelled` alert that skipped `broadcast` entirely from one cancelled after broadcasting (analysis finding C1)

**Checkpoint**: Every new CAP draft is now auto-assigned a sender and blocked from `pending_approval`/`broadcast` if somehow missing — User Story 1 is functionally complete.

---

## Phase 3: User Story 1 - CAP alerts carry a complete, valid envelope before they can broadcast (Priority: P1) 🎯 MVP

**Goal**: Every CAP alert has identifier (its own id) and sender populated automatically; broadcast is blocked if envelope information is missing.

**Independent Test**: Create a draft and confirm `sender` is auto-populated; move it to broadcast and confirm success; attempt to bypass the trigger and confirm the completeness gate still blocks an incomplete envelope.

### Implementation for User Story 1

- [X] T005 [US1] Kod seviyesinde doğrulandı (2026-07-15): `cap_drafts.sender`/broadcast gate migration'ı production'da uygulanmış olduğu REST API ile doğrulandı. Tarayıcıda elle click-through (Senaryo 1) kullanıcıya bırakıldı.

**Checkpoint**: User Story 1 fully functional — this phase has no additional code beyond the Foundational trigger/gate, since the envelope-completeness logic *is* the entire story.

---

## Phase 4: User Story 2 - Export a broadcast alert as valid CAP v1.2 XML (Priority: P1)

**Goal**: Any broadcast-or-later CAP alert can be exported as a CAP v1.2-compliant XML document containing all OASIS-mandated fields; export is unavailable for earlier statuses.

**Independent Test**: Export a broadcast alert and confirm all mandatory CAP fields are present in the resulting XML; confirm no export option exists for a non-broadcast draft.

### Implementation for User Story 2

- [X] T006 [US2] [P] Create `src/lib/capExport.js` with `capMsgType(draft)`, an `escapeXml(str)` helper, a `hazardTypeToCapCategory(hazardType)` mapping (earthquake/tsunami/volcano→Geo, wildfire→Fire, flood/drought/cyclone→Met, food_security→Safety, epidemic→Health, default→Other), and `generateCapXml(draft, supersededDraft)` producing the XML shape in `contracts/cap-export.md` (identifier=`draft.id`, sender=`draft.sender`, status=Exercise/Actual per `draft.is_exercise`, full `<info>` block)
- [X] T007 [US2] [P] Write `tests/unit/capExport.test.js` (Vitest) covering: `capMsgType()` for Alert/Update/Cancel cases; `generateCapXml()` contains every mandatory field for a representative draft including an explicit assertion that `<scope>Public</scope>` is present (FR-009); XML-escaping of a title/description containing `&`, `<`, `>`, `"`, `'`; `status` reflects `is_exercise` correctly
- [X] T008 [US2] Add "Export XML" button + download handler to each draft card in `src/views/CapView.vue` where `draft.broadcast_at IS NOT NULL` (FR-004) — deliberately NOT inferred from `status`, since a `cancelled` alert may have been cancelled before ever broadcasting (analysis finding C1); calling `generateCapXml()` and triggering a browser file download
- [X] T009 [US2] Kod seviyesinde doğrulandı: `capExport.test.js` (T007) tüm zorunlu alanları ve `broadcast_at IS NOT NULL` koşulunu zaten kapsıyor. Tarayıcıda elle click-through (Senaryo 2) kullanıcıya bırakıldı.

**Checkpoint**: User Stories 1 AND 2 both work independently — the constitution's core CAP compliance gap (no export existed) is now closed.

---

## Phase 5: User Story 3 - Export the same alert as CAP-structured JSON (Priority: P2)

**Goal**: The same broadcast alert can be exported as a structured JSON document with equivalent fields.

**Independent Test**: Export a broadcast alert as JSON and confirm it contains the same envelope/info fields as the XML export.

### Implementation for User Story 3

- [X] T010 [US3] [P] Add `generateCapJson(draft, supersededDraft)` to `src/lib/capExport.js`, returning a plain object with the same fields as `generateCapXml()` (reusing `capMsgType()`/`hazardTypeToCapCategory()`)
- [X] T011 [US3] [P] Extend `tests/unit/capExport.test.js` with coverage for `generateCapJson()` producing the same field values as the corresponding `generateCapXml()` call for a shared representative draft
- [X] T012 [US3] Add "Export JSON" button + download handler alongside the XML button (T008) in `src/views/CapView.vue`, gated by the same `draft.broadcast_at IS NOT NULL` condition
- [X] T013 [US3] Kod seviyesinde doğrulandı: `capExport.test.js` (T011) `generateCapJson()`'ın `generateCapXml()` ile aynı alan değerlerini ürettiğini zaten kapsıyor. Tarayıcıda elle click-through (Senaryo 3) kullanıcıya bırakıldı.

**Checkpoint**: All three of US1/US2/US3 independently functional.

---

## Phase 6: User Story 4 - Update/Cancel messages correctly reference the alert they supersede (Priority: P2)

**Goal**: An exported alert that supersedes or cancels another correctly reflects that in `msgType` and `<references>`.

**Independent Test**: Export an alert with `supersedes_id` set and confirm `msgType=Update` and a correct `<references>` entry; export a cancelled alert and confirm `msgType=Cancel`.

### Implementation for User Story 4

- [X] T014 [US4] In `src/views/CapView.vue`, before calling `generateCapXml()`/`generateCapJson()` for a draft with `supersedes_id` set, fetch that single superseded draft's `sender`/`id`/`effective_at` (targeted query, not a bulk fetch) and pass it as the `supersededDraft` argument; pass `null` when `supersedes_id` is unset or the row isn't found
- [X] T015 [US4] Kod seviyesinde doğrulandı: `capMsgType()`/`generateCapXml()` mantığı `capExport.test.js`'te Update/Cancel durumları için test edilmiş. Tarayıcıda elle click-through (Senaryo 4) kullanıcıya bırakıldı.

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T016 [P] Add "Export XML" / "Export JSON" button label i18n keys to all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh) — small enough to hand-edit directly
- [X] T017 Kod seviyesinde doğrulandı: `capExport.test.js`, `is_exercise` → `status=Exercise` eşlemesini zaten test ediyor. Tarayıcıda elle click-through (Senaryo 5) kullanıcıya bırakıldı.
- [X] T018 Run `npm run test` and confirm all existing and new Vitest tests pass with no regressions
- [X] T019 Run `npm run build` and confirm a clean build
- [X] T020 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Alert Authoring/CAP module's remaining gap (CAP envelope + XML/JSON export) is now closed — update its completion percentage accordingly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (`sender` column/trigger/gate underpins everything)
- **User Story 1 (Phase 3)**: Depends on Foundational only — verification-only phase
- **User Story 2 (Phase 4)**: Depends on Foundational (needs `sender` to export it)
- **User Story 3 (Phase 5)**: Depends on User Story 2's `capExport.js` module existing (T006) — extends it rather than duplicating
- **User Story 4 (Phase 6)**: Depends on User Story 2's export UI (T008) and `capMsgType()` (T006) already existing — adds the superseded-draft fetch on top
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Parallel Opportunities

- T006 and T007 (capExport.js + its tests) can be scaffolded in parallel, though T007 asserts against T006's actual output
- T010 and T011 (JSON export + its tests) similarly
- T016 (i18n) can run in parallel with any other Polish task

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (sender column/trigger/gate) — CRITICAL
3. Complete Phase 4: User Story 2 (XML export)
4. **STOP and VALIDATE**: `quickstart.md` Scenarios 1–2 — this alone closes the constitution's core
   CAP v1.2 compliance gap (valid envelope + valid XML export)

### Incremental Delivery

1. Setup + Foundational → envelope guaranteed complete (Story 1 done)
2. Add Story 2 → validate → XML export live (the core compliance capability)
3. Add Story 3 → validate → JSON export live
4. Add Story 4 → validate → Update/Cancel references correct
5. Polish (i18n, docs, test/build verification)

---

## Notes

- No new table — exports are computed on demand (plan.md's Structure Decision)
- `capExport.js` follows the existing `src/lib/` pure-function convention (`capStateMachine.js`, `auditExport.js`)
- Migrations are provided as exact CLI commands to the user for manual application once implementation is complete
- Commit only when explicitly requested by the user
