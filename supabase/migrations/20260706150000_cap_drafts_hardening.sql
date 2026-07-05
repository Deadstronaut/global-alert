-- =====================================================
-- CAP Alert Authoring hardening (spec 006)
--
-- Existing cap_drafts table/RLS/audit trigger (20260605120100_cap_drafts.sql)
-- already covers basic drafting/approval/broadcast. This migration is purely
-- additive: new columns, a four-eyes + transition-guard trigger, and a
-- narrowed viewer visibility policy. No existing column/status value is
-- renamed or dropped (data-model.md — unknown whether the table already
-- holds production rows, so treated as potentially live).
-- =====================================================

-- ── Additive columns ─────────────────────────────────────────────────────────
ALTER TABLE cap_drafts ADD COLUMN IF NOT EXISTS source_event_id TEXT;
ALTER TABLE cap_drafts ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE cap_drafts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE cap_drafts ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- ── guard_cap_draft_transition: four-eyes + transition-validity + immutability
--    + reason-required + completeness gate, all in one BEFORE UPDATE trigger
--    (research.md §1-§3, §6) ────────────────────────────────────────────────
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

  -- 5. Completeness gate before entering pending_approval
  IF NEW.status = 'pending_approval' THEN
    IF btrim(COALESCE(NEW.title,'')) = '' OR btrim(COALESCE(NEW.description,'')) = '' OR
       btrim(COALESCE(NEW.instructions,'')) = '' OR btrim(COALESCE(NEW.area_desc,'')) = '' OR
       btrim(COALESCE(NEW.severity,'')) = '' OR btrim(COALESCE(NEW.certainty,'')) = '' OR
       btrim(COALESCE(NEW.urgency,'')) = '' OR btrim(COALESCE(NEW.hazard_type,'')) = ''
    THEN
      RAISE EXCEPTION 'incomplete_draft: title, description, instructions, area_desc, severity, certainty, urgency, hazard_type are all required before submitting for approval';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_cap_draft_transition ON cap_drafts;
CREATE TRIGGER guard_cap_draft_transition
  BEFORE UPDATE ON cap_drafts
  FOR EACH ROW EXECUTE FUNCTION guard_cap_draft_transition();

-- ── Narrow viewer visibility: broadcast (+ its terminal follow-ons) only,
--    not 'approved' (spec 006 clarification session 2026-07-06) ────────────
DROP POLICY IF EXISTS "viewer_cap_read_public" ON cap_drafts;
CREATE POLICY "viewer_cap_read_public" ON cap_drafts
  FOR SELECT USING (status IN ('broadcast','false_alarm','all_clear','expired'));
