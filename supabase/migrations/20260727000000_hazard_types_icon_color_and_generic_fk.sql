-- =====================================================
-- Self-serve hazard type onboarding, Faz 1 — foundational schema changes.
--
-- Context: adding a genuinely new hazard type (e.g. "landslide") today
-- requires a developer to touch 7 separate hardcoded spots, one of them a
-- migration widening a CHECK constraint. This migration removes that one
-- (CHECK -> FK against hazard_types, so a taxonomy INSERT is enough forever
-- after), adds icon/color metadata so the frontend can render new types
-- without a hardcoded per-type map, and wires up the previously-inert
-- `disaster` generic bucket table (view + index it never got).
-- =====================================================

-- (0) log_table_change() (20260726100000_audit_log_changed_by.sql) assumed
-- every audited table has a literal `id` column (`NEW.id::text`) — true for
-- every other audited table, but hazard_types' primary key is `code`, not
-- `id`. Live-verified while attempting this migration: any INSERT/UPDATE/
-- DELETE against hazard_types has been failing with "record NEW has no
-- field id" (SQLSTATE 42703) since the audit_hazard_types trigger was
-- attached in 20260707130000_hazard_taxonomy.sql — meaning the Hazard
-- Taksonomisi admin panel's create/edit has likely never actually worked
-- live. Fix: extract record_id via jsonb key lookup (->>'id') instead of a
-- direct column reference — returns NULL instead of erroring when the key
-- doesn't exist, and falls back to `code` for tables like hazard_types.
CREATE OR REPLACE FUNCTION log_table_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec_id := COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'code');
    INSERT INTO public.audit_log (action, table_name, record_id, old_data, changed_by)
    VALUES ('DELETE', TG_TABLE_NAME, rec_id, to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSE
    rec_id := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'code');
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.audit_log (action, table_name, record_id, new_data, changed_by)
      VALUES ('INSERT', TG_TABLE_NAME, rec_id, to_jsonb(NEW), auth.uid());
    ELSIF TG_OP = 'UPDATE' THEN
      INSERT INTO public.audit_log (action, table_name, record_id, old_data, new_data, changed_by)
      VALUES ('UPDATE', TG_TABLE_NAME, rec_id, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

-- (a) icon/color columns on hazard_types, backfilled for existing rows.
-- Icons for earthquake/wildfire/flood/drought/food_security match the
-- values already hardcoded in src/services/adapters/DisasterEvent.js
-- (zero visual regression); tsunami/cyclone/volcano/epidemic previously had
-- NO icon anywhere (silently fell back to a generic warning triangle) —
-- this migration is what gives them a real one for the first time, matching
-- SidebarPanel.vue's disasterTypes list.
ALTER TABLE hazard_types ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE hazard_types ADD COLUMN IF NOT EXISTS color TEXT;

UPDATE hazard_types SET icon = CASE code
  WHEN 'earthquake' THEN '⛰️'
  WHEN 'wildfire' THEN '🔥'
  WHEN 'flood' THEN '🌊'
  WHEN 'drought' THEN '🔴'
  WHEN 'food_security' THEN '🌾'
  WHEN 'tsunami' THEN '🌊🌊'
  WHEN 'cyclone' THEN '🌀'
  WHEN 'volcano' THEN '🌋'
  WHEN 'epidemic' THEN '🦠'
  ELSE '📊'
END
WHERE icon IS NULL;

UPDATE hazard_types SET color = CASE category
  WHEN 'geo' THEN '#a8a29e'
  WHEN 'meteo' THEN '#f59e0b'
  WHEN 'hydro' THEN '#38bdf8'
  WHEN 'bio' THEN '#22c55e'
  ELSE '#94a3b8'
END
WHERE color IS NULL;

-- (b) Seed the one hazard_types row missing relative to the current
-- data_sources_hazard_type_check / rejected_payloads_hazard_type_check
-- allow-lists (verified live: 16 of 17 already exist as hazard_types rows,
-- 'multi_hazard' — used by the two GDACS data_sources rows — does not).
INSERT INTO hazard_types (code, display_name, category, description, icon)
VALUES (
  'multi_hazard',
  'Multi-Hazard (Aggregator)',
  'tech',
  'System label for aggregator sources that report multiple hazard types (e.g. GDACS) — not a real taxonomy entry, exists to satisfy data_sources.hazard_type''s FK integrity.',
  '🌐'
)
ON CONFLICT (code) DO NOTHING;

-- CHECK -> FK: any hazard_type value is now legal for data_sources the
-- moment it exists as a hazard_types row — no migration needed per new type.
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources
  ADD CONSTRAINT data_sources_hazard_type_fkey FOREIGN KEY (hazard_type) REFERENCES hazard_types(code);

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads
  ADD CONSTRAINT rejected_payloads_hazard_type_fkey FOREIGN KEY (hazard_type) REFERENCES hazard_types(code);

-- (c) disaster_view — same filter/sort pattern as the other 9 hazard _view's
-- (supabase/migrations/20260422_views.sql), including country_code (added
-- to those views' source tables later, in 20260603120100_country_code.sql).
-- disaster's live column set was confirmed via PostgREST introspection
-- (its own CREATE TABLE predates the tracked migration history).
DROP VIEW IF EXISTS disaster_view;
CREATE VIEW disaster_view AS
SELECT id, type, lat, lng, severity, magnitude, depth,
       title, description, time, source, source_url, extra, received_at, h3_id, country_code
FROM disaster
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

GRANT SELECT ON disaster_view TO anon, authenticated;

-- (d) disaster never got the country_code index every other hazard table
-- received in 20260603120100_country_code.sql — matters more now that it's
-- about to become the highest-cardinality, most heterogeneous table.
CREATE INDEX IF NOT EXISTS idx_disaster_country ON disaster (country_code, time DESC);

-- (e) Drives "Kaynak Ekle"'s hazard_type dropdown without a hardcoded
-- SOURCE_SUPPORTED_HAZARDS allow-list in SourceFormModal.vue. Defaults to
-- true so any newly admin-created hazard type is automatically sourceable;
-- only system-cron-managed exposure datasets and the synthetic
-- 'multi_hazard' aggregator label are excluded (same business rule the old
-- hardcoded allow-list encoded).
ALTER TABLE hazard_types ADD COLUMN IF NOT EXISTS supports_custom_source BOOLEAN NOT NULL DEFAULT true;

UPDATE hazard_types SET supports_custom_source = false
WHERE code IN (
  'rivers', 'basins', 'population_raster', 'buildings', 'drought_index',
  'soil_moisture_anomaly', 'vegetation_anomaly', 'multi_hazard'
);
