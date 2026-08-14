-- =====================================================
-- SOP Document file upload (spec 068 US3)
-- Partner review: SOP Document module should allow uploading an existing
-- procedure document (PDF/DOCX) instead of requiring the body to be
-- retyped. Adds nullable attachment columns to the existing sop_documents
-- table; no new table needed. The existing AI-assisted summary workflow
-- keeps operating on body_content unchanged (see 20260707140100_sop_documents.sql
-- and 20260810124000_threshold_triggered_sop_actions.sql for the summary flow).
-- =====================================================

ALTER TABLE sop_documents
  ADD COLUMN IF NOT EXISTS attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- All-or-nothing: an attachment reference is either fully present or fully
-- absent (typed-only SOPs keep all three columns NULL).
ALTER TABLE sop_documents
  DROP CONSTRAINT IF EXISTS sop_documents_attachment_all_or_nothing;
ALTER TABLE sop_documents
  ADD CONSTRAINT sop_documents_attachment_all_or_nothing CHECK (
    (attachment_path IS NULL AND attachment_name IS NULL AND attachment_type IS NULL)
    OR (attachment_path IS NOT NULL AND attachment_name IS NOT NULL AND attachment_type IS NOT NULL)
  );

ALTER TABLE sop_documents
  DROP CONSTRAINT IF EXISTS sop_documents_attachment_type_allowlist;
ALTER TABLE sop_documents
  ADD CONSTRAINT sop_documents_attachment_type_allowlist CHECK (
    attachment_type IS NULL
    OR attachment_type IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  );
