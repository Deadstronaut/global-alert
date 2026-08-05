-- overlay_snapshots: add Particulates mode's remaining Overlay fields
-- (spec 054 follow-up, 2026-08-06: PM1, PM10, dust/organic-matter/
-- sulfate aerosol optical depth — all CAMS-sourced, same shape as the
-- existing air_quality_pm25 entry). Only the CHECK constraint changes.

ALTER TABLE overlay_snapshots DROP CONSTRAINT IF EXISTS overlay_snapshots_overlay_type_check;
ALTER TABLE overlay_snapshots ADD CONSTRAINT overlay_snapshots_overlay_type_check
  CHECK (overlay_type IN (
    'air_quality_pm25', 'temperature', 'relative_humidity', 'mean_sea_level_pressure',
    'cape', 'total_precipitable_water', 'total_cloud_water', 'precip_3hr', 'wet_bulb_temp',
    'pm1', 'pm10', 'dust_aod', 'organic_matter_aod', 'sulfate_aod'
  ));
