-- =====================================================
-- CAP v1.2 Envelope & Export (spec 014)
-- Covers: constitution Principle III (CAP v1.2 Compliance)
-- cap_drafts already has a full four-eyes authoring/approval/broadcast
-- state machine (spec 006) but no CAP envelope fields and no export
-- capability existed anywhere — a confirmed constitution violation.
-- This migration adds the envelope fields; src/lib/capExport.js (application
-- code, not this migration) adds the actual XML/JSON generation.
-- =====================================================

-- (1) sender: auto-populated at insert time (FR-001), never manually entered.
ALTER TABLE cap_drafts ADD COLUMN IF NOT EXISTS sender TEXT NOT NULL DEFAULT '';

-- (2) broadcast_at: the authoritative "was this alert ever actually broadcast?"
-- signal. status alone cannot answer this, since the existing transition graph
-- allows 'cancelled' to be reached directly from draft/pending_approval/approved
-- without ever passing through 'broadcast' (analysis finding C1).
ALTER TABLE cap_drafts ADD COLUMN IF NOT EXISTS broadcast_at TIMESTAMPTZ;

-- (3) Auto-set sender. Must run before (4)/(5) touch these columns.
DROP TRIGGER IF EXISTS trg_set_cap_sender ON cap_drafts;
DROP FUNCTION IF EXISTS set_cap_sender();

CREATE FUNCTION set_cap_sender()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  org_name TEXT;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    SELECT name INTO org_name FROM organizations WHERE id = NEW.org_id;
  END IF;
  NEW.sender := COALESCE(org_name, 'GEWS') || '@' || lower(COALESCE(NEW.country_code, 'global')) || '.gews.local';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_cap_sender
  BEFORE INSERT ON cap_drafts
  FOR EACH ROW EXECUTE FUNCTION set_cap_sender();

-- (4)/(5) Extend the existing guard_cap_draft_transition() (spec 006):
--   - completeness gate before pending_approval now also requires sender
--   - broadcast_at is set once, the first time status becomes 'broadcast'
CREATE OR REPLACE FUNCTION guard_cap_draft_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  content_changed BOOLEAN;
BEGIN
  -- 1. Transition validity (only when status is actually changing)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'            AND NEW.status IN ('pending_approval','cancelled')) OR
      (OLD.status = 'pending_approval' AND NEW.status IN ('approved','rejected','cancelled')) OR
      (OLD.status = 'approved'         AND NEW.status IN ('broadcast','cancelled')) OR
      (OLD.status = 'broadcast'        AND NEW.status IN ('false_alarm','all_clear','expired','cancelled')) OR
      (OLD.status = 'rejected'         AND NEW.status = 'draft')
    ) THEN
      RAISE EXCEPTION 'invalid_transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- 2. Four-eyes: approving/rejecting out of pending_approval must not be the
  --    draft's own author/last editor.
  IF OLD.status = 'pending_approval' AND NEW.status IN ('approved','rejected') THEN
    IF auth.uid() = OLD.created_by OR auth.uid() = OLD.last_edited_by THEN
      RAISE EXCEPTION 'four_eyes_violation: cannot approve/reject your own draft';
    END IF;
  END IF;

  -- 3. Broadcast immutability: once broadcast, CAP content fields are frozen
  --    regardless of what NEW.status is (a cancel is still allowed to change
  --    status, just not content).
  IF OLD.status = 'broadcast' THEN
    content_changed := (
      NEW.hazard_type   IS DISTINCT FROM OLD.hazard_type   OR
      NEW.severity      IS DISTINCT FROM OLD.severity      OR
      NEW.certainty     IS DISTINCT FROM OLD.certainty     OR
      NEW.urgency       IS DISTINCT FROM OLD.urgency       OR
      NEW.title         IS DISTINCT FROM OLD.title         OR
      NEW.description   IS DISTINCT FROM OLD.description   OR
      NEW.instructions  IS DISTINCT FROM OLD.instructions  OR
      NEW.area_desc     IS DISTINCT FROM OLD.area_desc     OR
      NEW.area_polygon  IS DISTINCT FROM OLD.area_polygon  OR
      NEW.lat           IS DISTINCT FROM OLD.lat           OR
      NEW.lng           IS DISTINCT FROM OLD.lng           OR
      NEW.radius_km     IS DISTINCT FROM OLD.radius_km     OR
      NEW.effective_at  IS DISTINCT FROM OLD.effective_at  OR
      NEW.expires_at    IS DISTINCT FROM OLD.expires_at    OR
      NEW.lang          IS DISTINCT FROM OLD.lang          OR
      NEW.translations  IS DISTINCT FROM OLD.translations
    );
    IF content_changed THEN
      RAISE EXCEPTION 'broadcast_immutable: cannot modify CAP content after broadcast';
    END IF;
  END IF;

  -- 4. Reason required on reject/cancel
  IF NEW.status = 'rejected' AND (NEW.rejection_reason IS NULL OR btrim(NEW.rejection_reason) = '') THEN
    RAISE EXCEPTION 'reason_required: rejection_reason is required when rejecting a draft';
  END IF;
  IF NEW.status = 'cancelled' AND (NEW.cancellation_reason IS NULL OR btrim(NEW.cancellation_reason) = '') THEN
    RAISE EXCEPTION 'reason_required: cancellation_reason is required when cancelling a draft';
  END IF;

  -- 5. Completeness gate before entering pending_approval (spec 014: + sender)
  IF NEW.status = 'pending_approval' THEN
    IF btrim(COALESCE(NEW.title,'')) = '' OR btrim(COALESCE(NEW.description,'')) = '' OR
       btrim(COALESCE(NEW.instructions,'')) = '' OR btrim(COALESCE(NEW.area_desc,'')) = '' OR
       btrim(COALESCE(NEW.severity,'')) = '' OR btrim(COALESCE(NEW.certainty,'')) = '' OR
       btrim(COALESCE(NEW.urgency,'')) = '' OR btrim(COALESCE(NEW.hazard_type,'')) = '' OR
       btrim(COALESCE(NEW.sender,'')) = ''
    THEN
      RAISE EXCEPTION 'incomplete_draft: title, description, instructions, area_desc, severity, certainty, urgency, hazard_type, sender are all required before submitting for approval';
    END IF;
  END IF;

  -- 6. broadcast_at: set once, the first time status becomes 'broadcast'
  --    (spec 014 FR-004 support — status alone cannot tell whether a later
  --    'cancelled' draft ever actually passed through broadcast).
  IF NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status AND OLD.broadcast_at IS NULL THEN
    NEW.broadcast_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;
