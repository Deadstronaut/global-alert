-- =====================================================
-- Fix: same "'minimal' floor is trivially true across huge swaths of the
-- globe" bug as 20260818110000 fixed for dust_storm, now for heatwave/
-- coldwave.
--
-- Live-verified 2026-08-18: a real `docker compose run wind-importer
-- --overlay-type=temperature --once` (August cycle, real GFS data,
-- global range -64.30..44.33°C) wrote 625 heatwave rows (27°C floor —
-- ~24% of all coarse cells, i.e. "most of the tropics/subtropics in
-- Northern Hemisphere summer", not a genuine heatwave) and 309 coldwave
-- rows (0°C floor — ~12% of all cells, i.e. "ordinary winter/polar
-- climate", not a genuine cold wave). Raised both floors well above
-- ordinary seasonal extremes toward genuinely dangerous absolute
-- temperatures, informed by this run's own real max/min. Antarctica is
-- separately excluded in code (hazard_detector.py's `if lat < -60:
-- continue`) since no absolute floor alone can distinguish a real cold
-- wave from that continent's own permanently-frigid, uninhabited climate.
-- =====================================================

UPDATE hazard_thresholds SET breakpoints = '[
  {"min_value": 40, "severity": "minimal"},
  {"min_value": 43, "severity": "low"},
  {"min_value": 46, "severity": "moderate"},
  {"min_value": 49, "severity": "high"},
  {"min_value": 52, "severity": "critical"}
]'::jsonb
WHERE hazard_type_code = 'heatwave';

UPDATE hazard_thresholds SET breakpoints = '[
  {"min_value": 35, "severity": "minimal"},
  {"min_value": 42, "severity": "low"},
  {"min_value": 48, "severity": "moderate"},
  {"min_value": 55, "severity": "high"},
  {"min_value": 62, "severity": "critical"}
]'::jsonb
WHERE hazard_type_code = 'coldwave';
