-- =====================================================
-- Drill Mode — tenant-level simulation flag
-- Covers: SD-DRILL-01, SD-DRILL-02, FC-STM-11
-- State machine: INACTIVE → ACTIVE → COMPLETED
-- When active: all CAP alerts get status=Exercise, live data unaffected
-- =====================================================

CREATE TABLE IF NOT EXISTS drill_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  VARCHAR(2)  NOT NULL,
  org_id        UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- State machine (FC-STM-11)
  status        TEXT        NOT NULL DEFAULT 'inactive'
                CHECK (status IN ('inactive','active','completed')),

  title         TEXT        NOT NULL,
  description   TEXT,
  scenario_type TEXT,   -- 'earthquake', 'flood', 'multi_hazard', ...

  -- Auto-summary on deactivation (SD-DRILL-02)
  summary       JSONB,   -- { alerts_issued, incidents_created, duration_min, participants }

  started_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drill_country ON drill_sessions (country_code, status);

DROP TRIGGER IF EXISTS drill_sessions_updated_at ON drill_sessions;
CREATE TRIGGER drill_sessions_updated_at
  BEFORE UPDATE ON drill_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE drill_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_drill_all" ON drill_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE POLICY "country_admin_drill_own" ON drill_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND p.country_code = drill_sessions.country_code
    )
  );

-- Audit trigger
DROP TRIGGER IF EXISTS audit_drill_sessions ON drill_sessions;
CREATE TRIGGER audit_drill_sessions
  AFTER INSERT OR UPDATE OR DELETE ON drill_sessions
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
