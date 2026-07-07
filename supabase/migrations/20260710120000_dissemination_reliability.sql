-- =====================================================
-- Spec 031: Dissemination Reliability & Compliance
-- Covers PRD MHEWS-FR-0287/SD-EMAIL-02 (email localization, purely
-- frontend/Edge-Function logic, no schema change), MHEWS-SD-EMAIL-04
-- (unsubscribe — reuses the existing contacts.email_opt_in column, no
-- schema change), MHEWS-FR-0119 (automatic backoff retry),
-- MHEWS-FR-0066 (admin notification on total dispatch failure), and
-- MHEWS-SD-CONTACT-06 (GDPR contact anonymization).
--
-- contacts.email_opt_in/whatsapp_opt_in already existed (20260707120000)
-- and dispatchMatching.ts's matchesContact() already checks them per
-- channel — no new column needed for unsubscribe.
-- =====================================================

-- ── dispatch_receipts: backoff reference point (MHEWS-FR-0119) ──────────────
ALTER TABLE dispatch_receipts ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;

-- ── dispatch_jobs: one-time admin notification flag (MHEWS-FR-0066) ─────────
ALTER TABLE dispatch_jobs ADD COLUMN IF NOT EXISTS admin_notified_at TIMESTAMPTZ;

-- ── contacts: relax chk_contact_has_channel for anonymized contacts ─────────
-- (MHEWS-SD-CONTACT-06) An anonymized contact has both email and
-- whatsapp_number set to NULL; is_active is also set to false at the same
-- time (src/stores/contacts.js's anonymizeContact()), so this constraint's
-- original intent ("an active contact must have a reachable channel") is
-- preserved — only inactive contacts are exempted.
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS chk_contact_has_channel;
ALTER TABLE contacts ADD CONSTRAINT chk_contact_has_channel
  CHECK (is_active = false OR email IS NOT NULL OR whatsapp_number IS NOT NULL);

-- ── pg_net + pg_cron trigger, mirrors trigger_compliance_report_generation()
--    (spec 019) — calls dispatch-alert's new Mode C (auto_retry) every 15
--    minutes with the service-role key.
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION trigger_dispatch_auto_retry()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_dispatch_auto_retry: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/dispatch-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{"auto_retry": true}'::jsonb
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-auto-retry-15min') THEN
    PERFORM cron.unschedule('dispatch-auto-retry-15min');
  END IF;

  PERFORM cron.schedule(
    'dispatch-auto-retry-15min',
    '*/15 * * * *',
    $job$SELECT trigger_dispatch_auto_retry()$job$
  );
END;
$$;
