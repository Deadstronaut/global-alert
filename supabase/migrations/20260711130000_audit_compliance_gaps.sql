-- =====================================================
-- Audit & Compliance Gaps (spec 035)
-- Covers: MHEWS-FR-0025/FR-0088/FR-0096 (retention policies),
--         MHEWS-FR-0045 (evidence package export, audit_log side),
--         MHEWS-FR-0081 (controlled/justified deletion),
--         MHEWS-FR-0054/MHEWS-FC-ERR-10 (security breach event logging),
--         MHEWS-FR-0338 (security config audit report)
--
-- Additive only: audit_log's append-only RLS (no_update_audit/no_delete_audit,
-- 20260605120000_audit_log.sql) is NEVER relaxed. Retention enforcement and
-- controlled deletion both delete rows only via SECURITY DEFINER functions
-- owned by the same role that owns the tables, which bypasses RLS the same
-- way log_table_change() already does (research.md Decision 7) — client
-- roles still cannot UPDATE/DELETE audit_log directly.
-- =====================================================

-- ── audit_log: additive columns ─────────────────────────────────────────────
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS event_category TEXT NOT NULL DEFAULT 'data_change';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS justification TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_audit_event_category'
  ) THEN
    ALTER TABLE audit_log ADD CONSTRAINT chk_audit_event_category
      CHECK (event_category IN ('data_change','security_event'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_event_category ON audit_log (event_category, created_at DESC);

-- ── US1: retention_policies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retention_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category        TEXT NOT NULL UNIQUE CHECK (category IN ('audit_log','dispatch_receipts')),
  retention_days  INTEGER NOT NULL CHECK (retention_days > 0),
  action          TEXT NOT NULL CHECK (action IN ('archive','delete')),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_retention_policies_all" ON retention_policies;
CREATE POLICY "super_admin_retention_policies_all" ON retention_policies
  FOR ALL USING (current_profile_role() = 'super_admin');

-- ── audit_log_archive / dispatch_receipts_archive (archive targets) ─────────
CREATE TABLE IF NOT EXISTS audit_log_archive (
  id             UUID PRIMARY KEY,
  action         TEXT,
  table_name     TEXT,
  record_id      TEXT,
  old_data       JSONB,
  new_data       JSONB,
  changed_by     UUID,
  ip_address     TEXT,
  user_agent     TEXT,
  checksum       TEXT,
  event_category TEXT,
  justification  TEXT,
  created_at     TIMESTAMPTZ,
  archived_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_log_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_audit_log_archive_select" ON audit_log_archive;
CREATE POLICY "super_admin_audit_log_archive_select" ON audit_log_archive
  FOR SELECT USING (current_profile_role() = 'super_admin');

CREATE TABLE IF NOT EXISTS dispatch_receipts_archive (
  id                  UUID PRIMARY KEY,
  dispatch_job_id     UUID,
  contact_id          UUID,
  channel             TEXT,
  status              TEXT,
  provider_message_id TEXT,
  failure_reason      TEXT,
  retry_count         INTEGER,
  is_mock             BOOLEAN,
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ,
  archived_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dispatch_receipts_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_dispatch_receipts_archive_select" ON dispatch_receipts_archive;
CREATE POLICY "super_admin_dispatch_receipts_archive_select" ON dispatch_receipts_archive
  FOR SELECT USING (current_profile_role() = 'super_admin');

-- ── enforce_retention_policies(): periodic archive/delete + self-logging ───
CREATE OR REPLACE FUNCTION enforce_retention_policies()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pol RECORD;
  affected INTEGER;
BEGIN
  FOR pol IN SELECT * FROM retention_policies LOOP
    IF pol.category = 'audit_log' THEN
      IF pol.action = 'archive' THEN
        INSERT INTO audit_log_archive (
          id, action, table_name, record_id, old_data, new_data, changed_by,
          ip_address, user_agent, checksum, event_category, justification, created_at
        )
        SELECT id, action, table_name, record_id, old_data, new_data, changed_by,
               ip_address, user_agent, checksum, event_category, justification, created_at
        FROM audit_log
        WHERE created_at < NOW() - (pol.retention_days || ' days')::INTERVAL;
        GET DIAGNOSTICS affected = ROW_COUNT;

        DELETE FROM audit_log WHERE created_at < NOW() - (pol.retention_days || ' days')::INTERVAL;
      ELSE
        DELETE FROM audit_log WHERE created_at < NOW() - (pol.retention_days || ' days')::INTERVAL;
        GET DIAGNOSTICS affected = ROW_COUNT;
      END IF;

    ELSIF pol.category = 'dispatch_receipts' THEN
      IF pol.action = 'archive' THEN
        INSERT INTO dispatch_receipts_archive (
          id, dispatch_job_id, contact_id, channel, status, provider_message_id,
          failure_reason, retry_count, is_mock, sent_at, delivered_at, created_at
        )
        SELECT id, dispatch_job_id, contact_id, channel, status, provider_message_id,
               failure_reason, retry_count, is_mock, sent_at, delivered_at, created_at
        FROM dispatch_receipts
        WHERE created_at < NOW() - (pol.retention_days || ' days')::INTERVAL;
        GET DIAGNOSTICS affected = ROW_COUNT;

        DELETE FROM dispatch_receipts WHERE created_at < NOW() - (pol.retention_days || ' days')::INTERVAL;
      ELSE
        DELETE FROM dispatch_receipts WHERE created_at < NOW() - (pol.retention_days || ' days')::INTERVAL;
        GET DIAGNOSTICS affected = ROW_COUNT;
      END IF;
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO audit_log (action, table_name, record_id, new_data, event_category)
    VALUES (
      'retention_enforced',
      pol.category,
      NULL,
      jsonb_build_object('category', pol.category, 'action', pol.action, 'affected_count', affected),
      'data_change'
    );
  END LOOP;
END;
$$;

-- ── Daily schedule: 02:00 UTC ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enforce-retention-policies-daily') THEN
    PERFORM cron.unschedule('enforce-retention-policies-daily');
  END IF;

  PERFORM cron.schedule(
    'enforce-retention-policies-daily',
    '0 2 * * *',
    $job$SELECT enforce_retention_policies()$job$
  );
END;
$$;

-- ── US3: delete_with_justification() ────────────────────────────────────────
-- Allow-list intentionally hardcoded (research.md Decision 4) — the only
-- table in the codebase with a real hard-delete path today is
-- exposure_datasets (ExposureDatasetManager.vue). Adding a new table here is
-- a one-line allow-list change, not a schema change.
CREATE OR REPLACE FUNCTION delete_with_justification(
  target_table TEXT,
  target_id UUID,
  justification_text TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF target_table NOT IN ('exposure_datasets') THEN
    RAISE EXCEPTION 'delete_with_justification: table % is not in the controlled-deletion allow-list', target_table;
  END IF;

  IF justification_text IS NULL OR btrim(justification_text) = '' THEN
    RAISE EXCEPTION 'delete_with_justification: a justification is required';
  END IF;

  EXECUTE format('DELETE FROM %I WHERE id = $1', target_table) USING target_id;

  INSERT INTO audit_log (action, table_name, record_id, justification, event_category)
  VALUES ('delete', target_table, target_id::text, justification_text, 'data_change');
END;
$$;

GRANT EXECUTE ON FUNCTION delete_with_justification(TEXT, UUID, TEXT) TO authenticated;

-- ── US4: security_event logging on account lockout ──────────────────────────
-- Re-declares record_failed_login() (20260709120000_access_review_and_lockout.sql)
-- with the SAME lockout logic, additively logging a security_event only when
-- this call is the one that newly sets locked_until.
DROP FUNCTION IF EXISTS record_failed_login(TEXT);
CREATE OR REPLACE FUNCTION record_failed_login(p_email TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_was_locked BOOLEAN;
BEGIN
  SELECT id, (locked_until IS NOT NULL AND locked_until > NOW())
  INTO v_profile_id, v_was_locked
  FROM profiles WHERE email = p_email;

  UPDATE profiles
  SET failed_login_attempts = failed_login_attempts + 1,
      locked_until = CASE
        WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
        ELSE locked_until
      END
  WHERE email = p_email;

  IF v_profile_id IS NOT NULL AND NOT v_was_locked THEN
    IF (SELECT locked_until FROM profiles WHERE id = v_profile_id) IS NOT NULL THEN
      INSERT INTO audit_log (action, table_name, record_id, event_category)
      VALUES ('account_locked', 'profiles', v_profile_id::text, 'security_event');
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION record_failed_login(TEXT) TO anon, authenticated;

-- ── US5: get_security_config_report() ───────────────────────────────────────
DROP FUNCTION IF EXISTS get_security_config_report();
CREATE OR REPLACE FUNCTION get_security_config_report()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF current_profile_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'not authorized to view security config report';
  END IF;

  SELECT jsonb_build_object(
    'mfa_role_policy', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('role', role, 'required', required)), '[]'::jsonb)
      FROM mfa_role_policy
    ),
    'retention_policies', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category', category, 'retention_days', retention_days, 'action', action
      )), '[]'::jsonb)
      FROM retention_policies
    ),
    'capability_grant_counts', (
      SELECT COALESCE(jsonb_object_agg(capability, cnt), '{}'::jsonb)
      FROM (
        SELECT capability, COUNT(*) AS cnt
        FROM profile_capability_grants
        GROUP BY capability
      ) t
    ),
    'generated_at', NOW()
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_security_config_report() TO authenticated;
