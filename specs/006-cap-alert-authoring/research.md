# Research: CAP Alert Authoring (Hardening)

## §1. Four-eyes enforcement point

**Decision**: Enforce four-eyes at the RLS `WITH CHECK` clause on the UPDATE policies that allow
approval-capable roles (country_admin/super_admin) to modify `cap_drafts`, comparing the row's
`created_by`/`last_edited_by` against `auth.uid()`.

**Rationale**: `CapView.vue` writes to `cap_drafts` directly via `supabase.from('cap_drafts').update(...)`
from the browser using the user's own session — there is no server-side function mediating this
today. A UI-only check (hiding the approve/reject buttons for one's own draft) is trivially
bypassable by calling the Supabase REST/JS API directly. RLS is the only enforcement point the
client cannot route around.

**Alternatives considered**:
- New Edge Function for all status transitions: rejected as unnecessary complexity (Principle
  VIII) — the only property Postgres RLS can't express is "was this exact request field X" style
  business logic requiring external state, which four-eyes does not need; a same-row column
  comparison is squarely RLS's job.
- Trigger-based rejection instead of RLS: a `BEFORE UPDATE` trigger raising an exception on
  self-approval would also work, but RLS's `WITH CHECK` returns a cleaner, more idiomatic
  "0 rows affected / permission denied"-style failure that the existing Supabase-JS error-handling
  pattern in `CapView.vue` (`if (err) { error.value = err.message }`) already expects, whereas a
  trigger exception surfaces as a generic Postgres error string. RLS chosen for consistency.

## §2. Status-transition guard (optimistic concurrency)

**Decision**: Add a `BEFORE UPDATE` trigger function `guard_cap_draft_transition()` that validates
old-status → new-status against an allow-list matching the existing `TRANSITIONS` map already
encoded client-side in `CapView.vue`, raising an exception on an invalid transition (covers both
FR-003's state-machine enforcement and FR-014's "second reviewer loses" race).

**Rationale**: The existing implementation has zero database-level transition validation — any
authenticated writer with RLS access could set `status` to any string satisfying only the `CHECK
(status IN (...))` constraint, including skipping straight from `draft` to `broadcast`. A
race between two reviewers acting on the same `pending_approval` draft is naturally resolved by
this same trigger: the second `UPDATE` to arrive sees a row whose `status` (read inside the
trigger via `OLD.status`) is no longer `pending_approval` (the first request already moved it to
`approved`/`rejected`), so the transition-validity check fails for the second request too,
returning an error rather than double-processing.

**Alternatives considered**:
- Application-level optimistic locking (`.eq('status', 'pending_approval')` in the Supabase query
  before update): possible, but relies on every future call site remembering to add this
  precondition — the trigger makes it structurally impossible to forget, and centralizes the
  transition table in one place (Postgres) instead of two (Postgres CHECK + Vue TRANSITIONS map).

## §3. Broadcast immutability

**Decision**: Extend the same `guard_cap_draft_transition()` trigger to also reject any UPDATE
that changes a CAP content field (hazard_type, severity, certainty, urgency, title, description,
instructions, area_desc/polygon/lat/lng/radius_km, effective_at/expires_at, lang/translations)
when `OLD.status = 'broadcast'`, regardless of what the new `status` value is (a `cancel` action
is allowed to change `status` away from `broadcast`, but not simultaneously rewrite content).

**Rationale**: Same enforcement-point reasoning as §1 — must be DB-level since the client writes
directly to the table.

## §4. Source hazard event linkage

**Decision**: Add a nullable `source_event_id UUID` column to `cap_drafts`, populated at draft
creation time only (no FK enforced against a specific disaster-event table, since detected events
are typed/normalized in-memory Pinia store data per Constitution Principle IV rather than always
persisted server-side with a stable UUID — confirmed by reading `src/stores/*.js` disaster-event
handling, which treats events as client-fetched/cached data, not a queryable Supabase table row in
all cases). Store a denormalized snapshot instead: `source_event_id` (best-effort identifier
string, nullable) plus rely on the pre-filled `hazard_type`/`area_desc`/`severity` values already
being copied onto the draft at creation — the "link" is informational/audit context, not a live
foreign key.

**Rationale**: Spec's own Edge Case entry states the draft is a snapshot, not a live reference —
matches a denormalized approach. Avoids a cross-schema FK to a data source whose persistence model
this feature doesn't own or need to change (Principle IV/VIII).

**Alternatives considered**: A hard FK to a `disaster_events` table — rejected because no single
canonical `disaster_events` Supabase table was found to reference (ingestion pipeline per specs
001-003 stores source-specific rows across multiple fetch functions/tables); introducing one now
is out of scope for a CAP-authoring hardening spec.

## §5. i18n scope

**Decision**: Add a new `cap` top-level i18n key block covering all `CapView.vue` UI text
(header, form labels/placeholders, status labels, transition buttons, validation/error messages,
reason-prompt dialog), across all 7 locales, following the exact key-naming and file-editing
pattern already used for `accountSecurity`/`mfaChallenge` in spec 005.

**Rationale**: Constitution Principle VI — this feature meaningfully extends `CapView.vue`
(new pre-fill flow, new dialogs), so it does not qualify for AdminView.vue's narrow historical
grandfather exception from spec 004.

## §6. CAP-field-completeness validation

**Decision**: Add a pure, unit-testable `isDraftCompleteForApproval(draft)` function (in the new
`src/lib/capStateMachine.js` module alongside the transition-validity table) checking that title,
description, instructions, area_desc, severity, certainty, urgency, and hazard_type are all
non-empty, called from `CapView.vue` before allowing the `draft` → `pending_approval` action
client-side, AND mirrored as a Postgres CHECK-style guard inside the same
`guard_cap_draft_transition()` trigger (so an incomplete draft cannot reach `pending_approval` even
via direct API calls).

**Rationale**: Constitution Principle III requires CAP-mandatory-field validation before publish;
today neither the UI nor the database enforces this beyond a bare `title.trim()` check.
