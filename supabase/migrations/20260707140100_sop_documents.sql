-- =====================================================
-- SOP (Standard Operating Procedure) Repository
-- Covers: spec 011 FR-004, FR-005, FR-006 (PRD FR-0207, FR-0242, FR-0344)
-- Hazard-agnostic by design (Constitution Principle I): SOPs are tagged
-- against the hazard_types registry (spec 010), not a hardcoded enum, so
-- new hazard types automatically become available for SOP tagging.
-- =====================================================

CREATE TABLE IF NOT EXISTS sop_documents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  title             TEXT        NOT NULL,
  hazard_type_code  TEXT        NOT NULL REFERENCES hazard_types(code) ON DELETE CASCADE,
  body_content      TEXT,
  reference_url     TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT true,

  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sop_documents_hazard ON sop_documents (hazard_type_code, is_active);

DROP TRIGGER IF EXISTS sop_documents_updated_at ON sop_documents;
CREATE TRIGGER sop_documents_updated_at
  BEFORE UPDATE ON sop_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE sop_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_sop_documents_all" ON sop_documents;
CREATE POLICY "super_admin_sop_documents_all" ON sop_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "read_active_sop_documents" ON sop_documents;
CREATE POLICY "read_active_sop_documents" ON sop_documents
  FOR SELECT TO authenticated
  USING (
    is_active
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Audit trigger
DROP TRIGGER IF EXISTS audit_sop_documents ON sop_documents;
CREATE TRIGGER audit_sop_documents
  AFTER INSERT OR UPDATE OR DELETE ON sop_documents
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
