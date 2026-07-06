-- =====================================================
-- Dissemination & Contact Directory (spec 009)
-- Covers: FR-005 (auto-dispatch on broadcast)
--
-- The moment a cap_drafts row transitions to status = 'broadcast', this
-- trigger calls the dispatch-alert Edge Function asynchronously via pg_net,
-- so dispatch fires regardless of which code path performs the UPDATE
-- (research.md §1 — CapView.vue's performTransition() does a plain client
-- update today; a DB trigger is the only place that can guarantee dispatch
-- isn't silently skippable).
--
-- IMPORTANT (one-time manual step, NOT part of this migration): the target
-- URL and service-role key are secrets and must never be committed to a
-- migration file. `ALTER DATABASE ... SET app.settings.*` requires superuser
-- and is NOT available on Supabase-hosted projects (confirmed: "permission
-- denied to set parameter"), so this reads from Supabase Vault instead —
-- the officially supported mechanism for exactly this pg_net-trigger pattern,
-- grantable without superuser. Run once (Supabase SQL editor, not checked
-- into version control):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'edge_function_base_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- Until both secrets exist, notify_dispatch_on_broadcast() no-ops (logs a
-- warning via RAISE NOTICE) rather than failing the triggering UPDATE.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_dispatch_on_broadcast()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'notify_dispatch_on_broadcast: app.settings.edge_function_base_url / service_role_key not configured, skipping dispatch for draft %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/dispatch-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := jsonb_build_object('draft_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_dispatch_on_broadcast ON cap_drafts;
CREATE TRIGGER trg_notify_dispatch_on_broadcast
  AFTER UPDATE OF status ON cap_drafts
  FOR EACH ROW
  WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_dispatch_on_broadcast();
