-- =====================================================
-- Audit Log — immutable event log for all critical actions
-- Covers: FR-0046, FR-0048, FR-0075, FR-0095, FR-0155, FR-0253
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT        NOT NULL,          -- INSERT, UPDATE, DELETE, LOGIN, EXPORT
  table_name   TEXT,                          -- hangi tablo etkilendi
  record_id    TEXT,                          -- etkilenen kaydın id'si
  old_data     JSONB,                         -- önceki değer (UPDATE/DELETE)
  new_data     JSONB,                         -- yeni değer (INSERT/UPDATE)
  changed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address   TEXT,
  user_agent   TEXT,
  checksum     TEXT GENERATED ALWAYS AS (
    md5(COALESCE(action,'') || COALESCE(table_name,'') || COALESCE(record_id,'') ||
        COALESCE(new_data::text,'') || COALESCE(old_data::text,''))
  ) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only: UPDATE ve DELETE yasak
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_update_audit" ON audit_log;
CREATE POLICY "no_update_audit" ON audit_log FOR UPDATE USING (false);
DROP POLICY IF EXISTS "no_delete_audit" ON audit_log;
CREATE POLICY "no_delete_audit" ON audit_log FOR DELETE USING (false);

-- Super admin okuyabilir
DROP POLICY IF EXISTS "super_admin_read_audit" ON audit_log;
CREATE POLICY "super_admin_read_audit" ON audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- Index: zaman bazlı sorgular + kullanıcı bazlı
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table_name  ON audit_log (table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_changed_by  ON audit_log (changed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record      ON audit_log (table_name, record_id);

-- ── Trigger function ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_table_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (action, table_name, record_id, new_data)
    VALUES ('INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (action, table_name, record_id, old_data, new_data)
    VALUES ('UPDATE', TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (action, table_name, record_id, old_data)
    VALUES ('DELETE', TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ── Trigger'ları bağla ─────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

DROP TRIGGER IF EXISTS audit_organizations ON organizations;
CREATE TRIGGER audit_organizations
  AFTER INSERT OR UPDATE OR DELETE ON organizations
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
