-- =====================================================
-- Community Hazard Reporting: voice-note attachment (spec 036 remaining
-- item — "ses eki desteği"). Additive column + storage bucket, mirroring
-- the existing optional photo_path attachment exactly: submit-community-
-- report is the only write path (service-role), public-read bucket so the
-- moderation queue and map popup can play it back directly. No existing
-- column, RLS policy, or trigger is modified.
-- =====================================================

ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS audio_path TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('community-report-audio', 'community-report-audio', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_community_report_audio" ON storage.objects;
CREATE POLICY "public_read_community_report_audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'community-report-audio');
