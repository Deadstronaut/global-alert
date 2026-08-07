"""
Converts one 15-day-horizon forecast-step GRIB2 fetch (fetch_gfs.py's
fetch_forecast_field_grib2) into a pre-colored PNG texture — spec 055 US1.

Deliberately thin: reuses overlay_texture.py's existing per-variable
conversion functions (grib2_temperature_to_overlay_texture,
grib2_wind_speed_to_overlay_texture) rather than duplicating GDAL/colorize
logic, matching tasks.md T008's "import and call, don't copy-paste"
instruction. Precipitation is the one variable that needs a small wrapper
here (not just a direct call) — see forecast_precipitation_to_overlay_texture's
own docstring for why.
"""
from __future__ import annotations

from overlay_texture import (
    OverlayTexture,
    PRECIP_3HR_RAMP,
    grib2_cape_to_overlay_texture,
    grib2_cwat_to_overlay_texture,
    grib2_dew_point_to_overlay_texture,
    grib2_htsgw_to_overlay_texture,
    grib2_misery_index_to_overlay_texture,
    grib2_mslp_to_overlay_texture,
    grib2_pwat_to_overlay_texture,
    grib2_relative_humidity_to_overlay_texture,
    grib2_scalar_to_overlay_texture,
    grib2_temperature_to_overlay_texture,
    grib2_uvi_to_overlay_texture,
    grib2_wet_bulb_to_overlay_texture,
    grib2_wind_speed_to_overlay_texture,
    grib2_wpd_to_overlay_texture,
)

# GFS's pgrb2 output bundles TWO precipitation accumulation bands at every
# forecast step: a "since forecast start" cumulative total whose element
# name changes with the step itself (APCP24 at f024, APCP360 at f360, ...
# unusable as a fixed lookup key) and a rolling 'APCP06' (6h-since-previous-
# step) band, which is the only element name that stays constant across
# ALL of fetch_gfs.py's FORECAST_STEP_HOURS — live-verified 2026-08-06 by
# fetching all eight real steps and listing their GRIB_ELEMENT bands. An
# earlier version of this function assumed a clean 24h-window band existed
# at every step (it does not, beyond GFS's own f240 output-resolution
# switchover — see fetch_gfs.py's fetch_latest_precip_3hr_grib2 docstring
# for that same switchover in the nowcast path), so this uses APCP06
# uniformly instead: "rain in the 6h before this forecast step", not a
# full day's total.
PRECIP_6HR_FORECAST_DOMAIN_MM = (0.0, 80.0)  # wider than overlay_texture.py's own 3h-window PRECIP_3HR_DOMAIN_MM (0-50mm)


def forecast_precipitation_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS 6h accumulated precipitation (APCP06) -> the Forecast panel's
    precipitation variable — see PRECIP_6HR_FORECAST_DOMAIN_MM's own
    comment for why this element (not a per-step-varying 24h/loop total)
    was chosen."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "APCP06", PRECIP_3HR_RAMP, PRECIP_6HR_FORECAST_DOMAIN_MM)


# Dispatch table mirroring main.py's GFS_OVERLAY_FIELDS dict-driven shape —
# variable name -> conversion function, reusing overlay_texture.py's
# existing per-field converters directly (spec 055 follow-up, 2026-08-06:
# expanded from the original 3 variables to all of GFS_OVERLAY_FIELDS).
# Every one of these ALREADY handles an arbitrary GRIB2 byte payload for
# its field regardless of which forecast_hour it came from (they read a
# fixed GRIB_ELEMENT/level, not something that varies by step) — only
# precipitation needed the wrapper above, for the reasons in its own
# docstring.
_SIMPLE_FORECAST_CONVERTERS = {
    "wind_speed": grib2_wind_speed_to_overlay_texture,
    "temperature": grib2_temperature_to_overlay_texture,
    "relative_humidity": grib2_relative_humidity_to_overlay_texture,
    "mean_sea_level_pressure": grib2_mslp_to_overlay_texture,
    "cape": grib2_cape_to_overlay_texture,
    "total_precipitable_water": grib2_pwat_to_overlay_texture,
    "total_cloud_water": grib2_cwat_to_overlay_texture,
    "dew_point": grib2_dew_point_to_overlay_texture,
    "wet_bulb_temp": grib2_wet_bulb_to_overlay_texture,
    "wind_power_density": grib2_wpd_to_overlay_texture,
    "misery_index": grib2_misery_index_to_overlay_texture,
    "significant_wave_height": grib2_htsgw_to_overlay_texture,
    "uv_index": grib2_uvi_to_overlay_texture,
}


def forecast_field_to_overlay_texture(variable: str, grib2_bytes: bytes, forecast_step_hours: int) -> OverlayTexture:
    if variable == "precipitation":
        return forecast_precipitation_to_overlay_texture(grib2_bytes)
    if variable in _SIMPLE_FORECAST_CONVERTERS:
        return _SIMPLE_FORECAST_CONVERTERS[variable](grib2_bytes)
    expected = ", ".join(repr(k) for k in (*_SIMPLE_FORECAST_CONVERTERS, "precipitation"))
    raise ValueError(f"Unknown forecast variable {variable!r} (expected one of: {expected})")
