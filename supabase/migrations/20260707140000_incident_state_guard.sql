-- =====================================================
-- Incident Lifecycle — DB-enforced state machine + AAR requirement
-- Covers: spec 011 FR-001, FR-002 (MHEWS-FC-STM-04)
-- Previously the state machine (open→in_progress→monitoring→closed→archived)
-- was only enforced client-side in IncidentsView.vue; this trigger makes it
-- authoritative regardless of which client performs the update, and adds
-- the "AAR required to close a monitored incident" rule.
-- =====================================================

DROP TRIGGER IF EXISTS guard_incidents_transition ON incidents;
DROP FUNCTION IF EXISTS guard_incident_transition();

CREATE FUNCTION guard_incident_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'invalid_incident_transition: % is already the current status', NEW.status;
  END IF;

  IF NOT (
    (OLD.status = 'open'        AND NEW.status = 'in_progress') OR
    (OLD.status = 'in_progress' AND NEW.status IN ('monitoring','closed')) OR
    (OLD.status = 'monitoring'  AND NEW.status = 'closed') OR
    (OLD.status = 'closed'      AND NEW.status = 'archived')
  ) THEN
    RAISE EXCEPTION 'invalid_incident_transition: % -> % is not allowed', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'monitoring' AND NEW.status = 'closed'
     AND (NEW.post_event_notes IS NULL OR btrim(NEW.post_event_notes) = '') THEN
    RAISE EXCEPTION 'aar_required: after-action notes are required to close a monitored incident';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_incidents_transition
  BEFORE UPDATE OF status ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION guard_incident_transition();
