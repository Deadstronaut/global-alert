# Contract: Incident Timeline Playback & Annual Incident Reports

## Timeline read path

`supabase.rpc('get_incident_timeline', { p_incident_id })` → ordered array of
`{ action, old_data, new_data, changed_by, created_at }`.

**Authorization**: enforced entirely inside the function (Decision 2) — mirrors `incidents`' own
RLS exactly. A caller with no access to the target incident gets a rejected call (Postgres
exception), not a partial or empty-but-silent result, so the UI's existing error-display pattern
surfaces a clear message rather than an ambiguous "no history" state.

**Client-side rendering rule** (in `IncidentsView.vue`): for each row, if
`old_data.status !== new_data.status`, render `"durum: {old_data.status} → {new_data.status}"`;
otherwise render a generic "updated" line naming which other field(s) changed. The very first row
(the `INSERT` action) has `old_data = null` and is rendered as the incident's creation event.

## Report read path (admin-only)

`SELECT * FROM incident_reports ORDER BY period_start DESC` (RLS-filtered to super_admin only,
identical visibility rule to `compliance_reports`).

## Report write path (system-only, not client-invocable)

`POST /functions/v1/generate-incident-report` with `Authorization: Bearer <service_role_key>` —
only ever called by `trigger_incident_report_generation()` via `pg_net` on the yearly cron
schedule (or manually via curl for testing, per quickstart.md, exactly as
`generate-compliance-report` already supports). No RLS INSERT/UPDATE policy grants any
role direct write access to `incident_reports`.

## UI contract: Admin "Yıllık Olay Raporları" subsection

- Location: `AdminView.vue`'s existing Denetim (Audit) tab, as a new subsection alongside
  "Geçmiş Uyum Raporları" (spec 019's compliance-report list) — same visibility gate
  (super_admin-only), same list/table presentation pattern.
- Reuses existing CSV/JSON export mechanisms already present in that tab — no new export code
  (per spec.md Assumptions and this project's established "reuse, don't reinvent" pattern for
  spec 019's own report list).
