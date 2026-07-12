-- =====================================================
-- Full Polygon/PostGIS-based Geographic Targeting (spec 015/036 remaining
-- item — "tam polygon/PostGIS tabanlı coğrafi hedefleme"). Today,
-- dispatchMatching.ts's regionMatches() only compares contacts.region_code
-- and cap_drafts.region_code as plain text — an unset region always
-- matches (spec 015 FR-003), and a typo or inconsistent naming can silently
-- widen or narrow the audience with no geometric ground truth involved.
--
-- This adds an ADDITIONAL, purely narrowing layer on top of that existing
-- text match (never a replacement, same non-invasive philosophy as
-- region_code itself): optional contacts.lat/lng, plus a PostGIS
-- point-in-polygon RPC against the real administrative boundary polygons
-- already uploaded per country (country_boundaries.geojson, spec 010's
-- "sadece bölgemi göster" feature). A contact with no coordinates, or a
-- country/region with no resolvable boundary polygon, is always treated as
-- "unknown" (NULL) rather than excluded — dispatch-alert (application code,
-- not this migration) is responsible for never treating NULL as a reason to
-- drop a recipient, exactly like the FR-003 rule for a missing region_code.
-- =====================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE contacts ADD CONSTRAINT chk_contacts_lat CHECK (lat IS NULL OR lat BETWEEN -90 AND 90);
ALTER TABLE contacts ADD CONSTRAINT chk_contacts_lng CHECK (lng IS NULL OR lng BETWEEN -180 AND 180);

CREATE EXTENSION IF NOT EXISTS postgis;

-- Returns, for each requested contact, whether their (lat,lng) point falls
-- inside the named region's polygon (TRUE/FALSE), or NULL when it cannot be
-- determined (no coordinates on the contact, no country_boundaries row for
-- p_country_code, or no feature in it whose name_property matches
-- p_region_code case-insensitively). STABLE + SECURITY DEFINER so
-- dispatch-alert's service-role client can call it directly regardless of
-- who is signed in when the job is queued.
CREATE OR REPLACE FUNCTION resolve_contacts_in_region(
  p_country_code VARCHAR(2),
  p_region_code TEXT,
  p_contact_ids UUID[]
)
RETURNS TABLE(contact_id UUID, is_within BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geojson JSONB;
  v_name_property TEXT;
  v_region_geom GEOMETRY;
BEGIN
  SELECT geojson, name_property INTO v_geojson, v_name_property
  FROM country_boundaries WHERE country_code = p_country_code;

  IF v_geojson IS NOT NULL THEN
    SELECT ST_SetSRID(ST_GeomFromGeoJSON(feature->'geometry'), 4326) INTO v_region_geom
    FROM jsonb_array_elements(v_geojson->'features') AS feature
    WHERE lower(feature->'properties'->>v_name_property) = lower(p_region_code)
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT c.id,
    CASE
      WHEN c.lat IS NULL OR c.lng IS NULL THEN NULL
      WHEN v_region_geom IS NULL THEN NULL
      ELSE ST_Contains(v_region_geom, ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326))
    END
  FROM contacts c
  WHERE c.id = ANY(p_contact_ids);
END;
$$;
