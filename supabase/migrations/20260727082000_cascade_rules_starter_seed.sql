-- =====================================================
-- Cascading Hazard Risk — starter/example rule seed (spec 048 follow-up)
--
-- cascade_rules started out completely empty per country, so
-- evaluate_cascade_rules() always reported "no secondary risk triggered"
-- even for a real M7.8 event — not a bug, just nothing configured yet
-- (live-testing finding, user-reported). There is no single authoritative,
-- downloadable UN/international threshold table for these conditions; the
-- values below are literature-grounded starting points (USGS earthquake
-- secondary-hazard / liquefaction-susceptibility research, WHO post-disaster
-- complex-emergency disease-risk literature), explicitly meant to be edited
-- by a country_admin via the Risk & Scenario Modeling admin tab, not treated
-- as authoritative thresholds. Only uses exposure sources already imported
-- for all three served countries (hydrorivers, worldpop).
--
-- Idempotent: skips a (country_code, trigger_hazard_type,
-- secondary_risk_category) combination that already exists, so re-running
-- this migration never creates duplicates or clobbers admin edits.
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
  ('tr', 'earthquake', 5.0, 'hydrorivers', 10.0, 'flood',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km yakınındaki nehir/su hattında sıvılaşma veya set/baraj hasarına bağlı taşkın riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('mg', 'earthquake', 5.0, 'hydrorivers', 10.0, 'flood',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km yakınındaki nehir/su hattında sıvılaşma veya set/baraj hasarına bağlı taşkın riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('my', 'earthquake', 5.0, 'hydrorivers', 10.0, 'flood',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km yakınındaki nehir/su hattında sıvılaşma veya set/baraj hasarına bağlı taşkın riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('tr', 'earthquake', 6.5, 'worldpop', 15.0, 'epidemic',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km içindeki yüksek nüfus yoğunluğu nedeniyle yıkım sonrası su/hijyen kaynaklı salgın hastalık riskini artırabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('mg', 'earthquake', 6.5, 'worldpop', 15.0, 'epidemic',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km içindeki yüksek nüfus yoğunluğu nedeniyle yıkım sonrası su/hijyen kaynaklı salgın hastalık riskini artırabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('my', 'earthquake', 6.5, 'worldpop', 15.0, 'epidemic',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km içindeki yüksek nüfus yoğunluğu nedeniyle yıkım sonrası su/hijyen kaynaklı salgın hastalık riskini artırabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.')
) AS v(country_code, trigger_hazard_type, min_magnitude, proximity_exposure_source_name, proximity_distance_km, secondary_risk_category, recommendation_template)
WHERE NOT EXISTS (
  SELECT 1 FROM cascade_rules cr
  WHERE cr.country_code = v.country_code
    AND cr.trigger_hazard_type = v.trigger_hazard_type
    AND cr.secondary_risk_category = v.secondary_risk_category
);
