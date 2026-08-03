-- =====================================================
-- Spec 051 US4: schedule ai-anomaly-check to run every 15 minutes.
-- Mirrors trigger_drill_report_generation()'s pg_net + Vault pattern
-- (20260710130000_drill_reporting_feedback.sql) — the Edge Function itself
-- performs no AI/LLM call (research.md Decision 2), only a deterministic
-- z-score sweep over recently-ingested hazard rows.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION trigger_ai_anomaly_check()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_ai_anomaly_check: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/ai-anomaly-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- ── Every 15 minutes, matching RECENT_WINDOW_MINUTES in the function ───────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-anomaly-check-15min') THEN
    PERFORM cron.unschedule('ai-anomaly-check-15min');
  END IF;

  PERFORM cron.schedule(
    'ai-anomaly-check-15min',
    '*/15 * * * *',
    $job$SELECT trigger_ai_anomaly_check()$job$
  );
END;
$$;
