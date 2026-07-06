# Research: Scheduled Compliance Reports

## Decision 1: Reuse the existing pg_net + Vault pattern to call the Edge Function from pg_cron

**Decision**: The weekly `pg_cron` job calls a small `plpgsql` wrapper function
(`trigger_compliance_report_generation()`) that reads `edge_function_base_url` and
`service_role_key` from `vault.decrypted_secrets` (already created for spec 009's
`notify_dispatch_on_broadcast()`) and calls `net.http_post()` against
`generate-compliance-report`, exactly mirroring `notify_dispatch_on_broadcast()`'s existing
structure — same no-op-with-`RAISE NOTICE` behavior if the secrets aren't configured yet.

**Rationale**: This project already solved "how does a scheduled/triggered SQL event reliably call
an Edge Function with a service-role credential" for spec 009, including the constraint that
Supabase-hosted projects don't allow `ALTER DATABASE ... SET app.settings.*` (confirmed
"permission denied to set parameter" in that spec's own migration comment) — Vault is the
officially-supported, already-adopted mechanism. Reusing the same two Vault secrets means no new
one-time manual setup step for the user beyond what spec 009 already required (if already
configured, this feature works immediately; if not, it no-ops safely rather than breaking).

**Alternatives considered**: Storing the base URL/service key as plain `ALTER DATABASE` settings:
rejected — already proven not to work on this Supabase-hosted project (spec 009's own research).
Having the Edge Function itself poll on a timer (e.g., `setInterval` in a long-running Deno
process): rejected — Supabase Edge Functions are request-scoped, not long-running processes; this
would require a different hosting model entirely, contradicting Principle VIII (Simplicity/YAGNI).

## Decision 2: `pg_cron.schedule()` registered directly in a migration file

**Decision**: `SELECT cron.schedule('generate-compliance-report-weekly', '0 0 * * 1',
$$SELECT trigger_compliance_report_generation()$$);` wrapped in a `DO` block that first
`SELECT cron.unschedule(...)` if a job with that name already exists, to keep the migration
idempotent and re-runnable.

**Rationale**: A codebase audit found `pg_cron` already extensively used (5 `fetch-*` Edge
Functions, each commented "Called by: pg_cron every 1 minute"), but no migration file in this
project has ever registered a `cron.schedule()` call — meaning those 5 jobs were almost certainly
registered by hand via the Supabase Dashboard SQL editor at some point (consistent with this
project's documented history of some schema changes being applied that way, per
`docs/PROJE_DURUMU.md` §5). This spec is a deliberate improvement on that precedent: writing the
schedule registration into a migration file makes it reproducible, reviewable, and re-appliable, not
tribal knowledge. This is flagged explicitly to the user as new territory for this project (not
merely "another migration"), with an explicit verification step in quickstart.md, because there is
no existing test coverage or established confidence that `cron.schedule()` behaves identically when
run via `db push`/CLI vs. the dashboard SQL editor path apparently used historically.

**Alternatives considered**: Leaving cron registration as a manual, undocumented Dashboard step
(matching the apparent precedent for the 5 `fetch-*` jobs): rejected — this spec's whole point is
to make report generation "automatic," which is undermined if its own scheduling trigger is itself
an undocumented manual step; writing it into the migration is the more correct, auditable choice
even though it's new ground for this project.

## Decision 3: Idempotency via a DB-level UNIQUE constraint, not application logic alone

**Decision**: `UNIQUE (period_start, period_end)` on `compliance_reports`, with the Edge Function's
insert using `ON CONFLICT (period_start, period_end) DO NOTHING`.

**Rationale**: FR-005 requires no duplicate reports for the same period even under retries or
overlapping runs (spec.md Edge Cases). A DB constraint is the only mechanism that holds under
concurrent execution (e.g., a manual re-trigger racing the scheduled one) — application-side "check
then insert" logic has a TOCTOU race that a constraint does not.

**Alternatives considered**: A `pg_cron`-only concurrency guard (e.g., `cron.job` locking):
rejected as unnecessary — `pg_cron` already serializes a single named job's own runs, but this
constraint additionally protects against the case of a manually-invoked out-of-band call (e.g., an
operator testing the Edge Function directly) coinciding with the scheduled run, which a cron-level
lock alone would not cover.

## Decision 4: Report summarization as a pure, testable function

**Decision**: `summarizeAuditRows(rows: AuditLogRow[]): ReportSummary` in
`supabase/functions/shared/complianceReport.ts` — takes already-fetched `audit_log` rows (a plain
array, no Supabase client dependency) and returns counts grouped by `action` and by `table_name`.
Tested via `Deno.test`, following the exact pattern already established by `applyFetchResult()`
(spec 016) and `computeResponseTimeSeconds()`/`computeAckRate()` (spec 017) — business logic that
is easy to get subtly wrong (e.g., zero-activity periods, rows with a null `table_name`) extracted
so it can be tested without mocking Supabase or `pg_cron`.

**Rationale**: Matches the project's established "critical business logic gets a pure function +
test" convention and the constitution's Development Workflow requirement that this class of logic
be test-first. The Edge Function itself (`generate-compliance-report/index.ts`) stays a thin
orchestration shell (fetch rows → summarize → call `verify_audit_chain()` → insert), consistent
with how `dispatch-alert/index.ts` and `ack-dispatch/index.ts` are structured.

**Alternatives considered**: Doing the count aggregation directly in SQL (e.g., a
`GROUP BY action, table_name` query) instead of fetching rows and summarizing in TypeScript:
considered viable and simpler in principle, but rejected in favor of the pure-function approach
specifically so the summarization logic (including edge cases like empty periods and null
`table_name`) has the same test-first treatment as the rest of the project's critical logic — an
inline SQL aggregate would not be independently unit-testable the way this codebase's convention
expects.
