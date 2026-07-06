-- =====================================================
-- Dissemination & Contact Directory (spec 009)
-- Covers: FR-001, FR-002, FR-003, FR-004, FR-016
--
-- A country/org-scoped directory of people/institutions who can receive
-- dispatched CAP alerts (email and/or WhatsApp). Managed via the same
-- super_admin/country_admin/org_admin RBAC hierarchy as user provisioning
-- (spec 002/004) — never self-service, no public self-registration.
-- =====================================================

CREATE TABLE IF NOT EXISTS contacts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  full_name             TEXT        NOT NULL,
  email                 TEXT,
  whatsapp_number       TEXT,
  preferred_language    TEXT        NOT NULL DEFAULT 'en',

  country_code          VARCHAR(2)  NOT NULL,
  region_code           TEXT,
  org_id                UUID        REFERENCES organizations(id) ON DELETE SET NULL,

  hazard_type_filter    TEXT,       -- NULL = matches all hazard types

  email_opt_in          BOOLEAN     NOT NULL DEFAULT true,
  whatsapp_opt_in       BOOLEAN     NOT NULL DEFAULT true,

  is_active             BOOLEAN     NOT NULL DEFAULT true,

  created_by            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- FR-001: a contact must have at least one reachable channel
  CONSTRAINT chk_contact_has_channel CHECK (email IS NOT NULL OR whatsapp_number IS NOT NULL),

  -- FR-016: E.164 format (leading +, 7-15 digits total)
  CONSTRAINT chk_whatsapp_e164 CHECK (
    whatsapp_number IS NULL OR whatsapp_number ~ '^\+[1-9]\d{6,14}$'
  )
);

-- FR-003 edge case: reject exact duplicate contacts (same email + country)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_country_unique
  ON contacts (lower(email), country_code)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_country   ON contacts (country_code);
CREATE INDEX IF NOT EXISTS idx_contacts_org        ON contacts (org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_active     ON contacts (is_active);
CREATE INDEX IF NOT EXISTS idx_contacts_hazard     ON contacts (hazard_type_filter);

DROP TRIGGER IF EXISTS contacts_updated_at ON contacts;
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- super_admin: full access to any country, including delete.
DROP POLICY IF EXISTS "super_admin_contacts_all" ON contacts;
CREATE POLICY "super_admin_contacts_all" ON contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- country_admin/org_admin: SELECT/INSERT/UPDATE only within their own
-- country/org — deliberately NOT FOR ALL. FR-004 requires deactivation
-- (is_active = false), not hard delete, for these roles; only super_admin
-- may delete (mirrors super_admin_delete_boundary from spec 002).
DROP POLICY IF EXISTS "country_admin_contacts_select_own" ON contacts;
CREATE POLICY "country_admin_contacts_select_own" ON contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND p.country_code = contacts.country_code
    )
  );

DROP POLICY IF EXISTS "country_admin_contacts_insert_own" ON contacts;
CREATE POLICY "country_admin_contacts_insert_own" ON contacts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND p.country_code = contacts.country_code
    )
  );

DROP POLICY IF EXISTS "country_admin_contacts_update_own" ON contacts;
CREATE POLICY "country_admin_contacts_update_own" ON contacts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND p.country_code = contacts.country_code
    )
  );

-- No policy for `viewer` or anon/public — contacts are never public data.

-- Audit trail, same pattern as every other admin-managed table.
DROP TRIGGER IF EXISTS audit_contacts ON contacts;
CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
