-- =====================================================
-- SOP Document file upload — Storage bucket (spec 068 US3)
-- Private bucket (procedure documents may be sensitive), direct
-- client-to-Storage upload gated by the same authorization already used for
-- sop_documents table writes: super_admin, or a profile granted the
-- 'sop_repository' capability (see 20260707200000_profile_capability_grants.sql).
-- No new Edge Function — mirrors the "smallest change" (Constitution
-- Principle VIII) already documented in specs/068-partner-review-response/research.md.
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('sop-documents', 'sop-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Read: any authenticated user (mirrors sop_documents' own SELECT policy,
-- which allows any authenticated user to read active SOPs; attachments for
-- inactive/draft SOPs are still only reachable by whoever already has the
-- signed path, same as the table's own row visibility).
DROP POLICY IF EXISTS "authenticated_read_sop_documents_storage" ON storage.objects;
CREATE POLICY "authenticated_read_sop_documents_storage" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'sop-documents');

-- Write: super_admin or sop_repository capability grant only.
DROP POLICY IF EXISTS "authorized_write_sop_documents_storage" ON storage.objects;
CREATE POLICY "authorized_write_sop_documents_storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sop-documents'
    AND (current_profile_role() = 'super_admin' OR current_profile_has_capability('sop_repository'))
  );

DROP POLICY IF EXISTS "authorized_update_sop_documents_storage" ON storage.objects;
CREATE POLICY "authorized_update_sop_documents_storage" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'sop-documents'
    AND (current_profile_role() = 'super_admin' OR current_profile_has_capability('sop_repository'))
  );

DROP POLICY IF EXISTS "authorized_delete_sop_documents_storage" ON storage.objects;
CREATE POLICY "authorized_delete_sop_documents_storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'sop-documents'
    AND (current_profile_role() = 'super_admin' OR current_profile_has_capability('sop_repository'))
  );
