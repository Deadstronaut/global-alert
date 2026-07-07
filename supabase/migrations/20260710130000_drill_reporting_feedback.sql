-- =====================================================
-- Spec 032: Drill Reporting & After-Action Feedback
-- Covers PRD MHEWS-SD-DRILL-02 (single drill summary export — purely
-- frontend, no schema change), MHEWS-FR-0033 (annual drill performance
-- report), and the "After-Action Feedback Loop" item (lessons-learned note
-- + optional hazard-type link on a completed drill).
--
-- drill_reports is a structural twin of incident_reports
-- (20260708020000_incident_timeline_reports.sql). The 2 new drill_sessions
-- columns are additive; existing RLS/state machine/audit trigger are
-- reused unchanged.
-- =====================================================

-- ── drill_sessions: after-action feedback (MHEWS "Feedback Loop") ───────────
ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS lessons_learned TEXT;
ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS related_hazard_type TEXT REFERENCES hazard_types(code) ON DELETE SET NULL;

-- ── drill_reports: structural twin of incident_reports (spec 026) ──────────
CREATE TABLE IF NOT EXISTS drill_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  summary       JSONB       NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_drill_reports_period
  ON drill_reports (period_start, period_end);

ALTER TABLE drill_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_drill_reports" ON drill_reports;
CREATE POLICY "super_admin_read_drill_reports" ON drill_reports
  FOR SELECT USING (current_profile_role() = 'super_admin');
-- No INSERT/UPDATE/DELETE policy for any role — the only writer is the
-- generate-drill-report Edge Function using a service-role client, same
-- trusted-backend-write pattern as compliance_reports/incident_reports.

-- ── pg_net + Vault trigger, mirrors trigger_incident_report_generation() ────
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION trigger_drill_report_generation()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_drill_report_generation: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/generate-drill-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- ── Yearly schedule: Jan 1, 00:10 UTC (5 min after incident's yearly slot) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-drill-report-yearly') THEN
    PERFORM cron.unschedule('generate-drill-report-yearly');
  END IF;

  PERFORM cron.schedule(
    'generate-drill-report-yearly',
    '10 0 1 1 *',
    $job$SELECT trigger_drill_report_generation()$job$
  );
END;
$$;
