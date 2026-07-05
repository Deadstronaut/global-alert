# Quickstart: CAP Alert Authoring (Hardening) Validation

## Prerequisites

- Migration `<timestamp>_cap_drafts_hardening.sql` applied (adds columns, trigger, updated RLS).
- Two test users in the same country/org: one org_admin (User A), one country_admin (User B),
  plus a super_admin and a viewer for scope checks.

## Scenario 1 — Four-eyes rejection of self-approval

1. Log in as User B (country_admin). Create a draft, submit it to `pending_approval`.
2. While still logged in as User B, attempt to approve the same draft.
3. **Expected**: request fails (RLS denial / trigger exception); draft status remains
   `pending_approval`.
4. Log in as a *different* country_admin (or super_admin). Approve the same draft.
5. **Expected**: succeeds; status becomes `approved`; `audit_log` has an `UPDATE` row for
   `cap_drafts` with the second user as `changed_by`.

## Scenario 2 — Draft from a detected hazard event

1. As User A (org_admin), open the CAP authoring view with an active detected hazard event
   visible on the map.
2. Choose "Create alert from this event."
3. **Expected**: new draft form is pre-filled with hazard_type/severity/area_desc from the
   source event; `source_event_id` is set on save.

## Scenario 3 — Completeness gate

1. As User A, start a blank draft, leave `instructions` empty, attempt to submit for approval.
2. **Expected**: rejected with a translated error identifying the missing field(s); status stays
   `draft`.

## Scenario 4 — Broadcast immutability

1. Get a draft to `broadcast` status (via approve → broadcast as above).
2. Attempt to edit its `title` via a direct `supabase.from('cap_drafts').update(...)` call.
3. **Expected**: rejected by the trigger; `title` unchanged.
4. Cancel the same `broadcast` draft with a reason.
5. **Expected**: succeeds; status becomes `cancelled`; `cancellation_reason` stored and visible.

## Scenario 5 — Concurrent approval race

1. Get a draft to `pending_approval`. From two separate sessions (both eligible reviewers, not
   the author), fire an approve and a reject at nearly the same time.
2. **Expected**: exactly one succeeds; the other receives the stale-status conflict error and,
   after reloading, sees the row's real final status.

## Scenario 6 — Viewer visibility

1. As viewer, list CAP drafts.
2. **Expected**: only `broadcast`/`false_alarm`/`all_clear`/`expired` rows are visible — no
   `draft`/`pending_approval`/`approved` rows, even for drafts in the viewer's own country.

## Scenario 7 — i18n

1. Switch the app locale to each of tr/en/es/fr/ru/ar/zh in turn and open the CAP authoring view.
2. **Expected**: no raw i18n key strings or hardcoded Turkish text visible in any locale.
