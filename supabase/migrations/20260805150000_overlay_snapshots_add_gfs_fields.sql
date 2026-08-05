-- overlay_snapshots: add 6 more GFS-native Overlay fields (spec 054
-- follow-up, 2026-08-05: Air mode's "easy" batch — RH, MSLP, CAPE, TPW,
-- TCW, 3HPA precip). Same shape as the earlier 'temperature' addition —
-- only the CHECK constraint changes.

ALTER TABLE overlay_snapshots DROP CONSTRAINT IF EXISTS overlay_snapshots_overlay_type_check;
ALTER TABLE overlay_snapshots ADD CONSTRAINT overlay_snapshots_overlay_type_check
  CHECK (overlay_type IN (
    'air_quality_pm25', 'temperature', 'relative_humidity', 'mean_sea_level_pressure',
    'cape', 'total_precipitable_water', 'total_cloud_water', 'precip_3hr'
  ));
