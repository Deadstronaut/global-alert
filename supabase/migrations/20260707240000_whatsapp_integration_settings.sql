-- Spec 022: Per-Country WhatsApp Integration Credentials
-- Purely additive — dispatch-alert's existing WhatsApp mock adapter is
-- untouched. Each country/customer this system is delivered to enters its
-- own WhatsApp Business API credentials rather than the system carrying a
-- single shared/hardcoded one. Credential values are never stored in this
-- table — only in Supabase Vault, written/read exclusively through
-- save_whatsapp_credentials() below (mirrors the read-only Vault pattern
-- already established in spec 019, extended to a controlled write path).

CREATE TABLE IF NOT EXISTS whatsapp_integration_settings (
  country_code  VARCHAR(2)  PRIMARY KEY,
  is_configured BOOLEAN     NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS whatsapp_integration_settings_updated_at ON whatsapp_integration_settings;
CREATE TRIGGER whatsapp_integration_settings_updated_at
  BEFORE UPDATE ON whatsapp_integration_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS audit_whatsapp_integration_settings ON whatsapp_integration_settings;
CREATE TRIGGER audit_whatsapp_integration_settings
  AFTER INSERT OR UPDATE OR DELETE ON whatsapp_integration_settings
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_integration_settings ENABLE ROW LEVEL SECURITY;

-- SELECT only for any role — deliberately no INSERT/UPDATE policy at all.
-- Every write happens exclusively through save_whatsapp_credentials()
-- (SECURITY DEFINER, performs its own authorization check), so a normal
-- client-side INSERT/UPDATE against this table is rejected by RLS
-- regardless of role.
DROP POLICY IF EXISTS super_admin_whatsapp_settings_all ON whatsapp_integration_settings;
CREATE POLICY super_admin_whatsapp_settings_all ON whatsapp_integration_settings
  FOR SELECT USING (
    current_profile_role() = 'super_admin'
  );

DROP POLICY IF EXISTS country_scoped_whatsapp_settings_select ON whatsapp_integration_settings;
CREATE POLICY country_scoped_whatsapp_settings_select ON whatsapp_integration_settings
  FOR SELECT USING (
    current_profile_role() IN ('country_admin', 'org_admin')
    AND country_code = current_profile_country_code()
  );

-- ── save_whatsapp_credentials() ─────────────────────────────────────────────
-- The only path that ever writes a country's WhatsApp credentials. Performs
-- its own authorization check (mirrors the RLS conditions above, since no
-- RLS policy grants INSERT/UPDATE here) and never returns any credential
-- value, decrypted or otherwise (FR-002).
CREATE OR REPLACE FUNCTION save_whatsapp_credentials(
  p_country_code TEXT,
  p_access_token TEXT,
  p_phone_number_id TEXT,
  p_webhook_verify_token TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret_name TEXT;
  v_secret_id   UUID;
  v_payload     TEXT;
BEGIN
  -- Normalize case first: every country_code column in this project
  -- (profiles, contacts, shelters) and current_profile_country_code()
  -- itself are always lowercase — without this, a differently-cased input
  -- could create a duplicate row for the same country or cause a
  -- legitimate admin's own-country check to fail.
  p_country_code := lower(p_country_code);

  IF NOT (
    current_profile_role() = 'super_admin'
    OR (
      current_profile_role() IN ('country_admin', 'org_admin')
      AND p_country_code = current_profile_country_code()
    )
  ) THEN
    RAISE EXCEPTION 'not authorized to configure WhatsApp integration for country %', p_country_code;
  END IF;

  IF p_access_token IS NULL OR btrim(p_access_token) = ''
     OR p_phone_number_id IS NULL OR btrim(p_phone_number_id) = ''
     OR p_webhook_verify_token IS NULL OR btrim(p_webhook_verify_token) = ''
  THEN
    RAISE EXCEPTION 'access_token, phone_number_id, and webhook_verify_token are all required';
  END IF;

  v_secret_name := 'whatsapp_creds_' || p_country_code;
  v_payload := json_build_object(
    'access_token', p_access_token,
    'phone_number_id', p_phone_number_id,
    'webhook_verify_token', p_webhook_verify_token
  )::text;

  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = v_secret_name;

  IF v_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_secret_id, v_payload);
  ELSE
    PERFORM vault.create_secret(v_payload, v_secret_name);
  END IF;

  INSERT INTO whatsapp_integration_settings (country_code, is_configured, updated_at, updated_by)
  VALUES (p_country_code, true, NOW(), auth.uid())
  ON CONFLICT (country_code) DO UPDATE SET
    is_configured = true,
    updated_at = NOW(),
    updated_by = auth.uid();
END;
$$;
