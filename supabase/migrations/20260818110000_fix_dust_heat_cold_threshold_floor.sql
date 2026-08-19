-- =====================================================
-- Fix: dust_storm/heatwave/coldwave 'minimal' breakpoints were set at the
-- field's theoretical floor (aod550>=0.0, cold_index_c>=0 i.e. temp<=0°C),
-- not a genuinely elevated value.
--
-- Live-verified 2026-08-18: the very first real `docker compose run
-- wind-importer --overlay-type=dust_aod --once` against real CAMS data
-- wrote 2592 `disaster` rows — one for EVERY coarse detection cell on
-- Earth, because aod550 is never negative, so "minimal >= 0.0" is always
-- true everywhere, every run. Point-source hazards (earthquake magnitude,
-- wildfire FRP) can safely use a "minimal >= 0" floor because the very
-- existence of a detected event there is already the rare/interesting
-- thing; a CONTINUOUS global field (dust AOD, temperature) has no such
-- natural sparsity — every one of hazard_detector.py's coarse cells always
-- has SOME nonzero value, so the write-filter threshold itself must be set
-- above normal background levels, not at the physical minimum. Same
-- "only write cells that clear a REAL threshold, not everywhere" lesson
-- demSlopeAggregate.ts's landslide-susceptibility importer already
-- established (rasterSourceConfig.ts's LANDSLIDE_SLOPE_THRESHOLD_DEG=20,
-- not 0) — this migration applies it to these two new hazard types too.
--
-- New floors, informed by this run's own real data (today's global max dust
-- AOD was 1.14) and standard cold/heat-wave literature:
--   dust_storm 'minimal' 0.0 -> 0.4 (typical background AOD is ~0.05-0.2;
--     0.4 is a genuinely elevated, dust-event-scale reading).
--   coldwave 'minimal' 0 -> 25 (temp<=0°C is simply "winter" across huge
--     swaths of the globe at any given hour; temp<=-25°C is a real,
--     comparatively rare severe-cold event).
--   heatwave's 27°C floor is untouched — global surface temp is NOT
--   trivially >=27°C everywhere the way AOD is trivially >=0 or winter
--   land is trivially <=0°C, so it wasn't demonstrated to have the same bug
--   (to be confirmed against a live --overlay-type=temperature run; may
--   still need its own follow-up if it turns out too noisy in practice).
-- =====================================================

UPDATE hazard_thresholds SET breakpoints = '[
  {"min_value": 0.4, "severity": "minimal"},
  {"min_value": 0.6, "severity": "low"},
  {"min_value": 0.8, "severity": "moderate"},
  {"min_value": 1.0, "severity": "high"},
  {"min_value": 1.3, "severity": "critical"}
]'::jsonb
WHERE hazard_type_code = 'dust_storm';

UPDATE hazard_thresholds SET breakpoints = '[
  {"min_value": 25, "severity": "minimal"},
  {"min_value": 32, "severity": "low"},
  {"min_value": 40, "severity": "moderate"},
  {"min_value": 48, "severity": "high"},
  {"min_value": 55, "severity": "critical"}
]'::jsonb
WHERE hazard_type_code = 'coldwave';
