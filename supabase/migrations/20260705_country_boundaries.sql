-- =====================================================
-- Admin-uploadable region/province boundary data (GeoJSON), replacing the
-- need to manually source a file per country. Powers the same "sadece
-- bölgemi göster" map filter and the create-user region dropdown as the
-- bundled src/data/boundaries/*.json files, but user-uploadable without a
-- frontend redeploy.
-- =====================================================

CREATE TABLE IF NOT EXISTS country_boundaries (
  country_code   VARCHAR(2) PRIMARY KEY,
  name_property  TEXT        NOT NULL DEFAULT 'name', -- which GeoJSON properties.* key holds the region name
  geojson        JSONB       NOT NULL,                 -- a FeatureCollection of Polygon/MultiPolygon features
  uploaded_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS country_boundaries_updated_at ON country_boundaries;
CREATE TRIGGER country_boundaries_updated_at
  BEFORE UPDATE ON country_boundaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE country_boundaries ENABLE ROW LEVEL SECURITY;

-- Read: super_admin sees all; anyone else only their own country's boundary
-- (needed for the "sadece bölgemi göster" filter + create-user region dropdown).
CREATE POLICY "read_own_country_boundary" ON country_boundaries
  FOR SELECT USING (
    current_profile_role() = 'super_admin'
    OR country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );

-- Write: super_admin any country; country_admin only their own.
CREATE POLICY "super_admin_write_boundary" ON country_boundaries
  FOR INSERT WITH CHECK (current_profile_role() = 'super_admin');

CREATE POLICY "country_admin_write_own_boundary" ON country_boundaries
  FOR INSERT WITH CHECK (
    current_profile_role() = 'country_admin'
    AND country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "super_admin_update_boundary" ON country_boundaries
  FOR UPDATE USING (current_profile_role() = 'super_admin');

CREATE POLICY "country_admin_update_own_boundary" ON country_boundaries
  FOR UPDATE USING (
    current_profile_role() = 'country_admin'
    AND country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );

-- Delete restricted to super_admin (avoid an accidental wipe locking a
-- country_admin out of their own region feature).
CREATE POLICY "super_admin_delete_boundary" ON country_boundaries
  FOR DELETE USING (current_profile_role() = 'super_admin');

-- Audit trail, same pattern as data_sources/profiles/organizations.
DROP TRIGGER IF EXISTS audit_country_boundaries ON country_boundaries;
CREATE TRIGGER audit_country_boundaries
  AFTER INSERT OR UPDATE OR DELETE ON country_boundaries
  FOR EACH ROW EXECUTE FUNCTION log_table_change();
