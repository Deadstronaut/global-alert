-- =====================================================
-- Backfill confidence_level=4 for existing OSM-imported rows.
--
-- 20260727050000 added confidence_level with DEFAULT 5, which is correct for
-- manually-entered rows but mislabels every pre-existing OSM row (all of
-- which came from the narrow emergency=assembly_point /
-- social_facility=shelter / evacuation_center=yes tags, since amenity=shelter
-- wasn't fetched until this same change) as "Manuel Giriş" instead of
-- "Kesin". source='osm' unambiguously identifies these.
-- =====================================================

UPDATE shelters SET confidence_level = 4 WHERE source = 'osm';
