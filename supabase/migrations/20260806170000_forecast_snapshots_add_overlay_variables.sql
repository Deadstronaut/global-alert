-- Expand forecast_snapshots.variable to cover all 13 GFS-native
-- overlay variables (spec 055 follow-up, 2026-08-06 — user explicitly
-- requested the full GFS_OVERLAY_FIELDS set, not just wind/precip/temp).
-- Same ALTER-the-CHECK-constraint pattern as
-- 20260805150000_overlay_snapshots_add_gfs_fields.sql used for
-- overlay_snapshots.overlay_type.

ALTER TABLE forecast_snapshots DROP CONSTRAINT IF EXISTS forecast_snapshots_variable_check;

ALTER TABLE forecast_snapshots ADD CONSTRAINT forecast_snapshots_variable_check
  CHECK (variable IN (
    'wind_speed', 'precipitation', 'temperature',
    'relative_humidity', 'mean_sea_level_pressure', 'cape',
    'total_precipitable_water', 'total_cloud_water', 'dew_point',
    'wet_bulb_temp', 'wind_power_density', 'misery_index',
    'significant_wave_height', 'uv_index'
  ));
