-- overlay_snapshots: add 'wet_bulb_temp' (spec 054 follow-up, 2026-08-06:
-- Overlay: WBT — derived from GFS Temp+RH via Stull's approximation, no
-- direct GFS field). Same shape as every prior overlay_type addition —
-- only the CHECK constraint changes.

ALTER TABLE overlay_snapshots DROP CONSTRAINT IF EXISTS overlay_snapshots_overlay_type_check;
ALTER TABLE overlay_snapshots ADD CONSTRAINT overlay_snapshots_overlay_type_check
  CHECK (overlay_type IN (
    'air_quality_pm25', 'temperature', 'relative_humidity', 'mean_sea_level_pressure',
    'cape', 'total_precipitable_water', 'total_cloud_water', 'precip_3hr', 'wet_bulb_temp'
  ));
