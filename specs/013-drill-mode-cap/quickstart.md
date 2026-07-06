# Quickstart: Drill Mode — CAP Exercise Isolation

## Prerequisites

- Migration `20260707160000_drill_cap_exercise_isolation.sql` applied to the target Supabase
  project.
- At least one country code with existing `contacts` (spec 009) so a real dispatch would normally
  occur on broadcast, to make Scenario 2 meaningful.
- Logged in as a role that can both start a drill (`super_admin`/`country_admin`) and author CAP
  alerts.

## Scenario 1 — Automatic exercise flagging (FR-001, FR-002, SC-001)

1. Start a drill for country `tr` via `AdminView.vue`'s Tatbikat tab.
2. As an operator scoped to `tr`, create a new CAP draft. **Expected**: the draft is created with
   `is_exercise = true`, with no manual step taken.
3. As an operator scoped to a different country with no active drill, create a new CAP draft.
   **Expected**: `is_exercise = false`.
4. End the `tr` drill. **Expected**: the draft created in step 2 remains `is_exercise = true`.

## Scenario 2 — No real dispatch for exercise alerts (FR-003, FR-004, SC-002)

1. With the `tr` drill still active and the exercise draft from Scenario 1 available, move it
   through `pending_approval` → `approved` → `broadcast`.
2. Query `dispatch_jobs`/`dispatch_receipts` for that draft's id. **Expected**: zero rows in
   either table.
3. Separately, broadcast a normal (non-exercise) CAP alert for a country with active contacts.
   **Expected**: a `dispatch_jobs` row and corresponding `dispatch_receipts` rows are created,
   exactly as before this spec (no regression).

## Scenario 3 — Visible watermark (FR-005, SC-003)

1. View the exercise draft from Scenario 1 in `CapView.vue`'s Active tab. **Expected**: an
   "EXERCISE ONLY" badge is visible on its card.
2. Move it to History (e.g. via cancellation or after expiry) and view the History tab.
   **Expected**: the badge remains visible.
3. View a normal, non-exercise draft. **Expected**: no badge.

## Scenario 4 — Drill summary alert count (FR-006, SC-004)

1. Start a new drill for country `tr`.
2. Author two CAP drafts for `tr` while it is active.
3. End the drill. **Expected**: the drill's `summary.alerts_issued` equals `2`.
4. Start and immediately end a drill with no CAP drafts authored during it. **Expected**:
   `summary.alerts_issued` equals `0` (present, not absent/undefined).
