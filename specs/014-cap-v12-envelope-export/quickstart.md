# Quickstart: CAP v1.2 Envelope & Export

## Prerequisites

- Migration `20260707170000_cap_envelope.sql` applied to the target Supabase project.
- An operator account able to author, approve (as a second user, four-eyes), and broadcast a CAP
  alert (existing spec 006 workflow).

## Scenario 1 — Automatic envelope population and broadcast gate (FR-001, FR-002, SC-001, SC-002)

1. Author a new CAP draft. **Expected**: inspecting the row shows `sender` already populated with
   no manual entry.
2. Move it through `pending_approval` → `approved` → `broadcast` (as a second user for
   four-eyes). **Expected**: succeeds normally (no regression from spec 006).
3. (Defense-in-depth check) Attempt, via direct SQL, to insert a `cap_drafts` row bypassing the
   trigger with `sender` forced blank, then attempt to move it to `pending_approval`.
   **Expected**: rejected by the extended completeness gate.

## Scenario 2 — CAP v1.2 XML export (FR-003, FR-004, SC-003)

1. Locate a broadcast CAP alert in `CapView.vue`.
2. Click "Export XML". **Expected**: a downloaded `.xml` file containing `<identifier>`,
   `<sender>`, `<sent>`, `<status>`, `<msgType>`, `<scope>`, and a complete `<info>` block with all
   mandatory fields populated from the alert's own data.
3. Locate a draft still in `pending_approval` or `approved` status. **Expected**: no export button
   is offered for it.

## Scenario 3 — CAP JSON export (FR-005)

1. On the same broadcast alert from Scenario 2, click "Export JSON". **Expected**: a downloaded
   `.json` file containing the same fields as the XML export, in JSON form.

## Scenario 4 — Update/Cancel references (FR-006, FR-007, SC-004)

1. Author and broadcast alert A.
2. Author a new alert B with `supersedes_id` set to A's id, and broadcast it.
3. Export B as XML. **Expected**: `<msgType>Update</msgType>` and a `<references>` element
   correctly identifying alert A (`A.sender,A.id,A.effective_at`).
4. Cancel alert B (per the existing cancel workflow, with a reason). Export it again. **Expected**:
   `<msgType>Cancel</msgType>`.

## Scenario 5 — Exercise alert export marking (FR-008)

1. Start a drill for a country (spec 013), author and broadcast a CAP alert for that country
   (auto-flagged `is_exercise = true` per spec 013).
2. Export it as XML. **Expected**: `<status>Exercise</status>` (not `Actual`).
