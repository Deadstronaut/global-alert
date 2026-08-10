-- =====================================================
-- CAP Inbound Ingest (spec 065)
--
-- MHEWS gap (Warning Dissemination pillar): CAP handling (spec 006/014) is
-- outbound-only — docs/mhewsprd.md explicitly scopes out "inbound CAP hub
-- ingest". This adds a receiving endpoint so a country's own official CAP
-- source (an NMHS, a national CAP hub, a neighboring system) can push
-- alerts INTO this platform. Deliberately requires human review before any
-- inbound alert becomes a real cap_drafts row — an external system pushing
-- straight to `broadcast` would bypass this platform's own four-eyes
-- approval workflow (guard_cap_draft_transition), which is not acceptable
-- for a life-safety channel. No external account is needed FROM us (we are
-- the receiver here); the country configures its own ingest token for
-- whichever external system it trusts to push to it.
-- =====================================================

-- gen_random_bytes() (used below for ingest_token) lives in pgcrypto, not
-- Postgres core (unlike gen_random_uuid(), which is core since PG13) —
-- enable it defensively in case this project hasn't already.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cap_inbound_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  VARCHAR(2) NOT NULL,
  name          TEXT NOT NULL,
  ingest_token  TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cap_inbound_sources_token ON cap_inbound_sources (ingest_token) WHERE is_active;

ALTER TABLE cap_inbound_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_cap_inbound_sources_all" ON cap_inbound_sources;
CREATE POLICY "super_admin_cap_inbound_sources_all" ON cap_inbound_sources
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_cap_inbound_sources_own" ON cap_inbound_sources;
CREATE POLICY "country_admin_cap_inbound_sources_own" ON cap_inbound_sources
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP TRIGGER IF EXISTS audit_cap_inbound_sources ON cap_inbound_sources;
CREATE TRIGGER audit_cap_inbound_sources
  AFTER INSERT OR UPDATE OR DELETE ON cap_inbound_sources
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

CREATE TABLE IF NOT EXISTS cap_inbound_alerts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             UUID NOT NULL REFERENCES cap_inbound_sources(id) ON DELETE CASCADE,
  country_code          VARCHAR(2) NOT NULL,
  raw_payload           TEXT NOT NULL,
  parsed_identifier     TEXT,
  parsed_event          TEXT,
  parsed_headline       TEXT,
  parsed_description    TEXT,
  parsed_severity       TEXT,
  parsed_area_desc      TEXT,
  parsed_effective_at   TIMESTAMPTZ,
  parsed_expires_at     TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewed', 'promoted', 'rejected')),
  promoted_cap_draft_id UUID REFERENCES cap_drafts(id) ON DELETE SET NULL,
  reviewed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cap_inbound_alerts_country ON cap_inbound_alerts (country_code, received_at DESC);

ALTER TABLE cap_inbound_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_cap_inbound_alerts_all" ON cap_inbound_alerts;
CREATE POLICY "super_admin_cap_inbound_alerts_all" ON cap_inbound_alerts
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_cap_inbound_alerts_own" ON cap_inbound_alerts;
CREATE POLICY "country_admin_cap_inbound_alerts_own" ON cap_inbound_alerts
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP TRIGGER IF EXISTS audit_cap_inbound_alerts ON cap_inbound_alerts;
CREATE TRIGGER audit_cap_inbound_alerts
  AFTER INSERT OR UPDATE OR DELETE ON cap_inbound_alerts
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── promote_cap_inbound_alert: create a real (draft-status) cap_drafts row
-- from a reviewed inbound alert — never auto-broadcasts (FR-005). The
-- normal four-eyes approval/broadcast workflow (guard_cap_draft_transition,
-- spec 006/014) still governs everything from here on, unchanged.
CREATE OR REPLACE FUNCTION promote_cap_inbound_alert(p_inbound_id UUID)
RETURNS cap_drafts
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inbound cap_inbound_alerts%ROWTYPE;
  v_result cap_drafts;
BEGIN
  SELECT * INTO v_inbound FROM cap_inbound_alerts WHERE id = p_inbound_id;
  IF v_inbound.id IS NULL THEN
    RAISE EXCEPTION 'inbound alert % not found', p_inbound_id;
  END IF;

  IF NOT (
    current_profile_role() = 'super_admin'
    OR (current_profile_role() = 'country_admin' AND v_inbound.country_code = current_profile_country_code())
  ) THEN
    RAISE EXCEPTION 'not authorized to promote inbound alerts for country %', v_inbound.country_code;
  END IF;

  IF v_inbound.status = 'promoted' THEN
    RAISE EXCEPTION 'inbound alert % was already promoted', p_inbound_id;
  END IF;

  INSERT INTO cap_drafts (
    hazard_type, severity, title, description, area_desc, country_code,
    effective_at, expires_at, source_event_id, created_by
  ) VALUES (
    COALESCE(v_inbound.parsed_event, 'disaster'),
    COALESCE(v_inbound.parsed_severity, 'moderate'),
    COALESCE(v_inbound.parsed_headline, '(inbound alert, needs review)'),
    v_inbound.parsed_description,
    v_inbound.parsed_area_desc,
    v_inbound.country_code,
    COALESCE(v_inbound.parsed_effective_at, NOW()),
    COALESCE(v_inbound.parsed_expires_at, NOW() + INTERVAL '24 hours'),
    'cap_inbound:' || v_inbound.id::TEXT,
    auth.uid()
  ) RETURNING * INTO v_result;

  UPDATE cap_inbound_alerts
  SET status = 'promoted', promoted_cap_draft_id = v_result.id, reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE id = p_inbound_id;

  RETURN v_result;
END;
$$;
