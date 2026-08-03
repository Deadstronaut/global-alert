-- =====================================================
-- Sandboxed AI Assistance — suggestions (spec 051)
-- Generic, capability-agnostic record of every AI-generated draft
-- (translation, summary, photo category suggestion, anomaly flag) and its
-- human resolution. No AI output here ever has effect on its own — a row
-- only becomes consequential once a human approves/overrides it, and even
-- then only within the four sandboxed capabilities (never risk scoring,
-- cascading-risk rules, or CAP authoring/dispatch).
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability      TEXT NOT NULL,
  country_code    VARCHAR(2) NOT NULL,
  source_table    TEXT NOT NULL,
  source_id       UUID NOT NULL,
  target_locale   TEXT,
  input_excerpt   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_output       JSONB,
  status          TEXT NOT NULL DEFAULT 'pending',
  final_output    JSONB,
  requested_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_suggestion_capability CHECK (capability IN ('translate', 'summarize', 'classify_photo', 'anomaly_flag')),
  CONSTRAINT chk_ai_suggestion_status CHECK (status IN ('pending', 'approved', 'approved_edited', 'rejected', 'ignored', 'failed')),
  -- requested_by may only be NULL for capabilities that are triggered
  -- automatically rather than by a specific logged-in human: classify_photo
  -- can be triggered by an unauthenticated citizen's report submission
  -- (research.md Decision 3), and anomaly_flag is always a pg_cron batch
  -- job, never a user action (research.md Decision 2).
  CONSTRAINT chk_ai_suggestion_requested_by CHECK (requested_by IS NOT NULL OR capability IN ('classify_photo', 'anomaly_flag'))
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_country_capability_status
  ON ai_suggestions (country_code, capability, status);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_source
  ON ai_suggestions (source_table, source_id);

-- ── State machine guard: pending -> one terminal state, no further moves ───
DROP TRIGGER IF EXISTS guard_ai_suggestions_transition ON ai_suggestions;
DROP FUNCTION IF EXISTS guard_ai_suggestion_transition();

CREATE FUNCTION guard_ai_suggestion_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'invalid_ai_suggestion_transition: % is already the current status', NEW.status;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_ai_suggestion_transition: % is terminal, cannot move to %', OLD.status, NEW.status;
  END IF;

  IF NEW.status NOT IN ('approved', 'approved_edited', 'rejected', 'ignored', 'failed') THEN
    RAISE EXCEPTION 'invalid_ai_suggestion_transition: pending -> % is not allowed', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_ai_suggestions_transition
  BEFORE UPDATE OF status ON ai_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION guard_ai_suggestion_transition();

-- ── audit trigger — reuse existing function, no duplication ────────────────
DROP TRIGGER IF EXISTS audit_ai_suggestions ON ai_suggestions;
CREATE TRIGGER audit_ai_suggestions
  AFTER INSERT OR UPDATE OR DELETE ON ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;

-- No INSERT policy for any client role — every ai_suggestions row is written
-- by an Edge Function's service-role client (ai-translate, ai-summarize,
-- ai-classify-photo, ai-anomaly-check), which performs the underlying
-- source-entity permission check itself before writing (research.md
-- Decision 6). This mirrors community_reports' service-role-only write path.

CREATE POLICY super_admin_ai_suggestions_all ON ai_suggestions
  FOR ALL USING (current_profile_role() = 'super_admin');

CREATE POLICY country_admin_ai_suggestions_own ON ai_suggestions
  FOR SELECT USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

CREATE POLICY country_admin_ai_suggestions_resolve ON ai_suggestions
  FOR UPDATE USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );
