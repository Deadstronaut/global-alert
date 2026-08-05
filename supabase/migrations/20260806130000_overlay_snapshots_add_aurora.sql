-- overlay_snapshots: add 'aurora' (spec 054 follow-up, 2026-08-06: Space
-- mode's Overlay: Aurora — NOAA SWPC's public OVATION Prime JSON feed,
-- no auth needed, unlike CAMS). Only the CHECK constraint changes.

ALTER TABLE overlay_snapshots DROP CONSTRAINT IF EXISTS overlay_snapshots_overlay_type_check;
ALTER TABLE overlay_snapshots ADD CONSTRAINT overlay_snapshots_overlay_type_check
  CHECK (overlay_type IN (
    'air_quality_pm25', 'temperature', 'relative_humidity', 'mean_sea_level_pressure',
    'cape', 'total_precipitable_water', 'total_cloud_water', 'precip_3hr', 'wet_bulb_temp',
    'pm1', 'pm10', 'dust_aod', 'organic_matter_aod', 'sulfate_aod',
    'co_surface', 'so2_surface', 'no2_surface', 'aurora'
  ));
