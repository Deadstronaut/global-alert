-- =====================================================
-- enforce_retention_policies() — extend statement_timeout
--
-- Live-testing finding (2026-07-30): retention_policies had never had a
-- single row in it since the function was written (20260711130000), so this
-- was never actually exercised against real data volume until now — first
-- real invocation deleting audit_log rows older than the newly-configured
-- retention window hit "canceling statement due to statement timeout"
-- against ~80,556 matching rows. Same root cause/fix pattern already
-- applied to compute_zonal_stats, evaluate_cascade_rules, and the impact-
-- breakdown functions elsewhere in this project: this project's Postgres/
-- PostgREST layer has a real per-statement cost, and a large single
-- DELETE (even with a supporting index on created_at) needs more than the
-- platform default.
-- =====================================================

ALTER FUNCTION enforce_retention_policies()
  SET statement_timeout = '120s';
