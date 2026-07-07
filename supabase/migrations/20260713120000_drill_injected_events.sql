-- =====================================================
-- Simulated Hazard Injection for Drills (spec 037, MHEWS-FR-0149)
-- New, additive table: while a drill_session (spec 013) is 'active', an
-- authorized user (country_admin/org_admin/super_admin) can inject a
-- simulated hazard event for realistic drill participation. These rows are
-- COMPLETELY SEPARATE from the real earthquake/wildfire/flood/etc.
-- ingestion tables (Principle IV) — never written to fetch-*/normalize
-- pipeline output, never counted in real exports/metrics. Visible only
-- while the parent drill is 'active' (RLS-enforced); rows persist after the
-- drill completes for audit purposes but stop being readable to non-admins.
-- No existing table, trigger, or Edge Function is modified.
-- =====================================================

CREATE TABLE IF NOT EXISTS drill_injected_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_session_id  UUID NOT NULL REFERENCES drill_sessions(id) ON DELETE CASCADE,
  country_code      VARCHAR(2) NOT NULL,
  hazard_type       TEXT NOT NULL REFERENCES hazard_types(code),
  description       TEXT NOT NULL,
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  severity          TEXT NOT NULL,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_drill_event_severity CHECK (severity IN ('critical','high','moderate','low','minimal')),
  CONSTRAINT chk_drill_event_lat CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT chk_drill_event_lng CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT chk_drill_event_description CHECK (btrim(description) <> '')
);

CREATE INDEX IF NOT EXISTS idx_drill_injected_events_session ON drill_injected_events (drill_session_id);
CREATE INDEX IF NOT EXISTS idx_drill_injected_events_country ON drill_injected_events (country_code);

-- Audit trail, same pattern as every other user-writable table in this project.
DROP TRIGGER IF EXISTS audit_drill_injected_events ON drill_injected_events;
CREATE TRIGGER audit_drill_injected_events
  AFTER INSERT OR UPDATE OR DELETE ON drill_injected_events
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE drill_injected_events ENABLE ROW LEVEL SECURITY;

-- Mirrors drill_sessions' own EXISTS/profiles-subquery RLS style (research.md
-- Decision 4) rather than the current_profile_role()/current_profile_country_code()
-- helpers used elsewhere — module-internal consistency with drill_sessions.
DROP POLICY IF EXISTS "super_admin_drill_events_all" ON drill_injected_events;
CREATE POLICY "super_admin_drill_events_all" ON drill_injected_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "country_admin_drill_events_own" ON drill_injected_events;
CREATE POLICY "country_admin_drill_events_own" ON drill_injected_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND p.country_code = drill_injected_events.country_code
    )
  );

-- Any authenticated role (including viewer) may read injected events, but
-- ONLY while the parent drill is still 'active' (FR-004/FR-005) — this is
-- the mechanism that makes events disappear from the map the moment a drill
-- is marked 'completed', with zero application-side cleanup logic needed.
DROP POLICY IF EXISTS "authenticated_read_active_drill_events" ON drill_injected_events;
CREATE POLICY "authenticated_read_active_drill_events" ON drill_injected_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM drill_sessions ds
      WHERE ds.id = drill_injected_events.drill_session_id
        AND ds.status = 'active'
    )
  );
