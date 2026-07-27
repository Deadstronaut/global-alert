# Quickstart: Validating Cascade Map Integration & Opt-In Auto-Evaluation

Prerequisites: spec 048 (Cascading Hazard Risk) live. Requires one new migration (data-model.md):
`country_cascade_settings`, `cascading_risk_assessments` additive columns, the
`_evaluate_cascade_rules_core`/`evaluate_cascade_rules` refactor, `auto_evaluate_cascade()` + 9 triggers,
`save_country_cascade_setting`, `acknowledge_cascade_assessment`.

## 1. See cascading risks from the main map (US1)

- Configure a cascade rule (spec 048) that a real, currently-displayed hazard event satisfies.
- Select that event on the main map; open the impact-analysis side panel.
- Expected: a "Cascading Risks" section appears with the same triggered result the admin dashboard would
  show for the same event/area, without navigating to the Admin panel.
- Select an event at a location outside every loaded administrative boundary for its country.
- Expected: the section shows an explicit "cannot determine area for this location" state, not a silent
  omission or a guessed area.

## 2. Confirm spec 048's existing manual paths are unaffected (FR-009)

- Re-run spec 048's own quickstart.md steps 1-5 (rule config, real-event evaluation, hypothetical
  scenario evaluation, historical-assessment immutability).
- Expected: identical behavior to before this feature — the `evaluate_cascade_rules` refactor must be a
  pure internal restructuring, invisible to every existing caller.

## 3. Country_admin enables automatic evaluation (US2)

- As country_admin, call `save_country_cascade_setting` for your own country with `enabled: true`.
- As org_admin or viewer for that same country, confirm the setting is not visible/reachable anywhere.
- As country_admin for a *different* country, confirm you cannot read or change the first country's
  setting (RLS denial).

## 4. A real qualifying event auto-triggers (US2 acceptance scenarios 2, 5)

- With automatic evaluation enabled and a configured rule the incoming event's hazard type/location
  satisfies, insert (or wait for) a real qualifying event for that country.
- Expected: a `cascading_risk_assessments` row appears with `triggered_automatically = true` and
  `acknowledged_at = null`, with no manual "Evaluate Cascades" click involved.
- Expected: no row appears in `cap_drafts`, no `dispatch_jobs` row, no outbound email/WhatsApp — inspect
  directly to confirm zero side effects outside `cascading_risk_assessments` (SC-002).
- Disable the setting, insert another qualifying event: expected no new automatic assessment (manual
  evaluation still works exactly as before, per spec 048).

## 5. Unacknowledged count and acknowledgement (US2 acceptance scenario 4)

- After step 4 produces at least one automatic, unacknowledged assessment, confirm the unacknowledged-
  count indicator reflects it for country_admin/org_admin/super_admin sessions in that country.
- Call `acknowledge_cascade_assessment` for that row; confirm the count decreases and a second
  acknowledge call on the same row is a harmless no-op (idempotent).

## 6. Resilience: a failure inside automatic evaluation must not break the hazard insert

- Temporarily misconfigure a rule's referenced proximity layer to something that would error deep inside
  evaluation (e.g. malformed state), with automatic evaluation enabled.
- Insert a real qualifying event.
- Expected: the hazard-event insert itself still succeeds (visible on the map immediately, as normal) —
  the automatic-evaluation failure is swallowed, not propagated to the caller/ingestion pipeline.

## 7. Run regression checks

```bash
npm run test
npm run build
```
No new pure-logic module is introduced (all new logic is SQL/triggers, verified live above); this step
confirms no existing test/build regressed.
