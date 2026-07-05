-- =====================================================
-- Data Sources — configuration, health state machine, and
-- audit trails for source-state transitions and rejected payloads.
-- Feature: 001-data-ingestion-monitoring
-- =====================================================

CREATE TABLE IF NOT EXISTS data_sources (
  id                             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                           TEXT        NOT NULL,
  hazard_type                    TEXT        NOT NULL
                                   CHECK (hazard_type IN ('earthquake', 'wildfire', 'flood', 'drought', 'food_security')),
  endpoint_url                   TEXT        NOT NULL,
  endpoint_config                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  poll_interval_seconds          INTEGER     NOT NULL CHECK (poll_interval_seconds > 0),
  staleness_threshold_seconds    INTEGER     CHECK (staleness_threshold_seconds IS NULL OR staleness_threshold_seconds > 0),
  down_after_consecutive_failures INTEGER    NOT NULL DEFAULT 3 CHECK (down_after_consecutive_failures >= 1),
  is_active                      BOOLEAN     NOT NULL DEFAULT true,
  health_state                   TEXT        NOT NULL DEFAULT 'healthy'
                                   CHECK (health_state IN ('healthy', 'degraded', 'down', 'disabled')),
  consecutive_failures           INTEGER     NOT NULL DEFAULT 0,
  last_success_at                TIMESTAMPTZ,
  last_attempt_at                TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_disabled_matches_active CHECK (
    (is_active = false AND health_state = 'disabled') OR
    (is_active = true  AND health_state <> 'disabled')
  )
);

CREATE INDEX IF NOT EXISTS idx_data_sources_hazard_type ON data_sources (hazard_type);
CREATE INDEX IF NOT EXISTS idx_data_sources_active      ON data_sources (is_active);

CREATE TABLE IF NOT EXISTS source_state_transitions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID        NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  previous_state TEXT        NOT NULL CHECK (previous_state IN ('healthy', 'degraded', 'down', 'disabled')),
  new_state      TEXT        NOT NULL CHECK (new_state IN ('healthy', 'degraded', 'down', 'disabled')),
  reason         TEXT        NOT NULL,
  changed_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sst_source_created ON source_state_transitions (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sst_created        ON source_state_transitions (created_at DESC);

CREATE TABLE IF NOT EXISTS rejected_payloads (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         UUID        REFERENCES data_sources(id) ON DELETE SET NULL,
  hazard_type       TEXT        NOT NULL
                      CHECK (hazard_type IN ('earthquake', 'wildfire', 'flood', 'drought', 'food_security')),
  validation_error  TEXT        NOT NULL,
  record_excerpt    JSONB       NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rp_source_occurred ON rejected_payloads (source_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_occurred        ON rejected_payloads (occurred_at DESC);

-- ── updated_at maintenance ──────────────────────────────────────────────────────
-- Reuses set_updated_at(), already defined in 20260605_cap_drafts.sql (same helper
-- drill_mode/incidents also reuse without redefining it).
DROP TRIGGER IF EXISTS data_sources_set_updated_at ON data_sources;
CREATE TRIGGER data_sources_set_updated_at
  BEFORE UPDATE ON data_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Reuse existing generic audit_log trigger for data_sources CRUD ──────────────
-- (mirrors audit_profiles / audit_organizations in 20260605_audit_log.sql;
--  per research.md §3 decision to reuse audit_log rather than invent a new mechanism)
DROP TRIGGER IF EXISTS audit_data_sources ON data_sources;
CREATE TRIGGER audit_data_sources
  AFTER INSERT OR UPDATE OR DELETE ON data_sources
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── Row Level Security ───────────────────────────────────────────────────────────

ALTER TABLE data_sources             ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_state_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejected_payloads        ENABLE ROW LEVEL SECURITY;

-- ── Role-check helper (avoids RLS self-recursion) ───────────────────────────────
-- IMPORTANT: policies on `profiles` itself (20260603_profiles.sql) query `profiles`
-- from within their own USING clause (e.g. "super_admin_read_all_profiles"). Any OTHER
-- table's policy that does `EXISTS (SELECT 1 FROM profiles WHERE ...)` directly
-- re-triggers those profiles policies, which query profiles again → infinite recursion
-- (confirmed via local Postgres testing: "infinite recursion detected in policy for
-- relation profiles"). The existing `organizations` policies have this same latent bug.
-- SECURITY DEFINER + a fixed search_path makes this helper run with the FUNCTION
-- OWNER's privileges (the migration role, which is not subject to RLS on profiles),
-- so the lookup inside it does not re-enter profiles' own policies.
CREATE OR REPLACE FUNCTION current_profile_role() RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- data_sources: public read (dashboard is read-only for all roles, per spec.md Assumptions:
-- Operators/viewers have read-only visibility) — matches the public_read_* convention used
-- for earthquake/wildfire/flood/etc. in 20260410_rls.sql; this is non-sensitive config metadata.
CREATE POLICY "public_read_data_sources" ON data_sources
  FOR SELECT USING (true);

-- data_sources: only super_admin / country_admin may write
CREATE POLICY "admins_write_data_sources" ON data_sources
  FOR INSERT WITH CHECK (current_profile_role() IN ('super_admin', 'country_admin'));

CREATE POLICY "admins_update_data_sources" ON data_sources
  FOR UPDATE USING (current_profile_role() IN ('super_admin', 'country_admin'));

CREATE POLICY "admins_delete_data_sources" ON data_sources
  FOR DELETE USING (current_profile_role() IN ('super_admin', 'country_admin'));

-- source_state_transitions: append-only, super_admin read-only (FR-014)
CREATE POLICY "no_update_source_state_transitions" ON source_state_transitions FOR UPDATE USING (false);
CREATE POLICY "no_delete_source_state_transitions" ON source_state_transitions FOR DELETE USING (false);

CREATE POLICY "super_admin_read_source_state_transitions" ON source_state_transitions
  FOR SELECT USING (current_profile_role() = 'super_admin');

-- Service role (Edge Functions) bypasses RLS via SERVICE_ROLE_KEY, so no INSERT policy
-- is needed here for the writer path (mirrors upsert.ts's getServiceClient() pattern).

-- rejected_payloads: append-only, super_admin read-only (FR-014)
CREATE POLICY "no_update_rejected_payloads" ON rejected_payloads FOR UPDATE USING (false);
CREATE POLICY "no_delete_rejected_payloads" ON rejected_payloads FOR DELETE USING (false);

CREATE POLICY "super_admin_read_rejected_payloads" ON rejected_payloads
  FOR SELECT USING (current_profile_role() = 'super_admin');
