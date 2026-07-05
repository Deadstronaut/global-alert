-- =====================================================
-- Incident Report and Lifecycle Tracking
-- Covers: FC-STM-04, FR-0271, FR-0184, FR-0207
-- State machine: OPEN → IN_PROGRESS → MONITORING → CLOSED → ARCHIVED
-- =====================================================

CREATE TABLE IF NOT EXISTS incidents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core fields
  title           TEXT        NOT NULL,
  description     TEXT,
  hazard_type     TEXT        NOT NULL,
  severity        TEXT        NOT NULL CHECK (severity IN ('critical','high','moderate','low','minimal')),

  -- State machine (FC-STM-04)
  status          TEXT        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','monitoring','closed','archived')),

  -- Geographic
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  area_desc       TEXT,
  country_code    VARCHAR(2),

  -- Response planning (FR-0271)
  response_plan   TEXT,
  post_event_notes TEXT,

  -- Linked SOPs and CAP (FR-0207)
  linked_cap_id   UUID REFERENCES cap_drafts(id) ON DELETE SET NULL,
  sop_refs        JSONB DEFAULT '[]',  -- [{ "category": "Legislation", "title": "...", "url": "..." }]

  -- Metadata
  org_id          UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status   ON incidents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_country  ON incidents (country_code, status);
CREATE INDEX IF NOT EXISTS idx_incidents_hazard   ON incidents (hazard_type, status);

DROP TRIGGER IF EXISTS incidents_updated_at ON incidents;
CREATE TRIGGER incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_incidents_all" ON incidents;
CREATE POLICY "super_admin_incidents_all" ON incidents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "country_admin_incidents_own" ON incidents;
CREATE POLICY "country_admin_incidents_own" ON incidents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND p.country_code = incidents.country_code
    )
  );

DROP POLICY IF EXISTS "viewer_incidents_read" ON incidents;
CREATE POLICY "viewer_incidents_read" ON incidents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.country_code = incidents.country_code
    )
  );

-- Audit trigger
DROP TRIGGER IF EXISTS audit_incidents ON incidents;
CREATE TRIGGER audit_incidents
  AFTER INSERT OR UPDATE OR DELETE ON incidents
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
