-- =====================================================
-- Incident Timeline Playback & Annual Incident Reports (spec 026)
-- Covers: FR-001 through FR-007
--
-- Closes two of Incident Tracking's remaining backlog items: (1) a
-- per-incident timeline reconstructed from the existing audit_log trail,
-- exposed through a SECURITY DEFINER function whose authorization mirrors
-- incidents' own 3 RLS policies exactly (audit_log itself is super_admin-only,
-- which is too narrow for this feature — FR-001/FR-002); (2) an automatic
-- yearly incident report (count/severity/hazard breakdown, average
-- time-to-close, false-alarm rate), a structural twin of spec 019's
-- compliance_reports pg_net+pg_cron+Vault pattern. Zero changes to
-- incidents/audit_log/cap_drafts — purely additive.
-- =====================================================

-- ── get_incident_timeline(): read-only, authorization mirrors incidents' RLS ─
CREATE OR REPLACE FUNCTION get_incident_timeline(p_incident_id UUID)
RETURNS TABLE(action TEXT, old_data JSONB, new_data JSONB, changed_by UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM incidents i
    WHERE i.id = p_incident_id
      AND (
        current_profile_role() = 'super_admin'
        OR (current_profile_role() IN ('country_admin', 'org_admin') AND i.country_code = current_profile_country_code())
        OR (i.country_code = current_profile_country_code())
      )
  ) THEN
    RAISE EXCEPTION 'not authorized to view timeline for this incident';
  END IF;

  RETURN QUERY
    SELECT al.action, al.old_data, al.new_data, al.changed_by, al.created_at
    FROM audit_log al
    WHERE al.table_name = 'incidents' AND al.record_id = p_incident_id::text
    ORDER BY al.created_at ASC;
END;
$$;

-- ── incident_reports: structural twin of compliance_reports (spec 019) ─────
CREATE TABLE IF NOT EXISTS incident_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  summary       JSONB       NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_reports_period
  ON incident_reports (period_start, period_end);

ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_incident_reports" ON incident_reports;
CREATE POLICY "super_admin_read_incident_reports" ON incident_reports
  FOR SELECT USING (current_profile_role() = 'super_admin');
-- No INSERT/UPDATE/DELETE policy for any role — the only writer is the
-- generate-incident-report Edge Function using a service-role client, same
-- trusted-backend-write pattern as compliance_reports.

-- ── pg_net + Vault trigger, mirrors trigger_compliance_report_generation() ──
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION trigger_incident_report_generation()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_incident_report_generation: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/generate-incident-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- ── Yearly schedule: Jan 1, 00:05 UTC (5 min after compliance's weekly slot) ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-incident-report-yearly') THEN
    PERFORM cron.unschedule('generate-incident-report-yearly');
  END IF;

  PERFORM cron.schedule(
    'generate-incident-report-yearly',
    '5 0 1 1 *',
    $job$SELECT trigger_incident_report_generation()$job$
  );
END;
$$;
