-- overlay_snapshots: add 'temperature' as a second overlay_type (spec 054
-- follow-up, 2026-08-05: Overlay: Temp — GFS 2m air temperature, colored
-- with the reference tool's own extracted color ramp, wind-importer's
-- grib2_temperature_to_overlay_texture). Same shape as the earlier
-- flow_snapshots layer_type addition — only the CHECK constraint changes.

ALTER TABLE overlay_snapshots DROP CONSTRAINT IF EXISTS overlay_snapshots_overlay_type_check;
ALTER TABLE overlay_snapshots ADD CONSTRAINT overlay_snapshots_overlay_type_check
  CHECK (overlay_type IN ('air_quality_pm25', 'temperature'));
