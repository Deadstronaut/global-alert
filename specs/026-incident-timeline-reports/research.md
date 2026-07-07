# Research: Incident Timeline Playback & Annual Incident Reports

## Decision 1: Timeline is derived from `audit_log`, not a new table

**Decision**: `get_incident_timeline(p_incident_id UUID)` reads directly from the existing
`audit_log` table (`WHERE table_name = 'incidents' AND record_id = p_incident_id::text ORDER BY
created_at ASC`) — no new "incident_history" table is created.

**Rationale**: `audit_incidents` (the existing trigger on `incidents`, in place since spec
001-era infrastructure) already writes a complete change history to `audit_log` on every
INSERT/UPDATE/DELETE. Building a second, parallel history mechanism would duplicate data and
introduce a new consistency risk (two logs that could theoretically disagree) for zero benefit —
the data this spec needs already exists.

**Alternatives considered**:
- *A dedicated `incident_state_history` table, populated by its own trigger*: Rejected —
  redundant with `audit_log`, which already captures full before/after row state (not just status),
  giving richer timeline detail (e.g. AAR note additions, not just state transitions) for free.

## Decision 2: Authorization mirrors `incidents`' RLS exactly, inside a SECURITY DEFINER function

**Decision**: `get_incident_timeline()` first runs an `EXISTS` check that is a literal
recombination of `incidents`' three existing RLS policies' conditions (super_admin OR
country_admin/org_admin whose `country_code` matches the incident's OR any role whose
`country_code` matches the incident's, mirroring `viewer_incidents_read`) against the target
incident row; if it doesn't match, the function raises an exception (or returns zero rows) before
ever touching `audit_log`.

**Rationale**: `audit_log` itself is locked down to super_admin-only (`super_admin_read_audit`
policy) — appropriate for raw audit review, but wrong for this feature (a Country Admin or Viewer
who can already see an incident must be able to see its history, per FR-001/FR-002). A SECURITY
DEFINER function is this project's established pattern for "grant a narrow, purpose-built read
path into an otherwise more restricted table" (same shape as `save_whatsapp_credentials()`/
`save_integration_credentials()` for Vault-backed writes). The authorization check must be an
exact mirror, not an approximation, because any gap here would either wrongly hide a timeline the
user should see, or — far worse — wrongly expose one they shouldn't.

**Alternatives considered**:
- *Loosen `audit_log`'s own RLS to let more roles read table_name='incidents' rows directly*:
  Rejected — this would widen access to the *entire* `audit_log` table's incidents rows across all
  countries unless a further per-row country-scoping policy were added directly to `audit_log`,
  which risks affecting other consumers of that table (e.g. the existing Denetim/Audit tab's
  super_admin-only export) and is a much larger blast radius than a single-purpose function.

## Decision 3: Yearly incident report is a structural twin of `compliance_reports`

**Decision**: `incident_reports` table (`period_start`, `period_end`, `summary` JSONB,
`generated_at`, `UNIQUE(period_start, period_end)`), same RLS shape (super_admin SELECT only, no
direct INSERT/UPDATE for any role), same `pg_net` + `pg_cron` + Vault-secret
(`edge_function_base_url`, `service_role_key`) triggering mechanism as spec 019's
`compliance_reports`, just on a yearly schedule (`cron.schedule('generate-incident-report-yearly',
'5 0 1 1 *', ...)`) instead of weekly, and a separate Edge Function
(`generate-incident-report`) instead of reusing `generate-compliance-report`.

**Rationale**: This is exactly the same problem spec 019 already solved (a periodic, automatic,
idempotent summary report visible only to Super Admins) for a different table — reusing the
reviewed pattern verbatim minimizes new surface area and keeps the two report systems easy to
reason about side by side.

**Alternatives considered**:
- *Extend `generate-compliance-report` to also cover incidents*: Rejected — conflates two
  different domains (generic audit-log activity vs. incident-specific business metrics like
  false-alarm rate) into one function and one table, making both harder to reason about and
  breaking the clean `UNIQUE(period_start, period_end)` per-table-domain idempotency guarantee.

## Decision 4: False-alarm rate definition and denominator

**Decision**: Among incidents with a non-null `linked_cap_id` whose linked `cap_drafts.status` has
reached a terminal/final state (i.e. is unambiguously either a genuine broadcast outcome or
`'false_alarm'`), the percentage where that status is `'false_alarm'`. Incidents with no linked CAP
alert are excluded from both numerator and denominator.

**Rationale**: An incident without a linked CAP alert has no alert outcome to judge as a false
alarm or not — including it in the denominator (as an implicit "not a false alarm") would silently
and incorrectly deflate the rate. This matches spec.md's Edge Cases section exactly.

**Alternatives considered**:
- *Treat "no linked CAP alert" as "not a false alarm" (include in denominator)*: Rejected — would
  make the metric meaningless for any country/org that doesn't consistently link incidents to CAP
  alerts, since their false-alarm rate would be artificially diluted rather than reflecting actual
  alerting accuracy.

## Decision 5: Average time-to-close scope

**Decision**: Computed only over incidents whose `status` is `closed` or `archived` AND whose
`closed_at` falls within the reporting period — `opened_at → closed_at` difference, averaged. Still
open incidents contribute nothing to this average (not a zero, not excluded-but-counted).

**Rationale**: Matches spec.md's Edge Cases section directly — including an open incident's
"time so far" would understate true time-to-close (it hasn't finished yet), and a period with zero
closures should report "no data" for this metric rather than a misleading `0`.

**Alternatives considered**:
- *Include incidents opened in the period regardless of when they closed*: Rejected — mixes
  incidents whose full lifecycle the report can't yet observe (still open, or closed in a later
  period) with ones it can, muddying year-over-year comparability.
