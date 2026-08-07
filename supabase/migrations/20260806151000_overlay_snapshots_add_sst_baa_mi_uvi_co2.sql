-- overlay_snapshots: add SST/SSTA/BAA (Ocean), MI/UVI (Air), CO2sc (Chem)
-- — spec 054 follow-up, 2026-08-06. sea_surface_temperature/
-- sea_surface_temperature_anomaly are CMEMS-native (fetch_sst.py);
-- coral_bleaching_alert is NOAA Coral Reef Watch (fetch_baa.py);
-- misery_index is derived client-side from existing GFS Temp/RH/wind
-- (fetch_latest_misery_index_inputs_grib2); uv_index is NCEP's own UV
-- Index forecast (fetch_uvi.py); co2_surface is CAMS's separate
-- greenhouse-gas-forecasts product (fetch_overlay_cams.py). Only the
-- CHECK constraint changes — live-verified 2026-08-06 that this
-- constraint was silently rejecting every one of these overlay_type
-- values (400 on insert), even though the frontend/importer code for all
-- of them was otherwise working end to end.

ALTER TABLE overlay_snapshots DROP CONSTRAINT IF EXISTS overlay_snapshots_overlay_type_check;
ALTER TABLE overlay_snapshots ADD CONSTRAINT overlay_snapshots_overlay_type_check
  CHECK (overlay_type IN (
    'air_quality_pm25', 'temperature', 'relative_humidity', 'mean_sea_level_pressure',
    'cape', 'total_precipitable_water', 'total_cloud_water', 'precip_3hr', 'wet_bulb_temp',
    'pm1', 'pm10', 'dust_aod', 'organic_matter_aod', 'sulfate_aod',
    'co_surface', 'so2_surface', 'no2_surface', 'aurora',
    'dew_point', 'wind_power_density', 'significant_wave_height',
    'sea_surface_temperature', 'sea_surface_temperature_anomaly', 'coral_bleaching_alert',
    'misery_index', 'uv_index', 'co2_surface'
  ));
