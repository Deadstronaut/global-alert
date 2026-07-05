-- =====================================================
-- Audit & Compliance hash-chain hardening (spec 007)
--
-- The existing audit_log table (20260605120000_audit_log.sql) already has a
-- per-row, self-contained `checksum` (md5 of its own fields) but no chaining
-- between rows, so an out-of-band tamper (e.g. direct DB access bypassing
-- RLS) on one row cannot be detected relative to its neighbors. This
-- migration is purely additive: a monotonic `seq` column and a SHA-256
-- `chain_hash` column populated by a BEFORE INSERT trigger. Existing rows
-- are left with chain_hash = NULL (treated as the pre-feature genesis
-- boundary, not retroactively chained — see research.md §3).
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS seq BIGSERIAL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS chain_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_seq ON audit_log (seq);

-- ── set_audit_chain_hash: BEFORE INSERT trigger ─────────────────────────────
CREATE OR REPLACE FUNCTION set_audit_chain_hash()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  prev_hash TEXT;
BEGIN
  SELECT chain_hash INTO prev_hash FROM audit_log WHERE seq = NEW.seq - 1;

  NEW.chain_hash := encode(
    digest(
      COALESCE(NEW.action,'') || COALESCE(NEW.table_name,'') || COALESCE(NEW.record_id,'') ||
      COALESCE(NEW.new_data::text,'') || COALESCE(NEW.old_data::text,'') ||
      COALESCE(prev_hash, 'GENESIS'),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_audit_chain_hash ON audit_log;
CREATE TRIGGER set_audit_chain_hash
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION set_audit_chain_hash();

-- ── verify_audit_chain: set-based integrity check ───────────────────────────
-- Returns the seq of the first row (after the genesis boundary) whose stored
-- chain_hash no longer matches its recomputed value, or NULL if intact.
CREATE OR REPLACE FUNCTION verify_audit_chain()
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  broken_seq BIGINT;
BEGIN
  IF current_profile_role() IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'not_authorized: only super_admin may verify audit chain integrity';
  END IF;

  SELECT seq INTO broken_seq FROM (
    SELECT
      seq,
      chain_hash,
      encode(
        digest(
          COALESCE(action,'') || COALESCE(table_name,'') || COALESCE(record_id,'') ||
          COALESCE(new_data::text,'') || COALESCE(old_data::text,'') ||
          COALESCE(LAG(chain_hash) OVER (ORDER BY seq), 'GENESIS'),
          'sha256'
        ),
        'hex'
      ) AS recomputed
    FROM audit_log
    WHERE chain_hash IS NOT NULL
  ) t
  WHERE t.chain_hash IS DISTINCT FROM t.recomputed
  ORDER BY seq ASC
  LIMIT 1;

  RETURN broken_seq;
END;
$$;
