-- =====================================================
-- HYBAS (hydrobasins) + OSM buildings — starter cascade rules (spec 048
-- follow-up, 2026-08-20 — "bunları da eklememiz lazım, yarısı öyle almış
-- yarısı öbür türlü kalmış"). evaluate_cascade_rules() already works for ANY
-- exposure_datasets.source_name via real-geometry ST_Distance proximity
-- (20260727070000_cascading_hazard_risk.sql) — hydrorivers/worldpop/dem_slope
-- already have starter rules (20260727082000/20260728090000), hydrobasins and
-- osm-buildings did not, despite both already being imported exposure
-- sources (raster-importer/import-hydrobasins.ts, import-osm-buildings.ts).
-- No new mechanism needed, just the missing seed rows — same
-- literature-grounded-starting-point, admin-editable framing as the earlier
-- seeds, not an authoritative threshold.
--
-- Distinct secondary_risk_category per rule ('dam_or_basin_flood',
-- 'structural_collapse') — the idempotency guard below is keyed on
-- (country_code, trigger_hazard_type, secondary_risk_category), not on
-- proximity_exposure_source_name, so reusing hydrorivers' existing 'flood'
-- category here would have silently no-opped this insert instead of adding
-- a second, source-distinct rule.
--
-- hydrobasins: M5.0/10km, mirrors hydrorivers' flood rule (both are
-- water-system proximity checks — a large basin/watershed's dam or
-- reservoir infrastructure failing under shaking has a similar reach to
-- river-adjacent liquefaction).
-- osm-buildings: M6.0/5km, mirrors dem_slope's landslide rule — structural
-- collapse from shaking is a localized effect around the epicenter, not a
-- basin-wide one.
-- Idempotent: skips a (country_code, trigger_hazard_type,
-- secondary_risk_category) combination that already exists.
-- =====================================================

INSERT INTO cascade_rules (
  country_code, trigger_hazard_type, min_magnitude,
  proximity_exposure_source_name, proximity_distance_km,
  secondary_risk_category, recommendation_template, is_active
)
SELECT v.country_code, v.trigger_hazard_type, v.min_magnitude,
       v.proximity_exposure_source_name, v.proximity_distance_km,
       v.secondary_risk_category, v.recommendation_template, true
FROM (VALUES
  ('tr', 'earthquake', 5.0, 'hydrobasins', 10.0, 'dam_or_basin_flood',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km yakınındaki havza/su toplama alanında baraj veya rezervuar altyapısına bağlı taşkın riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('mg', 'earthquake', 5.0, 'hydrobasins', 10.0, 'dam_or_basin_flood',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km yakınındaki havza/su toplama alanında baraj veya rezervuar altyapısına bağlı taşkın riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('my', 'earthquake', 5.0, 'hydrobasins', 10.0, 'dam_or_basin_flood',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km yakınındaki havza/su toplama alanında baraj veya rezervuar altyapısına bağlı taşkın riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('tr', 'earthquake', 6.0, 'osm-buildings', 5.0, 'structural_collapse',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km içindeki yoğun bina/kritik altyapı kümesinde yapısal çökme riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('mg', 'earthquake', 6.0, 'osm-buildings', 5.0, 'structural_collapse',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km içindeki yoğun bina/kritik altyapı kümesinde yapısal çökme riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('my', 'earthquake', 6.0, 'osm-buildings', 5.0, 'structural_collapse',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km içindeki yoğun bina/kritik altyapı kümesinde yapısal çökme riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.')
) AS v(country_code, trigger_hazard_type, min_magnitude, proximity_exposure_source_name, proximity_distance_km, secondary_risk_category, recommendation_template)
WHERE NOT EXISTS (
  SELECT 1 FROM cascade_rules cr
  WHERE cr.country_code = v.country_code
    AND cr.trigger_hazard_type = v.trigger_hazard_type
    AND cr.secondary_risk_category = v.secondary_risk_category
);
