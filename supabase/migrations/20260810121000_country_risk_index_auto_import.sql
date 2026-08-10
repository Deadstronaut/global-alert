-- =====================================================
-- Country Risk Index Automated Import (spec 058)
--
-- country_risk_indices (spec: 048/country-risk-indices) has only ever been
-- fillable by hand via CountryRiskIndexPanel.vue. This adds an optional,
-- Super-Admin-configured CSV URL that a scheduled Edge Function polls and
-- upserts from — no third-party account/API key is required (INFORM Index
-- and equivalent country-level indices are published as plain downloadable
-- CSV/spreadsheet exports, not behind an authenticated API), only a URL an
-- admin points the system at once.
-- =====================================================

CREATE TABLE IF NOT EXISTS country_risk_index_import_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url        TEXT,
  source_label      TEXT NOT NULL DEFAULT 'INFORM Index',
  is_active         BOOLEAN NOT NULL DEFAULT false,
  last_run_at       TIMESTAMPTZ,
  last_run_status   TEXT CHECK (last_run_status IN ('success', 'failure')),
  last_run_message  TEXT,
  updated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Single-row settings table (like other global config tables in this
-- codebase) — enforced by always upserting the same well-known id.
INSERT INTO country_risk_index_import_settings (id, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE country_risk_index_import_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_country_risk_index_import_settings_all" ON country_risk_index_import_settings;
CREATE POLICY "super_admin_country_risk_index_import_settings_all" ON country_risk_index_import_settings
  FOR ALL USING (current_profile_role() = 'super_admin');

-- country_admin/org_admin may read the settings (to know whether automated
-- import is active for their own manual-entry expectations) but not change
-- them — this stays a Super-Admin-only, system-wide configuration.
DROP POLICY IF EXISTS "admins_country_risk_index_import_settings_read" ON country_risk_index_import_settings;
CREATE POLICY "admins_country_risk_index_import_settings_read" ON country_risk_index_import_settings
  FOR SELECT USING (current_profile_role() IN ('country_admin', 'org_admin'));

DROP TRIGGER IF EXISTS audit_country_risk_index_import_settings ON country_risk_index_import_settings;
CREATE TRIGGER audit_country_risk_index_import_settings
  AFTER INSERT OR UPDATE OR DELETE ON country_risk_index_import_settings
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── cron trigger, monthly (INFORM Index itself only republishes yearly, but
-- a monthly check is cheap and self-skips when inactive/unconfigured) ─────
CREATE OR REPLACE FUNCTION trigger_country_risk_index_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_country_risk_index_import: edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/import-country-risk-index',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-country-risk-index-monthly') THEN
    PERFORM cron.unschedule('import-country-risk-index-monthly');
  END IF;

  PERFORM cron.schedule(
    'import-country-risk-index-monthly',
    '0 8 1 * *',
    $job$SELECT trigger_country_risk_index_import()$job$
  );
END;
$$;
