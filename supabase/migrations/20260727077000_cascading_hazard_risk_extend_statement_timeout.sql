-- =====================================================
-- Cascading Hazard Risk (spec 048) — fix-up migration #7
--
-- Live-testing finding: after four different query-shape rewrites
-- (nearest-neighbor KNN, ST_DWithin-bounded, dataset-id-first lookup,
-- SECURITY DEFINER to bypass RLS, and a `&&` bounding-box index-force
-- pre-filter — fix-ups #2 through #6), a real call to evaluate_cascade_rules
-- through PostgREST as an authenticated user consistently takes ~8+ seconds
-- and is cut off by the `authenticated` role's `statement_timeout = 8s`
-- (confirmed via a direct curl call: `TIME:8.475905`, HTTP 500, code 57014)
-- — while every one of those same query shapes measured 100-350ms when run
-- directly against the database bypassing the PostgREST/connection-pooler
-- path. Since every query-shape variant produced the same ~8s wall time
-- regardless of its own individual cost, the bottleneck is not this
-- function's query plan; it is something in the PostgREST/pooler request
-- path itself for this project (this project has several other
-- documented, unrelated Supabase-platform-level quirks — see
-- docs/plans/NEW_GAME_PLAN.md §"Şu an bloke olan" on Edge Function
-- redeploy failures — consistent with a platform/infrastructure
-- peculiarity rather than a logic bug in this module).
--
-- Given the underlying logic is confirmed correct and fast in isolation,
-- fixed pragmatically by raising this function's own statement_timeout
-- (a per-function GUC override, standard Postgres feature) well above the
-- observed ~8s baseline, rather than continuing to chase the
-- infrastructure-level cause. This does not weaken any other function or
-- role's timeout — it applies only to calls to this one function.
-- =====================================================

ALTER FUNCTION evaluate_cascade_rules(
  VARCHAR(2), TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, JSONB
) SET statement_timeout = '25s';
