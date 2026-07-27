-- =====================================================
-- Shelters: confidence level.
--
-- The OSM importer's original tag scope (emergency=assembly_point /
-- social_facility=shelter / evacuation_center=yes) was deliberately narrow
-- to avoid amenity=shelter's noise (bus-stop/park weather shelters — see
-- osmSheltersFetch.ts's header comment). Live-verified 2026-07-27: of
-- Turkey's 7190 amenity=shelter elements, 439 are explicitly
-- shelter_type=public_transport, 2073 have no shelter_type tag at all (so
-- their nature is unknowable from tags alone), and the rest are split
-- across other shelter_type values — no clean tag-based filter separates
-- "genuine disaster shelter" from "ordinary shelter" within that set.
--
-- Rather than either excluding amenity=shelter entirely (today's status
-- quo — leaves provinces with real disaster shelters invisible because
-- nobody happened to tag them with the narrower emergency/social_facility
-- tags) or including it unfiltered (floods the list with bus stops), this
-- adds a confidence tier so every row carries how sure we are it's a real
-- disaster shelter, and callers (the map layer, by default) can filter to
-- only the confident ones while the full picture stays in the admin list.
--
-- 5 = manually entered by an admin (highest confidence — a human vouched
--     for it; also the default here so every pre-existing row, all of
--     which are either manual or from the narrow-tag OSM import, reads as
--     high-confidence without a backfill).
-- 4 = OSM emergency=assembly_point / social_facility=shelter /
--     evacuation_center=yes (today's only OSM import tags).
-- 3 = OSM amenity=shelter with a shelter_type tag that isn't a known-noise
--     value (ambiguous, but at least deliberately classified by a mapper).
-- 2 = OSM amenity=shelter with no shelter_type tag at all (unclassifiable).
-- 1 = OSM amenity=shelter with a known-noise shelter_type (public_transport,
--     lean_to, picnic_shelter, etc. — very likely not a disaster shelter).
-- =====================================================

ALTER TABLE shelters ADD COLUMN IF NOT EXISTS confidence_level SMALLINT NOT NULL DEFAULT 5;

ALTER TABLE shelters ADD CONSTRAINT chk_shelter_confidence_level
  CHECK (confidence_level BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS idx_shelters_confidence_level ON shelters (confidence_level);
