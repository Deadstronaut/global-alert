-- =====================================================
-- Sandboxed AI Assistance — capability config (spec 051)
-- Per-country, per-capability on/off switch for the four AI-assisted
-- support tasks (translate, summarize, classify_photo, anomaly_flag).
-- Defaults to disabled (opt-in). Does not affect risk scoring,
-- cascading-risk rules, or CAP authoring/dispatch — those remain
-- untouched by this and every other spec-051 migration.
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_capability_config (
  country_code    VARCHAR(2) NOT NULL,
  capability      TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  provider_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (country_code, capability),
  CONSTRAINT chk_ai_capability CHECK (capability IN ('translate', 'summarize', 'classify_photo', 'anomaly_flag'))
);

-- ── updated_at / audit triggers — reuse existing functions ─────────────────
DROP TRIGGER IF EXISTS ai_capability_config_updated_at ON ai_capability_config;
CREATE TRIGGER ai_capability_config_updated_at
  BEFORE UPDATE ON ai_capability_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS audit_ai_capability_config ON ai_capability_config;
CREATE TRIGGER audit_ai_capability_config
  AFTER INSERT OR UPDATE OR DELETE ON ai_capability_config
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE ai_capability_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY super_admin_ai_capability_config_all ON ai_capability_config
  FOR ALL USING (current_profile_role() = 'super_admin');

CREATE POLICY country_admin_ai_capability_config_own ON ai_capability_config
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

-- Every authenticated role (including org_admin/viewer) may read every
-- country's toggles — the UI needs this to decide whether to show/hide the
-- "AI ile çevir/özetle" buttons; the toggle itself remains admin-only above.
CREATE POLICY authenticated_read_ai_capability_config ON ai_capability_config
  FOR SELECT TO authenticated USING (true);
