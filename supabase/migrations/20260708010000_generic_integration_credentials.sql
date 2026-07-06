-- =====================================================
-- Generic Integration Credentials Management (spec 025)
-- Covers: FR-001 through FR-010
--
-- Replaces spec 022's WhatsApp-only credential system with a registry-driven
-- general system: an integration_types registry (super_admin-managed, WhatsApp
-- seeded as the first entry) defines each integration's known fields; a
-- generic save_integration_credentials() RPC accepts an arbitrary field map
-- and writes it to Supabase Vault, exactly generalizing spec 022's
-- authorization/case-normalization/Vault-write pattern. Hard cutover — safe
-- because no production consumer has ever read the old WhatsApp credentials
-- (dispatch-alert's WhatsApp adapter is still a mock).
-- =====================================================

-- ── integration_types: global registry, mirrors hazard_types exactly ───────
CREATE TABLE IF NOT EXISTS integration_types (
  code          TEXT        PRIMARY KEY,
  display_name  TEXT        NOT NULL,
  field_template JSONB      NOT NULL DEFAULT '[]',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS integration_types_updated_at ON integration_types;
CREATE TRIGGER integration_types_updated_at
  BEFORE UPDATE ON integration_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE integration_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_integration_types_all" ON integration_types;
CREATE POLICY "super_admin_integration_types_all" ON integration_types
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "read_active_integration_types" ON integration_types;
CREATE POLICY "read_active_integration_types" ON integration_types
  FOR SELECT TO authenticated USING (
    is_active OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP TRIGGER IF EXISTS audit_integration_types ON integration_types;
CREATE TRIGGER audit_integration_types
  AFTER INSERT OR UPDATE OR DELETE ON integration_types
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── integration_settings: replaces whatsapp_integration_settings ───────────
CREATE TABLE IF NOT EXISTS integration_settings (
  country_code           TEXT        NOT NULL,
  integration_type_code  TEXT        NOT NULL REFERENCES integration_types(code) ON DELETE CASCADE,
  is_configured          BOOLEAN     NOT NULL DEFAULT false,
  configured_field_keys  JSONB       NOT NULL DEFAULT '[]',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (country_code, integration_type_code)
);

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_integration_settings_all" ON integration_settings;
CREATE POLICY "super_admin_integration_settings_all" ON integration_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "country_scoped_integration_settings_select" ON integration_settings;
CREATE POLICY "country_scoped_integration_settings_select" ON integration_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin', 'org_admin')
        AND p.country_code = integration_settings.country_code
    )
  );
-- Deliberately NO INSERT/UPDATE policy for any role — all writes via
-- save_integration_credentials() (SECURITY DEFINER), same as spec 022.

-- ── save_integration_credentials(): generalizes save_whatsapp_credentials() ─
CREATE OR REPLACE FUNCTION save_integration_credentials(
  p_country_code TEXT,
  p_integration_type_code TEXT,
  p_fields JSONB
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret_name TEXT;
  v_secret_id UUID;
  v_key TEXT;
  v_value TEXT;
BEGIN
  p_country_code := lower(p_country_code);

  IF NOT (
    current_profile_role() = 'super_admin'
    OR (current_profile_role() IN ('country_admin', 'org_admin') AND p_country_code = current_profile_country_code())
  ) THEN
    RAISE EXCEPTION 'not authorized to configure integration credentials for country %', p_country_code;
  END IF;

  IF p_fields IS NULL OR jsonb_typeof(p_fields) != 'object' OR (SELECT COUNT(*) FROM jsonb_object_keys(p_fields)) = 0 THEN
    RAISE EXCEPTION 'at least one field is required';
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_fields) LOOP
    IF v_value IS NULL OR btrim(v_value) = '' THEN
      RAISE EXCEPTION 'field % must not be blank', v_key;
    END IF;
  END LOOP;

  v_secret_name := 'integration_creds_' || p_country_code || '_' || p_integration_type_code;

  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = v_secret_name;
  IF v_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_secret_id, p_fields::text);
  ELSE
    PERFORM vault.create_secret(p_fields::text, v_secret_name);
  END IF;

  INSERT INTO integration_settings (country_code, integration_type_code, is_configured, configured_field_keys, updated_at, updated_by)
  VALUES (p_country_code, p_integration_type_code, true, (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_fields) AS k), NOW(), auth.uid())
  ON CONFLICT (country_code, integration_type_code) DO UPDATE
    SET is_configured = true,
        configured_field_keys = EXCLUDED.configured_field_keys,
        updated_at = NOW(),
        updated_by = auth.uid();
END;
$$;

-- ── Seed: WhatsApp becomes the first predefined integration type ───────────
INSERT INTO integration_types (code, display_name, field_template) VALUES
  ('whatsapp', 'WhatsApp', '[
    {"key": "access_token", "label": "Access Token"},
    {"key": "phone_number_id", "label": "Phone Number ID"},
    {"key": "webhook_verify_token", "label": "Webhook Verify Token"}
  ]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- ── Hard cutover: remove spec 022's WhatsApp-specific objects ──────────────
-- Safe: no production consumer has ever read whatsapp_creds_<country> secrets
-- (dispatch-alert's WhatsApp adapter is still a mock, unaffected by this).
DROP FUNCTION IF EXISTS save_whatsapp_credentials(TEXT, TEXT, TEXT, TEXT);
DROP TABLE IF EXISTS whatsapp_integration_settings;
