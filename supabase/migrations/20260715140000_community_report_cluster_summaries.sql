-- =====================================================
-- Scheduled Geo-Cluster Summary Report (spec 036 remaining item —
-- "zamanlanmış coğrafi küme özet raporu"). Same pg_net + Vault + pg_cron
-- shape as compliance_reports (spec 019), incident_reports (spec 026), and
-- drill_reports (spec 032): a daily job POSTs to a new Edge Function, which
-- groups the previous UTC day's *approved* community_reports into
-- country + geo-grid buckets and stores one summary row per country. No
-- existing table, RLS policy, or Edge Function is modified.
-- =====================================================

CREATE TABLE IF NOT EXISTS community_report_cluster_summaries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  -- '' (not NULL) means "country could not be resolved for these reports" —
  -- kept as an explicit value (not NULL) so the UNIQUE constraint below
  -- actually prevents duplicate unresolved-country rows across retries.
  country_code  VARCHAR(2)  NOT NULL DEFAULT '',
  total_reports INTEGER     NOT NULL DEFAULT 0,
  clusters      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_community_report_cluster_summaries_period
  ON community_report_cluster_summaries (period_start, period_end, country_code);

-- ── RLS — super_admin sees everything (including the unresolved-country
-- bucket); country_admin/org_admin see only their own country's rows,
-- mirroring the country-scoped read pattern used across this project ──────
ALTER TABLE community_report_cluster_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_community_report_cluster_summaries" ON community_report_cluster_summaries;
CREATE POLICY "super_admin_read_community_report_cluster_summaries" ON community_report_cluster_summaries
  FOR SELECT USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_scoped_read_community_report_cluster_summaries" ON community_report_cluster_summaries;
CREATE POLICY "country_scoped_read_community_report_cluster_summaries" ON community_report_cluster_summaries
  FOR SELECT USING (
    current_profile_role() IN ('country_admin','org_admin')
    AND country_code = current_profile_country_code()
  );

-- No INSERT/UPDATE/DELETE policy for any role — the only writer is the
-- generate-community-report-cluster-summary Edge Function using a
-- service-role client, same trusted-backend-write pattern as
-- compliance_reports/incident_reports/drill_reports.

-- ── pg_net + Vault trigger, mirrors trigger_compliance_report_generation() ──
CREATE OR REPLACE FUNCTION trigger_community_report_cluster_summary()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_community_report_cluster_summary: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/generate-community-report-cluster-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- ── Daily schedule: every day at 00:15 UTC (15 minutes after the day
-- boundary the Edge Function computes, avoiding any edge-of-day race) ──────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-community-report-cluster-summary-daily') THEN
    PERFORM cron.unschedule('generate-community-report-cluster-summary-daily');
  END IF;

  PERFORM cron.schedule(
    'generate-community-report-cluster-summary-daily',
    '15 0 * * *',
    $job$SELECT trigger_community_report_cluster_summary()$job$
  );
END;
$$;
