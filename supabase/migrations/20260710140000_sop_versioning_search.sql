-- =====================================================
-- Spec 033: SOP Repository Versioning, Category & Search
-- Covers PRD MHEWS-FR-0275 (version-control SOPs, previous version
-- preserved) and MHEWS-FR-0184 (filter documents by category).
--
-- sop_documents' existing RLS/hazard-type matching/incident integration are
-- never touched — purely additive (2 new columns + 1 new table + 1 trigger).
-- =====================================================

-- ── sop_documents: category (US1) + version counter (US2) ──────────────────
ALTER TABLE sop_documents ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE sop_documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ── sop_document_versions: append-only history (US2) ────────────────────────
CREATE TABLE IF NOT EXISTS sop_document_versions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_document_id   UUID        NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  version           INTEGER     NOT NULL,
  title             TEXT        NOT NULL,
  body_content      TEXT,
  reference_url     TEXT,
  archived_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sop_document_versions_doc ON sop_document_versions (sop_document_id, archived_at DESC);

ALTER TABLE sop_document_versions ENABLE ROW LEVEL SECURITY;

-- Mirrors sop_documents' own SELECT authorization exactly — no
-- INSERT/UPDATE/DELETE policy for any role (only the archive trigger,
-- SECURITY DEFINER, writes here; FR-008 append-only).
DROP POLICY IF EXISTS "super_admin_sop_document_versions_read" ON sop_document_versions;
CREATE POLICY "super_admin_sop_document_versions_read" ON sop_document_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "capability_granted_sop_document_versions_read" ON sop_document_versions;
CREATE POLICY "capability_granted_sop_document_versions_read" ON sop_document_versions
  FOR SELECT USING (current_profile_has_capability('sop_repository'));

DROP POLICY IF EXISTS "read_active_sop_document_versions" ON sop_document_versions;
CREATE POLICY "read_active_sop_document_versions" ON sop_document_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sop_documents d
      WHERE d.id = sop_document_versions.sop_document_id AND d.is_active
    )
  );

-- ── archive_sop_document_version(): BEFORE UPDATE trigger (US2) ─────────────
-- Only fires when a content-affecting field changes (title/body_content/
-- reference_url) — a status-only (is_active) toggle never creates a new
-- version (FR-006). SECURITY DEFINER so it can write to
-- sop_document_versions regardless of the calling user's RLS grants (same
-- pattern as log_table_change()).
CREATE OR REPLACE FUNCTION archive_sop_document_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.title IS DISTINCT FROM NEW.title
     OR OLD.body_content IS DISTINCT FROM NEW.body_content
     OR OLD.reference_url IS DISTINCT FROM NEW.reference_url THEN
    INSERT INTO sop_document_versions (sop_document_id, version, title, body_content, reference_url)
    VALUES (OLD.id, OLD.version, OLD.title, OLD.body_content, OLD.reference_url);
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sop_documents_archive_version ON sop_documents;
CREATE TRIGGER sop_documents_archive_version
  BEFORE UPDATE ON sop_documents
  FOR EACH ROW EXECUTE FUNCTION archive_sop_document_version();
