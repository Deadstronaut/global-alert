-- =====================================================
-- Community Hazard Reporting (spec 036)
-- New, additive table: unauthenticated citizens submit geo-tagged hazard
-- reports (description, hazard type, location, optional photo). A
-- country_admin/super_admin moderates (approve/reject with reason) before
-- anything becomes visible; approved reports render as a clustered map
-- layer and can optionally be linked to an incident or assigned to an
-- organization (org_admin then gets read-only visibility of assigned
-- reports). No existing table, RLS policy, or Edge Function is modified.
-- =====================================================

CREATE TABLE IF NOT EXISTS community_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_type       TEXT NOT NULL REFERENCES hazard_types(code),
  description       TEXT NOT NULL,
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  country_code      VARCHAR(2),
  photo_path        TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  rejection_reason  TEXT,
  assigned_org_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
  linked_incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  moderated_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  moderated_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_community_report_status CHECK (status IN ('pending','approved','rejected','archived')),
  CONSTRAINT chk_community_report_lat CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT chk_community_report_lng CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT chk_community_report_description CHECK (btrim(description) <> '')
);

CREATE INDEX IF NOT EXISTS idx_community_reports_country   ON community_reports (country_code);
CREATE INDEX IF NOT EXISTS idx_community_reports_status    ON community_reports (status);
CREATE INDEX IF NOT EXISTS idx_community_reports_incident  ON community_reports (linked_incident_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_org       ON community_reports (assigned_org_id);

-- ── State machine guard (mirrors guard_incident_transition()/guard_cap_draft
-- rejection-reason-required pattern) ────────────────────────────────────────
DROP TRIGGER IF EXISTS guard_community_reports_transition ON community_reports;
DROP FUNCTION IF EXISTS guard_community_report_transition();

CREATE FUNCTION guard_community_report_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'invalid_community_report_transition: % is already the current status', NEW.status;
  END IF;

  IF NOT (
    (OLD.status = 'pending'  AND NEW.status IN ('approved','rejected')) OR
    (OLD.status = 'approved' AND NEW.status = 'archived') OR
    (OLD.status = 'rejected' AND NEW.status = 'archived')
  ) THEN
    RAISE EXCEPTION 'invalid_community_report_transition: % -> % is not allowed', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'rejected' AND (NEW.rejection_reason IS NULL OR btrim(NEW.rejection_reason) = '') THEN
    RAISE EXCEPTION 'reason_required: rejection_reason is required when rejecting a report';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_community_reports_transition
  BEFORE UPDATE OF status ON community_reports
  FOR EACH ROW
  EXECUTE FUNCTION guard_community_report_transition();

-- ── updated_at / audit triggers — reuse existing functions, no duplication ──
DROP TRIGGER IF EXISTS community_reports_updated_at ON community_reports;
CREATE TRIGGER community_reports_updated_at
  BEFORE UPDATE ON community_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS audit_community_reports ON community_reports;
CREATE TRIGGER audit_community_reports
  AFTER INSERT OR UPDATE OR DELETE ON community_reports
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;

-- No INSERT policy for any client role — the only write path is the
-- submit-community-report Edge Function's service-role client (research.md
-- Decision 2), which bypasses RLS entirely.

CREATE POLICY super_admin_community_reports_all ON community_reports
  FOR ALL USING (current_profile_role() = 'super_admin');

CREATE POLICY country_admin_community_reports_moderate ON community_reports
  FOR SELECT USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

CREATE POLICY country_admin_community_reports_update ON community_reports
  FOR UPDATE USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

CREATE POLICY authenticated_read_approved_community_reports ON community_reports
  FOR SELECT TO authenticated USING (status = 'approved');

CREATE POLICY org_admin_read_assigned_community_reports ON community_reports
  FOR SELECT USING (
    current_profile_role() = 'org_admin'
    AND status = 'approved'
    AND assigned_org_id = current_profile_org_id()
  );

-- ── Storage: community-report-photos bucket ─────────────────────────────────
-- Public-read (so approved reports' photos render in the map popup and
-- moderation queue), write restricted to the service-role client inside
-- submit-community-report (research.md Decision 3) — no anon/authenticated
-- INSERT/UPDATE/DELETE policy is created on storage.objects for this bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-report-photos', 'community-report-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_community_report_photos" ON storage.objects;
CREATE POLICY "public_read_community_report_photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'community-report-photos');
