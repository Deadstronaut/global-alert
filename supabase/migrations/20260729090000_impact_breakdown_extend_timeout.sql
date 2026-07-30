-- =====================================================
-- compute_sector_breakdown / compute_boundary_breakdown /
-- compute_data_completeness / get_critical_infrastructure_features —
-- extend statement_timeout
--
-- Same root cause as 20260728093000's compute_zonal_stats fix: ImpactPanel.vue
-- calls loadCriticalInfrastructure + loadBreakdown + loadCompleteness
-- concurrently (Promise.all) right after compute_zonal_stats succeeds, and
-- none of these four functions ever got the timeout override that one did.
-- Live-verified: selecting "Sektöre Göre"/"İdari Sınıra Göre" against a large
-- dataset (Bina Yoğunluğu, 128,323 rows) hangs and the panel shows "Analiz
-- tamamlanamadı" — the request never completes within the default
-- statement_timeout under that concurrent load. Same fix pattern as before:
-- raise these functions' own timeouts rather than changing the query shape.
-- =====================================================

ALTER FUNCTION compute_sector_breakdown(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  SET statement_timeout = '45s';

ALTER FUNCTION compute_boundary_breakdown(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  SET statement_timeout = '45s';

ALTER FUNCTION compute_data_completeness(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  SET statement_timeout = '45s';

ALTER FUNCTION get_critical_infrastructure_features(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  SET statement_timeout = '45s';
