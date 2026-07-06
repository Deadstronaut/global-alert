# Quickstart: Incident Tracking Completion

## Prerequisites

- Migrations `20260707140000_incident_state_guard.sql` and `20260707140100_sop_documents.sql`
  applied to the target Supabase project (see migration-apply commands provided at
  implementation completion — not applied automatically per project convention).
- Logged in as `super_admin` (for SOP management and full incident visibility) and separately as a
  `country_admin`/`org_admin` (for scoped incident lifecycle testing).
- At least one active hazard type in the `hazard_types` registry (already seeded by spec 010,
  e.g. `earthquake`, `flood`).
- At least one `cap_drafts` row with `status = 'broadcast'` for Story 4 (create via `CapView.vue`
  or an existing broadcast alert).

## Scenario 1 — DB-enforced lifecycle (FR-001, SC-001)

1. As `country_admin`, create an incident (defaults to `status = 'open'`).
2. Via `IncidentsView.vue`, transition it to `in_progress` → confirm success.
3. Attempt (via Supabase SQL editor or REST, bypassing the UI) to set `status = 'closed'` directly
   from `in_progress` in one step, skipping `monitoring` — wait, `in_progress`→`closed` IS a valid
   transition per the table in contracts/incident-lifecycle.md; instead attempt `open`→`archived`
   directly on a fresh `open` incident.
   **Expected**: rejected with `invalid_incident_transition` exception; incident status unchanged.

## Scenario 2 — AAR requirement (FR-002, FR-003, SC-002)

1. Move an incident to `monitoring` status.
2. In `IncidentsView.vue`, attempt to transition it to `closed` without entering after-action
   notes. **Expected**: UI blocks submission client-side with a clear message before any DB call.
3. Bypass the UI (SQL editor) and attempt the same update with `post_event_notes` left `NULL`.
   **Expected**: DB rejects with `aar_required` exception.
4. Enter non-blank after-action notes and transition to `closed` via the UI. **Expected**: success;
   notes persist and are visible when reopening the incident's detail view.

## Scenario 3 — SOP repository (FR-004–FR-006, SC-003)

1. As `super_admin`, open the new "SOP Repository" tab in `AdminView.vue`.
2. Create an SOP document titled e.g. "Flood Evacuation Checklist" tagged with hazard type
   `flood`.
3. As any authenticated user, open (or create) a `flood` incident in `IncidentsView.vue`.
   **Expected**: the SOP appears in a linked-procedures section on that incident.
4. Create (or view) an `earthquake` incident. **Expected**: the flood SOP does NOT appear.
5. As `super_admin`, deactivate the SOP. **Expected**: it immediately disappears from the flood
   incident's view.
6. As `country_admin` (not `super_admin`), attempt to create/edit an SOP. **Expected**: rejected.

## Scenario 4 — Create incident from broadcast alert (FR-007–FR-008, SC-004)

1. Locate a CAP draft with `status = 'broadcast'` in `CapView.vue`.
2. Trigger "create incident from this alert."
   **Expected**: a new incident is created with `hazard_type`/`severity`/`area_desc` pre-filled
   from the alert and `linked_cap_id` set to the alert's id; no manual re-entry required.
3. From the new incident's detail view, confirm a visible link/reference back to the originating
   CAP alert.
4. Locate a CAP draft still in `draft` or `pending_approval` status.
   **Expected**: the "create incident from this alert" action is not offered/available.

## Scenario 5 — i18n coverage (FR-011, SC-005)

Switch the UI language across all 7 locales (tr/en/es/fr/ru/ar/zh) and confirm: the AAR prompt,
the SOP Repository admin tab and its form, and the "create incident from alert" action all render
translated text with no missing-key fallbacks (no raw `i18n key` strings visible), and Arabic
renders with correct RTL layout.
