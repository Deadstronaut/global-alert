-- =====================================================
-- Drill Mode — CAP Exercise Isolation
-- Covers: spec 013 FR-001..FR-003 (MHEWS-FR-0210, MHEWS-FR-0245, MHEWS-FR-0278)
-- drill_sessions + its admin CRUD already existed (20260605120200_drill_mode.sql)
-- but nothing connected a drill to the CAP alerts authored during it, and
-- nothing prevented those alerts from triggering real dispatch on broadcast.
-- This migration closes that safety-critical gap.
-- =====================================================

-- (1) New column: fixed at insert time, never re-evaluated afterward (FR-002).
ALTER TABLE cap_drafts ADD COLUMN IF NOT EXISTS is_exercise BOOLEAN NOT NULL DEFAULT false;

-- (2) Auto-flag new CAP drafts as exercise whenever an active drill exists
-- for their country (FR-001). Must be defined before (3) touches is_exercise.
DROP TRIGGER IF EXISTS trg_set_cap_exercise_flag ON cap_drafts;
DROP FUNCTION IF EXISTS set_cap_exercise_flag();

CREATE FUNCTION set_cap_exercise_flag()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_exercise := EXISTS (
    SELECT 1 FROM drill_sessions ds
    WHERE ds.status = 'active' AND ds.country_code = NEW.country_code
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_cap_exercise_flag
  BEFORE INSERT ON cap_drafts
  FOR EACH ROW EXECUTE FUNCTION set_cap_exercise_flag();

-- (3) Suppress real dispatch entirely for exercise alerts (FR-003/FR-004).
-- Re-declares the existing trg_notify_dispatch_on_broadcast trigger (spec 009)
-- with one added WHEN condition; notify_dispatch_on_broadcast()'s function
-- body itself is unchanged. Depends on is_exercise existing (see (1)/(2)).
DROP TRIGGER IF EXISTS trg_notify_dispatch_on_broadcast ON cap_drafts;
CREATE TRIGGER trg_notify_dispatch_on_broadcast
  AFTER UPDATE OF status ON cap_drafts
  FOR EACH ROW
  WHEN (NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status AND NOT NEW.is_exercise)
  EXECUTE FUNCTION notify_dispatch_on_broadcast();
