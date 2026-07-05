-- =====================================================
-- Fix: pgcrypto's digest() lives in the `extensions` schema on Supabase-
-- managed Postgres (not `public`), so the hash-chain trigger/function from
-- 20260706160000_audit_log_hash_chain.sql failed with
-- "function digest(text, unknown) does not exist" because their default
-- search_path doesn't include it. Schema-qualify the calls explicitly.
-- =====================================================

CREATE OR REPLACE FUNCTION set_audit_chain_hash()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  prev_hash TEXT;
BEGIN
  SELECT chain_hash INTO prev_hash FROM audit_log WHERE seq = NEW.seq - 1;

  NEW.chain_hash := encode(
    extensions.digest(
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

CREATE OR REPLACE FUNCTION verify_audit_chain()
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
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
        extensions.digest(
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
