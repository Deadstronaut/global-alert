-- =====================================================
-- Scheduled Multi-Step Drill Scenario Sequences (spec 037 remaining item —
-- "zamanlanmış/çok adımlı senaryo dizileri", e.g. earthquake → +2h aftershock
-- → +6h flood). New, additive table: an ordered list of hazard-injection
-- "steps" attached to a drill_session, each with a delay (in minutes) from
-- the drill's started_at. A pg_cron job auto-injects each step into the
-- existing drill_injected_events table (spec 037) once its delay has
-- elapsed and the parent drill is still 'active' — no existing table,
-- trigger, or Edge Function is modified; drill_injected_events itself is
-- only ever INSERTed into, exactly as a manual injection would.
-- =====================================================

CREATE TABLE IF NOT EXISTS drill_scenario_steps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_session_id   UUID NOT NULL REFERENCES drill_sessions(id) ON DELETE CASCADE,
  step_order         INTEGER NOT NULL,
  delay_minutes      INTEGER NOT NULL,
  hazard_type        TEXT NOT NULL REFERENCES hazard_types(code),
  description        TEXT NOT NULL,
  lat                DOUBLE PRECISION NOT NULL,
  lng                DOUBLE PRECISION NOT NULL,
  severity           TEXT NOT NULL,
  injected_at        TIMESTAMPTZ,
  injected_event_id  UUID REFERENCES drill_injected_events(id) ON DELETE SET NULL,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_drill_step_order CHECK (step_order >= 0),
  CONSTRAINT chk_drill_step_delay CHECK (delay_minutes >= 0),
  CONSTRAINT chk_drill_step_severity CHECK (severity IN ('critical','high','moderate','low','minimal')),
  CONSTRAINT chk_drill_step_lat CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT chk_drill_step_lng CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT chk_drill_step_description CHECK (btrim(description) <> ''),
  CONSTRAINT uq_drill_step_order UNIQUE (drill_session_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_drill_scenario_steps_session ON drill_scenario_steps (drill_session_id);
-- Narrow, cheap index for the per-minute cron scan below (only unfired steps matter).
CREATE INDEX IF NOT EXISTS idx_drill_scenario_steps_pending ON drill_scenario_steps (drill_session_id) WHERE injected_at IS NULL;

DROP TRIGGER IF EXISTS audit_drill_scenario_steps ON drill_scenario_steps;
CREATE TRIGGER audit_drill_scenario_steps
  AFTER INSERT OR UPDATE OR DELETE ON drill_scenario_steps
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Deliberately NOT readable by plain `authenticated` (unlike drill_injected_events'
-- "visible while active" policy): a scenario step is a future/planned event —
-- exposing it to participants ahead of time would spoil the drill's realism.
-- Only the same admin roles that can already author manual injections
-- (mirrors drill_injected_events' own policy shape) can read/write steps.
ALTER TABLE drill_scenario_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_drill_steps_all" ON drill_scenario_steps;
CREATE POLICY "super_admin_drill_steps_all" ON drill_scenario_steps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "country_admin_drill_steps_own" ON drill_scenario_steps;
CREATE POLICY "country_admin_drill_steps_own" ON drill_scenario_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN drill_sessions ds ON ds.id = drill_scenario_steps.drill_session_id
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND p.country_code = ds.country_code
    )
  );

-- ── Auto-injection ───────────────────────────────────────────────────────────
-- SECURITY DEFINER so the pg_cron job (which runs as no interactive user) can
-- still write drill_injected_events rows despite that table's own
-- profiles-subquery RLS — same pattern as every other automated writer in
-- this project (e.g. generate-compliance-report's use of Vault-scoped
-- functions). Procedural (not a single INSERT..SELECT) so each fired step is
-- reliably linked back to the drill_injected_events row it produced.
CREATE OR REPLACE FUNCTION process_drill_scenario_steps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  step RECORD;
  new_event_id UUID;
BEGIN
  FOR step IN
    SELECT dss.id, dss.drill_session_id, ds.country_code, dss.hazard_type,
           dss.description, dss.lat, dss.lng, dss.severity, dss.created_by
    FROM drill_scenario_steps dss
    JOIN drill_sessions ds ON ds.id = dss.drill_session_id
    WHERE dss.injected_at IS NULL
      AND ds.status = 'active'
      AND ds.started_at IS NOT NULL
      AND now() >= ds.started_at + make_interval(mins => dss.delay_minutes)
    ORDER BY dss.drill_session_id, dss.step_order
  LOOP
    INSERT INTO drill_injected_events (drill_session_id, country_code, hazard_type, description, lat, lng, severity, created_by)
    VALUES (step.drill_session_id, step.country_code, step.hazard_type, step.description, step.lat, step.lng, step.severity, step.created_by)
    RETURNING id INTO new_event_id;

    UPDATE drill_scenario_steps
    SET injected_at = now(), injected_event_id = new_event_id
    WHERE id = step.id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drill-scenario-steps-1min') THEN
    PERFORM cron.unschedule('drill-scenario-steps-1min');
  END IF;

  PERFORM cron.schedule(
    'drill-scenario-steps-1min',
    '* * * * *',
    $job$SELECT process_drill_scenario_steps()$job$
  );
END;
$$;
