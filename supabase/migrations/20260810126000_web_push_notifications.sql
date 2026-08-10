-- =====================================================
-- Web Push Notifications (spec 063)
--
-- MHEWS gap (Warning Dissemination pillar): dispatch-alert (spec 009) only
-- ever sends Email and WhatsApp (docs/mhewsprd.md's explicit scope). Mobile
-- push is a channel this deployment CAN add without any third-party
-- account — unlike SMS (needs a telecom/Twilio account) or WhatsApp Business
-- (needs a Meta account), the Web Push standard only needs a VAPID key pair
-- the deployment generates itself once (see
-- supabase/functions/send-web-push/README.md) and browsers' own built-in
-- push services (which require no API key from this application).
--
-- Deliberately decoupled from dispatch_jobs/dispatch_receipts (spec 009):
-- push subscribers are anonymous, self-service browser subscriptions, not
-- named contacts, so they don't fit contacts' identity-bearing shape. A
-- parallel, independent trigger (mirroring notify_dispatch_on_broadcast's
-- exact pattern) keeps this additive and low-risk to the existing dispatch
-- path. Additive only.
-- =====================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code        VARCHAR(2) NOT NULL,
  region_code         TEXT,
  hazard_type_filter  TEXT,
  endpoint            TEXT NOT NULL UNIQUE,
  p256dh              TEXT NOT NULL,
  auth_key            TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_country ON push_subscriptions (country_code) WHERE is_active;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Writes (subscribe/unsubscribe) go only through subscribe-push /
-- send-web-push's service-role client, exactly like community_reports'
-- submit-community-report (research.md Decision 3) — no anon/authenticated
-- INSERT/UPDATE/DELETE policy exists on this table. Admins may only read
-- (to see subscriber counts), never write directly.
DROP POLICY IF EXISTS "super_admin_push_subscriptions_read" ON push_subscriptions;
CREATE POLICY "super_admin_push_subscriptions_read" ON push_subscriptions
  FOR SELECT USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_push_subscriptions_read" ON push_subscriptions;
CREATE POLICY "country_admin_push_subscriptions_read" ON push_subscriptions
  FOR SELECT USING (
    current_profile_role() IN ('country_admin', 'org_admin')
    AND country_code = current_profile_country_code()
  );

-- ── Broadcast trigger, mirrors notify_dispatch_on_broadcast exactly ──────
CREATE OR REPLACE FUNCTION notify_web_push_on_broadcast()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'notify_web_push_on_broadcast: edge_function_base_url / service_role_key not configured, skipping push for draft %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/send-web-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := jsonb_build_object('draft_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

-- Same WHEN condition as trg_notify_dispatch_on_broadcast (spec 013 drill
-- isolation): fires once per broadcast transition, never for exercise/drill
-- alerts.
DROP TRIGGER IF EXISTS trg_notify_web_push_on_broadcast ON cap_drafts;
CREATE TRIGGER trg_notify_web_push_on_broadcast
  AFTER UPDATE OF status ON cap_drafts
  FOR EACH ROW
  WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status AND NOT NEW.is_exercise)
  EXECUTE FUNCTION notify_web_push_on_broadcast();
