-- =====================================================
-- Dissemination & Contact Directory (spec 009)
-- Covers: FR-005, FR-006, FR-009, FR-010, FR-011, FR-012
--
-- DispatchJob (one per broadcasting CAP alert) and DispatchReceipt (one per
-- contact+channel) track dispatch outcomes with a state machine mirroring the
-- data_sources health-state pattern (20260703120000_data_sources.sql) in
-- shape, applied to a new domain. Writes happen only through the
-- dispatch-alert Edge Function (service role) — no client INSERT/UPDATE
-- policy exists on either table; RLS default-denies everything not granted.
-- =====================================================

CREATE TABLE IF NOT EXISTS dispatch_jobs (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cap_draft_id            UUID        NOT NULL REFERENCES cap_drafts(id) ON DELETE CASCADE,
  status                  TEXT        NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','running','completed','failed')),
  matched_contact_count   INTEGER     NOT NULL DEFAULT 0,
  started_at              TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  failure_reason          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_draft  ON dispatch_jobs (cap_draft_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_status ON dispatch_jobs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS dispatch_receipts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_job_id       UUID        NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  contact_id            UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  channel               TEXT        NOT NULL CHECK (channel IN ('email','whatsapp')),
  status                TEXT        NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','sent','delivered','failed','bounced')),
  provider_message_id   TEXT,
  failure_reason        TEXT,
  retry_count           INTEGER     NOT NULL DEFAULT 0,
  is_mock               BOOLEAN     NOT NULL DEFAULT false,
  sent_at               TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_receipts_job     ON dispatch_receipts (dispatch_job_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatch_receipts_contact ON dispatch_receipts (contact_id);

-- ── State-machine guard: rejects invalid status transitions on either table
--    (mirrors guard_cap_draft_transition()'s style from spec 006 hardening).
CREATE OR REPLACE FUNCTION guard_dispatch_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'dispatch_jobs' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'queued'  AND NEW.status = 'running') OR
        (OLD.status = 'running' AND NEW.status IN ('completed','failed'))
      ) THEN
        RAISE EXCEPTION 'invalid_transition: dispatch_jobs % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'dispatch_receipts' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'queued'  AND NEW.status IN ('sent','failed')) OR
        (OLD.status = 'sent'    AND NEW.status IN ('delivered','failed','bounced')) OR
        -- A retry (spec 009 US3/FR-011) reopens the same row rather than
        -- creating a duplicate; retry_count distinguishes it from attempt 1.
        (OLD.status = 'failed'  AND NEW.status = 'queued') OR
        (OLD.status = 'bounced' AND NEW.status = 'queued')
      ) THEN
        RAISE EXCEPTION 'invalid_transition: dispatch_receipts % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_dispatch_jobs_transition ON dispatch_jobs;
CREATE TRIGGER guard_dispatch_jobs_transition
  BEFORE UPDATE ON dispatch_jobs
  FOR EACH ROW EXECUTE FUNCTION guard_dispatch_transition();

DROP TRIGGER IF EXISTS guard_dispatch_receipts_transition ON dispatch_receipts;
CREATE TRIGGER guard_dispatch_receipts_transition
  BEFORE UPDATE ON dispatch_receipts
  FOR EACH ROW EXECUTE FUNCTION guard_dispatch_transition();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE dispatch_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_dispatch_jobs_all" ON dispatch_jobs;
CREATE POLICY "super_admin_dispatch_jobs_all" ON dispatch_jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "country_admin_dispatch_jobs_own" ON dispatch_jobs;
CREATE POLICY "country_admin_dispatch_jobs_own" ON dispatch_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN cap_drafts d ON d.id = dispatch_jobs.cap_draft_id
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND d.country_code = p.country_code
    )
  );

DROP POLICY IF EXISTS "super_admin_dispatch_receipts_all" ON dispatch_receipts;
CREATE POLICY "super_admin_dispatch_receipts_all" ON dispatch_receipts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "country_admin_dispatch_receipts_own" ON dispatch_receipts;
CREATE POLICY "country_admin_dispatch_receipts_own" ON dispatch_receipts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN dispatch_jobs j ON j.id = dispatch_receipts.dispatch_job_id
      JOIN cap_drafts d ON d.id = j.cap_draft_id
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND d.country_code = p.country_code
    )
  );

-- Deliberately no INSERT/UPDATE/DELETE policy for non-service-role callers on
-- either table (RLS default-denies) — only the service-role-authenticated
-- dispatch-alert Edge Function writes these rows. No `viewer` policy and no
-- separate "Auditor" role/policy: profiles.role only ever contains
-- super_admin/country_admin/org_admin/viewer (spec 007 precedent — cross-
-- tenant compliance visibility is a super_admin capability, not a 4th role).

-- Audit trail, same pattern as every other admin-managed table.
DROP TRIGGER IF EXISTS audit_dispatch_jobs ON dispatch_jobs;
CREATE TRIGGER audit_dispatch_jobs
  AFTER INSERT OR UPDATE OR DELETE ON dispatch_jobs
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

DROP TRIGGER IF EXISTS audit_dispatch_receipts ON dispatch_receipts;
CREATE TRIGGER audit_dispatch_receipts
  AFTER INSERT OR UPDATE OR DELETE ON dispatch_receipts
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
