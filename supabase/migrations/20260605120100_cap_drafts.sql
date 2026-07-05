-- =====================================================
-- CAP Alert Authoring
-- Covers: FR-0098, FR-0027, FC-STM-01, FR-0019, FR-0015,
--         FR-0028, FR-0030, FR-0016, FR-0202, FR-0239, FR-0317
-- State machine: DRAFT → PENDING_APPROVAL → APPROVED → BROADCAST
--                                          → REJECTED
--                             → CANCELLED
--                             → EXPIRED (time-based)
-- =====================================================

-- extract()/date_trunc() over timestamptz are marked STABLE (not IMMUTABLE) in
-- Postgres's catalog as a blanket rule covering all timezone-dependent fields,
-- even though forcing UTC here makes the result depend only on the input value.
-- Wrapping in our own IMMUTABLE function is a truthful label, not a workaround.
CREATE OR REPLACE FUNCTION generate_cap_dedup_hash(h_type text, sev text, a_desc text, eff_at timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(h_type || sev || COALESCE(a_desc,'') || date_trunc('hour', eff_at AT TIME ZONE 'UTC')::text);
$$;

CREATE TABLE IF NOT EXISTS cap_drafts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core CAP fields (FR-0015)
  hazard_type     TEXT        NOT NULL,   -- earthquake, wildfire, flood, ...
  severity        TEXT        NOT NULL CHECK (severity IN ('critical','high','moderate','low','minimal')),
  certainty       TEXT        NOT NULL DEFAULT 'likely' CHECK (certainty IN ('observed','likely','possible','unlikely','unknown')),
  urgency         TEXT        NOT NULL DEFAULT 'immediate' CHECK (urgency IN ('immediate','expected','future','past','unknown')),

  title           TEXT        NOT NULL,
  description     TEXT,
  instructions    TEXT,                   -- protective actions

  -- Geographic targeting
  area_desc       TEXT,                   -- human-readable area name
  area_polygon    TEXT,                   -- WKT polygon (future PostGIS upgrade)
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  radius_km       DOUBLE PRECISION,

  -- Validity window
  effective_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

  -- Multi-lingual templates (FR-0202, FR-0239)
  lang            TEXT        NOT NULL DEFAULT 'en',
  translations    JSONB       DEFAULT '{}',   -- { "tr": { "title": "...", "description": "..." } }

  -- State machine (FC-STM-01)
  status          TEXT        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','pending_approval','approved','broadcast',
                                    'rejected','cancelled','expired','false_alarm','all_clear')),

  -- Traceability (FR-0028) — superseded_by links alerts in chain
  supersedes_id   UUID REFERENCES cap_drafts(id) ON DELETE SET NULL,

  -- Duplicate prevention (FR-0016)
  dedup_hash      TEXT GENERATED ALWAYS AS (
    generate_cap_dedup_hash(hazard_type, severity, area_desc, effective_at)
  ) STORED,

  -- Audit fields
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  country_code    VARCHAR(2),
  org_id          UUID REFERENCES organizations(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cap_status        ON cap_drafts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cap_country       ON cap_drafts (country_code, status);
CREATE INDEX IF NOT EXISTS idx_cap_hazard        ON cap_drafts (hazard_type, status);
CREATE INDEX IF NOT EXISTS idx_cap_dedup         ON cap_drafts (dedup_hash);
CREATE INDEX IF NOT EXISTS idx_cap_created_by    ON cap_drafts (created_by);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS cap_drafts_updated_at ON cap_drafts;
CREATE TRIGGER cap_drafts_updated_at
  BEFORE UPDATE ON cap_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE cap_drafts ENABLE ROW LEVEL SECURITY;

-- Super admin: her şeyi görür
DROP POLICY IF EXISTS "super_admin_cap_all" ON cap_drafts;
CREATE POLICY "super_admin_cap_all" ON cap_drafts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Country admin/org_admin: kendi ülkesini görür
DROP POLICY IF EXISTS "country_admin_cap_own" ON cap_drafts;
CREATE POLICY "country_admin_cap_own" ON cap_drafts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('country_admin','org_admin')
        AND p.country_code = cap_drafts.country_code
    )
  );

-- Viewer: broadcast + approved olanları okuyabilir
DROP POLICY IF EXISTS "viewer_cap_read_public" ON cap_drafts;
CREATE POLICY "viewer_cap_read_public" ON cap_drafts
  FOR SELECT USING (status IN ('broadcast','approved'));

-- Audit trigger
DROP TRIGGER IF EXISTS audit_cap_drafts ON cap_drafts;
CREATE TRIGGER audit_cap_drafts
  AFTER INSERT OR UPDATE OR DELETE ON cap_drafts
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
