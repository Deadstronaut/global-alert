-- =====================================================
-- Spec 029: Audit Log Resilience
-- Covers PRD MHEWS-FC-ERR-09 (audit write failure must not block the
-- triggering operation, failed writes queued for retry) and
-- MHEWS-FC-OUV-06 (resource-tied audit events must specify table/record).
--
-- audit_log's existing schema/RLS/hash-chain (verify_audit_chain(), spec 007)
-- are NEVER modified — this migration is purely additive.
--
-- log_table_change() is updated via plain CREATE OR REPLACE (no DROP, no
-- CASCADE) — this function backs ~20 triggers across the schema (profiles,
-- organizations, cap_drafts, incidents, contacts, shelters, etc.); dropping
-- it would silently disable audit logging everywhere until each trigger was
-- manually re-created. The id-extraction fix from
-- 20260706190000_fix_log_table_change_missing_id.sql (to_jsonb(...)->>'id',
-- for tables like country_boundaries whose PK isn't literally `id`) is
-- preserved unchanged.
-- =====================================================

-- ── audit_log_dead_letter ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log_dead_letter (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action        TEXT        NOT NULL,
  table_name    TEXT,
  record_id     TEXT,
  old_data      JSONB,
  new_data      JSONB,
  error_message TEXT,
  failed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_log_dead_letter ENABLE ROW LEVEL SECURITY;

-- Mirrors audit_log's own super_admin_read_audit policy exactly — no
-- INSERT/UPDATE/DELETE policy for any role (only SECURITY DEFINER functions
-- write to/delete from this table).
DROP POLICY IF EXISTS "super_admin_read_audit_dead_letter" ON audit_log_dead_letter;
CREATE POLICY "super_admin_read_audit_dead_letter" ON audit_log_dead_letter
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ── Completeness check (MHEWS-FC-OUV-06) ─────────────────────────────────────
-- Resource-tied events (INSERT/UPDATE/DELETE) must specify table_name.
-- Resource-independent events (LOGIN/EXPORT) are exempt — the existing
-- compliance-report calculation already expects table_name=NULL for those
-- (see supabase/functions/shared/complianceReport.test.ts).
--
-- record_id is deliberately NOT required here: log_table_change() extracts it
-- via to_jsonb(NEW)->>'id' (20260706190000_fix_log_table_change_missing_id.sql),
-- which returns NULL for tables whose primary key isn't literally named `id`
-- (e.g. hazard_types PK=code, country_boundaries PK=country_code,
-- integration_types PK=code) — confirmed live via a read-only query that
-- table_name is always populated but record_id is legitimately NULL for
-- these tables' existing rows. Requiring record_id NOT NULL here would have
-- rejected valid, already-accepted audit rows (caught when the original
-- stricter version of this constraint failed to apply against live data).
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS chk_audit_log_completeness;
ALTER TABLE audit_log
  ADD CONSTRAINT chk_audit_log_completeness
  CHECK (action NOT IN ('INSERT','UPDATE','DELETE') OR table_name IS NOT NULL);

-- ── log_table_change() resilience (MHEWS-FC-ERR-09) ──────────────────────────
-- Each branch's audit_log write is now independently guarded: a failure never
-- blocks the triggering table's own INSERT/UPDATE/DELETE. Failed writes are
-- captured in audit_log_dead_letter instead of being silently lost. Plain
-- CREATE OR REPLACE (same signature, no DROP) — every existing trigger bound
-- to this function keeps working unmodified.
CREATE OR REPLACE FUNCTION log_table_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    BEGIN
      INSERT INTO audit_log (action, table_name, record_id, new_data)
      VALUES ('INSERT', TG_TABLE_NAME, to_jsonb(NEW)->>'id', to_jsonb(NEW));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit_log_dead_letter (action, table_name, record_id, new_data, error_message)
      VALUES ('INSERT', TG_TABLE_NAME, to_jsonb(NEW)->>'id', to_jsonb(NEW), SQLERRM);
    END;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    BEGIN
      INSERT INTO audit_log (action, table_name, record_id, old_data, new_data)
      VALUES ('UPDATE', TG_TABLE_NAME, to_jsonb(NEW)->>'id', to_jsonb(OLD), to_jsonb(NEW));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit_log_dead_letter (action, table_name, record_id, old_data, new_data, error_message)
      VALUES ('UPDATE', TG_TABLE_NAME, to_jsonb(NEW)->>'id', to_jsonb(OLD), to_jsonb(NEW), SQLERRM);
    END;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    BEGIN
      INSERT INTO audit_log (action, table_name, record_id, old_data)
      VALUES ('DELETE', TG_TABLE_NAME, to_jsonb(OLD)->>'id', to_jsonb(OLD));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit_log_dead_letter (action, table_name, record_id, old_data, error_message)
      VALUES ('DELETE', TG_TABLE_NAME, to_jsonb(OLD)->>'id', to_jsonb(OLD), SQLERRM);
    END;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ── flush_audit_dead_letter (manual retry, FR-003/FR-004) ────────────────────
-- Optional enhancement (analysis F1, not required): this retry action itself
-- isn't written as its own audit_log entry — only the flushed rows are. See
-- research.md/data-model.md for rationale.
DROP FUNCTION IF EXISTS flush_audit_dead_letter();
CREATE OR REPLACE FUNCTION flush_audit_dead_letter()
RETURNS TABLE(succeeded INT, failed INT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n_succeeded INT := 0;
  n_failed INT := 0;
BEGIN
  IF current_profile_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'not authorized to flush audit dead letter';
  END IF;

  FOR r IN SELECT * FROM audit_log_dead_letter ORDER BY failed_at LOOP
    BEGIN
      INSERT INTO audit_log (action, table_name, record_id, old_data, new_data)
      VALUES (r.action, r.table_name, r.record_id, r.old_data, r.new_data);
      DELETE FROM audit_log_dead_letter WHERE id = r.id;
      n_succeeded := n_succeeded + 1;
    EXCEPTION WHEN OTHERS THEN
      n_failed := n_failed + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT n_succeeded, n_failed;
END;
$$;

GRANT EXECUTE ON FUNCTION flush_audit_dead_letter() TO authenticated;
