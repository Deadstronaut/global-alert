-- =====================================================
-- OGC WMS/WFS Map Layers — admin-registered external map overlay registry
-- Covers: spec 012 FR-001..FR-003 (MHEWS-FR-0037, MHEWS-SD-MAP-03)
-- Deliberately independent of data_sources: a map layer never produces a
-- stored hazard event, never runs a health/state machine, and is rendered
-- live on the client (consume-only, per constitution constraint C4).
-- =====================================================

CREATE TABLE IF NOT EXISTS map_layers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  display_name   TEXT        NOT NULL,
  source_type    TEXT        NOT NULL CHECK (source_type IN ('wms', 'wfs')),
  endpoint_url   TEXT        NOT NULL,
  layer_name     TEXT        NOT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT true,

  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_layers_active ON map_layers (is_active);

DROP TRIGGER IF EXISTS map_layers_updated_at ON map_layers;
CREATE TRIGGER map_layers_updated_at
  BEFORE UPDATE ON map_layers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE map_layers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_map_layers_all" ON map_layers;
CREATE POLICY "super_admin_map_layers_all" ON map_layers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "read_active_map_layers" ON map_layers;
CREATE POLICY "read_active_map_layers" ON map_layers
  FOR SELECT TO authenticated
  USING (
    is_active
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Audit trigger
DROP TRIGGER IF EXISTS audit_map_layers ON map_layers;
CREATE TRIGGER audit_map_layers
  AFTER INSERT OR UPDATE OR DELETE ON map_layers
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
