-- =====================================================
-- Scheduled Compliance Reports (spec 019)
-- Covers: FR-001 through FR-009
--
-- Closes the "zamanlanmış raporlar" gap left open by spec 007 (audit log
-- viewer/export/hash-chain integrity) — today, compliance review is entirely
-- manual (a super_admin must remember to open the Audit tab and export).
-- This adds a weekly, automatic compliance_reports row summarizing audit_log
-- activity plus the existing verify_audit_chain() integrity result.
--
-- NOTE: this is the first migration in this project to register a
-- pg_cron.schedule() call. A codebase audit found pg_cron already used by 5
-- fetch-* Edge Functions ("Called by: pg_cron every 1 minute"), but no prior
-- migration ever registers one — those jobs were almost certainly set up by
-- hand via the Supabase Dashboard SQL editor. Writing this one into a
-- migration is a deliberate improvement (reproducible, reviewable) but is
-- new territory for this project — verify with the query in this feature's
-- quickstart.md after applying.
-- =====================================================

CREATE TABLE IF NOT EXISTS compliance_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  summary       JSONB       NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_reports_period
  ON compliance_reports (period_start, period_end);

-- ── RLS — same restriction as manual audit_log access (FR-007) ─────────────
ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_compliance_reports" ON compliance_reports;
CREATE POLICY "super_admin_read_compliance_reports" ON compliance_reports
  FOR SELECT USING (current_profile_role() = 'super_admin');

-- No INSERT/UPDATE/DELETE policy for any role — the only writer is the
-- generate-compliance-report Edge Function using a service-role client,
-- matching the established trusted-backend-write pattern used elsewhere in
-- this project (e.g. dispatch_receipts.acknowledged_at via ack-dispatch).

-- ── pg_net + Vault trigger, mirrors notify_dispatch_on_broadcast() (spec 009) ──
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION trigger_compliance_report_generation()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_compliance_report_generation: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/generate-compliance-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- ── Weekly schedule: every Monday 00:00 UTC ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-compliance-report-weekly') THEN
    PERFORM cron.unschedule('generate-compliance-report-weekly');
  END IF;

  PERFORM cron.schedule(
    'generate-compliance-report-weekly',
    '0 0 * * 1',
    $job$SELECT trigger_compliance_report_generation()$job$
  );
END;
$$;
