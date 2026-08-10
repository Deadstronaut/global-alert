"""
Entrypoint for the wind/ocean-current/wave flow-texture importer, the
air-quality overlay importer, AND the multi-horizon forecast importer —
spec 053 + spec 054 + spec 055.

Usage:
    python3 main.py --layer-type=wind --once
    python3 main.py --layer-type=ocean_current --once
    python3 main.py --layer-type=wave --once
    python3 main.py --overlay-type=air_quality_pm25 --once
    python3 main.py --forecast-horizon=15d --once   # spec 055 US1 (GFS)
    python3 main.py --forecast-horizon=1mo --once   # spec 055 US2 (CFSv2)
    python3 main.py --forecast-horizon=3mo --once   # spec 055 US3 (CFSv2)
    python3 main.py --layer-type=wind          # default: loops forever,
                                                # re-running every 6h

No Deno.cron equivalent here (unlike raster-importer/cron.ts) — this is a
separate Python container (research.md §4), so scheduling is a plain
in-process loop instead, same "self-contained, no host-OS scheduler
dependency" goal as cron.ts's own header comment, just implemented in
Python since GDAL/GRIB2 needs Python here, not Deno.
"""
from __future__ import annotations

import argparse
import calendar
import datetime as dt
import os
import sys
import time
import traceback
import uuid

import requests

from fetch_aurora import fetch_latest_aurora_json
from fetch_baa import fetch_latest_baa_netcdf
from fetch_cfsv2 import fetch_cfsv2_monthly_mean_grib2
from fetch_currents import fetch_latest_currents_netcdf
from fetch_gfs import (
    FORECAST_STEP_HOURS,
    fetch_forecast_field_grib2,
    fetch_latest_cape_grib2,
    fetch_latest_cwat_grib2,
    fetch_latest_dew_point_grib2,
    fetch_latest_misery_index_inputs_grib2,
    fetch_latest_mslp_grib2,
    fetch_latest_precip_3hr_grib2,
    fetch_latest_pwat_grib2,
    fetch_latest_relative_humidity_grib2,
    fetch_latest_temperature_grib2,
    fetch_latest_wet_bulb_inputs_grib2,
    fetch_latest_wind_grib2,
)
from fetch_overlay_cams import (
    fetch_latest_co2_netcdf,
    fetch_latest_co_netcdf,
    fetch_latest_dust_aod_netcdf,
    fetch_latest_no2_netcdf,
    fetch_latest_organic_matter_aod_netcdf,
    fetch_latest_pm1_netcdf,
    fetch_latest_pm10_netcdf,
    fetch_latest_pm25_netcdf,
    fetch_latest_so2_netcdf,
    fetch_latest_sulfate_aod_netcdf,
)
from fetch_sst import fetch_latest_sst_netcdf, fetch_latest_ssta_inputs
from fetch_uvi import fetch_forecast_uvi_grib2, fetch_latest_uvi_grib2
from fetch_waves import fetch_forecast_wave_grib2, fetch_latest_wave_grib2
from flow_texture_common import FlowTexture, metadata_json
from forecast_outlook import classify_region, list_region_centroids, open_variable_grid
from forecast_texture import forecast_field_to_overlay_texture
from grib_to_texture import grib2_to_flow_texture
from netcdf_to_texture import netcdf_uv_to_flow_texture
from overlay_texture import (
    OverlayTexture,
    aurora_json_to_overlay_texture,
    grib2_cape_to_overlay_texture,
    grib2_cwat_to_overlay_texture,
    grib2_dew_point_to_overlay_texture,
    grib2_htsgw_to_overlay_texture,
    grib2_misery_index_to_overlay_texture,
    grib2_mslp_to_overlay_texture,
    grib2_precip_3hr_to_overlay_texture,
    grib2_pwat_to_overlay_texture,
    grib2_relative_humidity_to_overlay_texture,
    grib2_temperature_to_overlay_texture,
    grib2_uvi_to_overlay_texture,
    grib2_wet_bulb_to_overlay_texture,
    grib2_wpd_to_overlay_texture,
    netcdf_baa_to_overlay_texture,
    netcdf_co2_to_overlay_texture,
    netcdf_dust_aod_to_overlay_texture,
    netcdf_organic_matter_aod_to_overlay_texture,
    netcdf_pm1_to_overlay_texture,
    netcdf_pm10_to_overlay_texture,
    netcdf_co_to_overlay_texture,
    netcdf_no2_to_overlay_texture,
    netcdf_pm25_to_overlay_texture,
    netcdf_so2_to_overlay_texture,
    netcdf_sst_anomaly_to_overlay_texture,
    netcdf_sst_to_overlay_texture,
    netcdf_sulfate_aod_to_overlay_texture,
)
from wave_vector import wave_grib2_to_flow_texture

# GFS-native scalar Overlay fields (spec 054 follow-up, 2026-08-05) — each
# entry is (fetch_fn, convert_fn); dict-driven so run_once_overlay doesn't
# grow a new elif per field the way it would with the air_quality_pm25/
# temperature special-cases below.
GFS_OVERLAY_FIELDS = {
    "temperature": (fetch_latest_temperature_grib2, grib2_temperature_to_overlay_texture),
    "relative_humidity": (fetch_latest_relative_humidity_grib2, grib2_relative_humidity_to_overlay_texture),
    "mean_sea_level_pressure": (fetch_latest_mslp_grib2, grib2_mslp_to_overlay_texture),
    "cape": (fetch_latest_cape_grib2, grib2_cape_to_overlay_texture),
    "total_precipitable_water": (fetch_latest_pwat_grib2, grib2_pwat_to_overlay_texture),
    "total_cloud_water": (fetch_latest_cwat_grib2, grib2_cwat_to_overlay_texture),
    "precip_3hr": (fetch_latest_precip_3hr_grib2, grib2_precip_3hr_to_overlay_texture),
    "wet_bulb_temp": (fetch_latest_wet_bulb_inputs_grib2, grib2_wet_bulb_to_overlay_texture),
    "dew_point": (fetch_latest_dew_point_grib2, grib2_dew_point_to_overlay_texture),
    "wind_power_density": (fetch_latest_wind_grib2, grib2_wpd_to_overlay_texture),
    "significant_wave_height": (fetch_latest_wave_grib2, grib2_htsgw_to_overlay_texture),
    "misery_index": (fetch_latest_misery_index_inputs_grib2, grib2_misery_index_to_overlay_texture),
    "uv_index": (fetch_latest_uvi_grib2, grib2_uvi_to_overlay_texture),
}

# Height selector (spec 054 follow-up, 2026-08-06) — only these two
# GFS_OVERLAY_FIELDS entries have a real per-pressure-level GFS field;
# the rest (MSLP, CAPE, TPW, TCW, precip) are surface/column-integrated
# quantities with no "at 850mb" meaning, so they always run at 'sfc'.
LEVEL_AWARE_OVERLAY_FIELDS = {"temperature", "relative_humidity"}

# CAMS-native Overlay fields (spec 054 US2 + 2026-08-06 follow-up) — same
# dict-driven dispatch shape as GFS_OVERLAY_FIELDS, kept as a separate dict
# since these go through fetch_overlay_cams.py/cdsapi rather than NOMADS,
# and air_quality_pm25 (this dict's original single entry) is the name the
# frontend/DB already use, so it stays as-is rather than being renamed to
# match the newer 'pm1'/'pm10' naming.
CAMS_OVERLAY_FIELDS = {
    "air_quality_pm25": (fetch_latest_pm25_netcdf, netcdf_pm25_to_overlay_texture),
    "pm1": (fetch_latest_pm1_netcdf, netcdf_pm1_to_overlay_texture),
    "pm10": (fetch_latest_pm10_netcdf, netcdf_pm10_to_overlay_texture),
    "dust_aod": (fetch_latest_dust_aod_netcdf, netcdf_dust_aod_to_overlay_texture),
    "organic_matter_aod": (fetch_latest_organic_matter_aod_netcdf, netcdf_organic_matter_aod_to_overlay_texture),
    "sulfate_aod": (fetch_latest_sulfate_aod_netcdf, netcdf_sulfate_aod_to_overlay_texture),
    "co_surface": (fetch_latest_co_netcdf, netcdf_co_to_overlay_texture),
    "so2_surface": (fetch_latest_so2_netcdf, netcdf_so2_to_overlay_texture),
    "no2_surface": (fetch_latest_no2_netcdf, netcdf_no2_to_overlay_texture),
    "co2_surface": (fetch_latest_co2_netcdf, netcdf_co2_to_overlay_texture),
}

# Space mode (spec 054 follow-up, 2026-08-06) — a separate dict from
# GFS_OVERLAY_FIELDS/CAMS_OVERLAY_FIELDS since this comes from neither
# NOMADS nor ADS/cdsapi, just a small public NOAA SWPC JSON endpoint (no
# auth, unlike CAMS). Kept as its own dict for the same "name the actual
# source" clarity those two have, even though there's only one entry.
NOAA_OVERLAY_FIELDS = {
    "aurora": (fetch_latest_aurora_json, aurora_json_to_overlay_texture),
    "coral_bleaching_alert": (fetch_latest_baa_netcdf, netcdf_baa_to_overlay_texture),
}

# Ocean mode (spec 054 follow-up, 2026-08-06) — CMEMS-native Overlay fields,
# same dict-driven dispatch shape as the others; separate from
# CAMS_OVERLAY_FIELDS since this goes through Copernicus Marine's own
# copernicusmarine.subset() (fetch_sst.py), not ADS/cdsapi. Shares the same
# COPERNICUS_MARINE_USERNAME/PASSWORD credentials fetch_currents.py
# (Animate: Currents) already needs.
CMEMS_OVERLAY_FIELDS = {
    "sea_surface_temperature": (fetch_latest_sst_netcdf, netcdf_sst_to_overlay_texture),
    "sea_surface_temperature_anomaly": (fetch_latest_ssta_inputs, netcdf_sst_anomaly_to_overlay_texture),
}

REFRESH_INTERVAL_S = 6 * 60 * 60  # matches GFS's own 6-hourly cycle (research.md §1/spec FR-007); also used as the overlay loop's poll interval — coarser than CAMS' own ~12h cadence, but re-fetching early just re-uploads the same cycle's data, harmless

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = "flow-snapshots"
OVERLAY_STORAGE_BUCKET = "overlay-snapshots"
FORECAST_STORAGE_BUCKET = "forecast-snapshots"
SOURCE_NAME_BY_FORECAST_VARIABLE = {
    "wind_speed": "gfs", "precipitation": "gfs", "temperature": "gfs",
    "relative_humidity": "gfs", "mean_sea_level_pressure": "gfs", "cape": "gfs",
    "total_precipitable_water": "gfs", "total_cloud_water": "gfs", "dew_point": "gfs",
    "wet_bulb_temp": "gfs", "wind_power_density": "gfs", "misery_index": "gfs",
    "significant_wave_height": "wavewatch3", "uv_index": "ncep_uvi",
}
# Per-deployment enable/disable (spec 055 FR-009/FR-010, research.md §5) —
# same env_file-per-deployment mechanism every other importer already uses,
# no separate DB config table.
FORECAST_15D_ENABLED = os.environ.get("FORECAST_15D_ENABLED", "true").lower() != "false"
FORECAST_1MO_ENABLED = os.environ.get("FORECAST_1MO_ENABLED", "true").lower() != "false"
FORECAST_3MO_ENABLED = os.environ.get("FORECAST_3MO_ENABLED", "true").lower() != "false"


def _require_supabase_env() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("[wind-importer] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, cannot write results", file=sys.stderr)
        sys.exit(1)


def _upload_texture(layer_type: str, level: str, issued_at: dt.datetime, png_bytes: bytes) -> str:
    """Uploads the PNG to Supabase Storage, returns the storage path (contracts/flow-snapshot-contract.md).
    Same 'sfc' backward-compat flat-path convention as _upload_overlay_texture."""
    prefix = layer_type if level == "sfc" else f"{layer_type}/{level}"
    path = f"{prefix}/{issued_at.strftime('%Y-%m-%dT%H-%M-%SZ')}.png"
    url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}"
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "image/png",
            # Without this, retrying the same hour/day (a scheduled-loop
            # retry after a mid-run crash, or a manual re-run like this
            # feature's own live debugging session) 400s with "Duplicate" —
            # live-verified 2026-08-05 — since the path is only as unique as
            # issued_at's timestamp, not per-attempt.
            "x-upsert": "true",
        },
        data=png_bytes,
        timeout=60,
    )
    response.raise_for_status()
    return path


def _upload_overlay_texture(overlay_type: str, level: str, issued_at: dt.datetime, png_bytes: bytes) -> str:
    """Same shape as _upload_texture, targeting the overlay-snapshots bucket
    (contracts/overlay-snapshot-contract.md). 'sfc' keeps the original flat
    path (backward compatible with every overlay_type that existed before
    Height/level support); other levels get their own subfolder so they
    don't collide with the sfc snapshot's own path."""
    prefix = overlay_type if level == "sfc" else f"{overlay_type}/{level}"
    path = f"{prefix}/{issued_at.strftime('%Y-%m-%dT%H-%M-%SZ')}.png"
    url = f"{SUPABASE_URL}/storage/v1/object/{OVERLAY_STORAGE_BUCKET}/{path}"
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "image/png",
            "x-upsert": "true",
        },
        data=png_bytes,
        timeout=60,
    )
    response.raise_for_status()
    return path


def _upload_forecast_texture(variable: str, forecast_step_hours: int, issued_at: dt.datetime, png_bytes: bytes) -> str:
    """Same shape as _upload_overlay_texture, targeting the
    forecast-snapshots bucket (contracts/forecast-read-contract.md). Path
    includes forecast_step_hours (not just issued_at) since a single cycle
    writes multiple steps per variable, unlike overlay/flow snapshots'
    one-row-per-cycle shape."""
    path = f"{variable}/{issued_at.strftime('%Y-%m-%dT%H-%M-%SZ')}/f{forecast_step_hours:03d}.png"
    url = f"{SUPABASE_URL}/storage/v1/object/{FORECAST_STORAGE_BUCKET}/{path}"
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "image/png",
            "x-upsert": "true",
        },
        data=png_bytes,
        timeout=60,
    )
    response.raise_for_status()
    return path


def _forecast_model_version(issued_at: dt.datetime) -> str:
    """GFS issuance cycles run every 6h (00/06/12/18Z) — this identifies
    exactly which cycle a snapshot came from (spec 059)."""
    return f"GFS {issued_at.strftime('%Y%m%d%HZ')}"


def _forecast_confidence_score(forecast_step_hours: int) -> float:
    """Lead-time heuristic, not a model-native ensemble spread (the
    deterministic GFS run this importer consumes carries none): confidence
    falls linearly from 1.0 at issuance to 0.3 at the 15-day (360h) horizon,
    floored at 0.3 so a far-out forecast is never shown as "no confidence"
    (spec 059)."""
    horizon_hours = 360
    floor = 0.3
    fraction = min(1.0, max(0.0, forecast_step_hours / horizon_hours))
    return round(1.0 - fraction * (1.0 - floor), 3)


def _insert_forecast_snapshot_row(
    variable: str, forecast_step_hours: int, valid_at: dt.datetime, issued_at: dt.datetime,
    texture: OverlayTexture, storage_path: str,
) -> None:
    url = f"{SUPABASE_URL}/rest/v1/forecast_snapshots"
    west, south, east, north = texture.bounds
    row = {
        "id": str(uuid.uuid4()),
        "variable": variable,
        "forecast_step_hours": forecast_step_hours,
        "valid_at": valid_at.isoformat(),
        "issued_at": issued_at.isoformat(),
        "texture_storage_path": storage_path,
        "value_min": texture.value_min, "value_max": texture.value_max,
        "bounds": [west, south, east, north],
        "source_name": SOURCE_NAME_BY_FORECAST_VARIABLE[variable],
        "model_version": _forecast_model_version(issued_at),
        "confidence_score": _forecast_confidence_score(forecast_step_hours),
    }
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json=row,
        timeout=30,
    )
    response.raise_for_status()


# PostgREST bulk-insert chunk size for forecast_outlooks — a served
# deployment can have 1000+ regions (live-verified 2026-08-06: 1195 regions
# in one real deployment's country_boundaries), and inserting one row per
# HTTP request took 15+ minutes for that alone. A single request body with
# every row is simpler but risks one oversized POST; 500 rows/request keeps
# each request small while cutting the request count by ~500x.
OUTLOOK_INSERT_CHUNK_SIZE = 500


def _insert_forecast_outlook_rows(rows: list[dict]) -> None:
    """Bulk-inserts forecast_outlooks rows in chunks — see
    OUTLOOK_INSERT_CHUNK_SIZE's own comment for why this replaced a
    one-request-per-row loop."""
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/forecast_outlooks"
    for i in range(0, len(rows), OUTLOOK_INSERT_CHUNK_SIZE):
        chunk = rows[i:i + OUTLOOK_INSERT_CHUNK_SIZE]
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json=chunk,
            timeout=60,
        )
        response.raise_for_status()


def _forecast_outlook_row(
    horizon: str, variable: str, region_code: str, classification: str,
    valid_period_start: dt.date, valid_period_end: dt.date, issued_at: dt.datetime,
) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "horizon": horizon,
        "variable": variable,
        "region_code": region_code,
        "classification": classification,
        "valid_period_start": valid_period_start.isoformat(),
        "valid_period_end": valid_period_end.isoformat(),
        "issued_at": issued_at.isoformat(),
        "source_name": "NOAA CFSv2",
    }




SOURCE_NAME_BY_LAYER = {"wind": "gfs", "ocean_current": "cmems", "wave": "wavewatch3"}
SOURCE_NAME_BY_OVERLAY = {
    **{key: "gfs" for key in GFS_OVERLAY_FIELDS},
    **{key: "cams" for key in CAMS_OVERLAY_FIELDS},
    **{key: "noaa_swpc" for key in NOAA_OVERLAY_FIELDS},
    **{key: "cmems" for key in CMEMS_OVERLAY_FIELDS},
    "significant_wave_height": "wavewatch3",  # overrides the blanket "gfs" above — matches flow_snapshots' own SOURCE_NAME_BY_LAYER["wave"]
    "coral_bleaching_alert": "noaa_crw",  # overrides the blanket "noaa_swpc" above — a different NOAA division/product (Coral Reef Watch, not Space Weather Prediction Center)
}


def _insert_flow_snapshot_row(
    layer_type: str, level: str, issued_at: dt.datetime, texture: FlowTexture, storage_path: str,
) -> None:
    url = f"{SUPABASE_URL}/rest/v1/flow_snapshots"
    west, south, east, north = texture.bounds
    row = {
        "id": str(uuid.uuid4()),
        "layer_type": layer_type,
        "level": level,
        "issued_at": issued_at.isoformat(),
        "texture_storage_path": storage_path,
        "u_min": texture.u_min, "u_max": texture.u_max,
        "v_min": texture.v_min, "v_max": texture.v_max,
        "bounds": [west, south, east, north],
        "source_name": SOURCE_NAME_BY_LAYER[layer_type],
    }
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json=row,
        timeout=30,
    )
    response.raise_for_status()


def _insert_overlay_snapshot_row(
    overlay_type: str, level: str, issued_at: dt.datetime, texture: OverlayTexture, storage_path: str,
) -> None:
    url = f"{SUPABASE_URL}/rest/v1/overlay_snapshots"
    west, south, east, north = texture.bounds
    row = {
        "id": str(uuid.uuid4()),
        "overlay_type": overlay_type,
        "level": level,
        "issued_at": issued_at.isoformat(),
        "texture_storage_path": storage_path,
        "value_min": texture.value_min, "value_max": texture.value_max,
        "bounds": [west, south, east, north],
        "source_name": SOURCE_NAME_BY_OVERLAY[overlay_type],
    }
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json=row,
        timeout=30,
    )
    response.raise_for_status()


def run_once(layer_type: str, level: str = "sfc") -> None:
    """
    Fetch -> convert -> upload -> insert. Deliberately does NOT touch any
    prior row on failure at any step (an uncaught exception here just
    exits non-zero; the previously-inserted flow_snapshots row, if any,
    stays exactly as it was) — contracts/flow-snapshot-contract.md's
    "fail loudly, keep prior data" rule, same convention as
    writeExposureDataset.ts's supersede-only-after-success behavior.

    `level` (Height selector, 2026-08-06) only applies to 'wind' — GFS
    has UGRD/VGRD at the same seven pressure levels Temp/RH already use;
    ocean_current/wave have no per-pressure-level concept and always run
    at 'sfc' regardless of what's passed.
    """
    _require_supabase_env()

    if layer_type == "wind":
        raw_bytes, issued_at = fetch_latest_wind_grib2(level=level)
        texture = grib2_to_flow_texture(raw_bytes)
    elif layer_type == "ocean_current":
        level = "sfc"
        raw_bytes, issued_at = fetch_latest_currents_netcdf()
        texture = netcdf_uv_to_flow_texture(raw_bytes)
    elif layer_type == "wave":
        level = "sfc"
        raw_bytes, issued_at = fetch_latest_wave_grib2()
        texture = wave_grib2_to_flow_texture(raw_bytes)
    else:
        raise ValueError(f"Unknown layer_type {layer_type!r} (expected 'wind', 'ocean_current', or 'wave')")

    print(f"[wind-importer] Fetched {layer_type}@{level} data issued at {issued_at.isoformat()}")
    print(
        f"[wind-importer] Converted to texture: "
        f"u=[{texture.u_min:.2f},{texture.u_max:.2f}] v=[{texture.v_min:.2f},{texture.v_max:.2f}] "
        f"({len(texture.png_bytes)} bytes PNG)"
    )
    storage_path = _upload_texture(layer_type, level, issued_at, texture.png_bytes)
    print(f"[wind-importer] Uploaded texture to {STORAGE_BUCKET}/{storage_path}")
    _insert_flow_snapshot_row(layer_type, level, issued_at, texture, storage_path)
    print(f"[wind-importer] Inserted flow_snapshots row for {layer_type}@{level} @ {issued_at.isoformat()}")
    # metadata_json(texture) is available for local debugging but is not
    # itself persisted — the flow_snapshots row's own columns are the
    # source of truth the frontend reads (contracts/flow-snapshot-contract.md).
    _ = metadata_json(texture)


def run_once_overlay(overlay_type: str, level: str = "sfc") -> None:
    """Fetch -> color -> upload -> insert, for the Overlay path — same
    fail-loudly-keep-prior-data rule as run_once() (contracts/
    overlay-snapshot-contract.md Producer). `level` is only meaningful for
    LEVEL_AWARE_OVERLAY_FIELDS entries (Temp/RH) — every other field
    ignores it and always runs at 'sfc' regardless of what's passed."""
    _require_supabase_env()

    fields = {**GFS_OVERLAY_FIELDS, **CAMS_OVERLAY_FIELDS, **NOAA_OVERLAY_FIELDS, **CMEMS_OVERLAY_FIELDS}
    if overlay_type in fields:
        fetch_fn, convert_fn = fields[overlay_type]
        if overlay_type in LEVEL_AWARE_OVERLAY_FIELDS:
            raw_bytes, issued_at = fetch_fn(level=level)
            texture = convert_fn(raw_bytes, level=level)
        else:
            level = "sfc"
            raw_bytes, issued_at = fetch_fn()
            texture = convert_fn(raw_bytes)
    else:
        expected = ", ".join(repr(k) for k in fields)
        raise ValueError(f"Unknown overlay_type {overlay_type!r} (expected one of: {expected})")

    print(f"[wind-importer] Fetched {overlay_type}@{level} data issued at {issued_at.isoformat()}")
    print(
        f"[wind-importer] Colored to overlay texture: "
        f"value=[{texture.value_min:.2f},{texture.value_max:.2f}] ({len(texture.png_bytes)} bytes PNG)"
    )
    storage_path = _upload_overlay_texture(overlay_type, level, issued_at, texture.png_bytes)
    print(f"[wind-importer] Uploaded overlay texture to {OVERLAY_STORAGE_BUCKET}/{storage_path}")
    _insert_overlay_snapshot_row(overlay_type, level, issued_at, texture, storage_path)
    print(f"[wind-importer] Inserted overlay_snapshots row for {overlay_type}@{level} @ {issued_at.isoformat()}")


# Full GFS_OVERLAY_FIELDS expansion (spec 055 follow-up, 2026-08-06 — user
# explicitly requested all 13 GFS-native overlay variables, not just the
# original wind/precip/temp trio). significant_wave_height and uv_index
# come from different sources than the rest (WAVEWATCH III, NCEP UVI —
# same as their nowcast counterparts in GFS_OVERLAY_FIELDS above), which
# is why FORECAST_FETCHERS below dispatches per-variable instead of every
# variable sharing fetch_forecast_field_grib2's single signature.
FORECAST_VARIABLES = (
    "wind_speed", "precipitation", "temperature",
    "relative_humidity", "mean_sea_level_pressure", "cape",
    "total_precipitable_water", "total_cloud_water", "dew_point",
    "wet_bulb_temp", "wind_power_density", "misery_index",
    "significant_wave_height", "uv_index",
)
# variable -> callable(forecast_step_hours) -> (grib2_bytes, issued_at).
# Every GFS-native field shares fetch_forecast_field_grib2's signature
# (already takes the variable name itself); wave/UV each need their own
# fetcher's own signature wrapped to match.
FORECAST_FETCHERS = {
    **{v: (lambda step, v=v: fetch_forecast_field_grib2(v, step)) for v in SOURCE_NAME_BY_FORECAST_VARIABLE if SOURCE_NAME_BY_FORECAST_VARIABLE[v] == "gfs"},
    "significant_wave_height": fetch_forecast_wave_grib2,
    "uv_index": fetch_forecast_uvi_grib2,
}
# forecast_outlooks only covers precipitation/temperature (data-model.md's
# ForecastOutlook CHECK constraint) — wind has no below/near/above-normal
# classification concept the way precip/temp do, so US2/US3 skip it.
OUTLOOK_VARIABLES = ("precipitation", "temperature")


def _run_once_forecast_15d() -> None:
    """15-day deterministic horizon (US1) — GFS/WAVEWATCH3/NCEP-UVI forecast
    steps, one texture per (variable, forecast_step_hours). Unlike
    run_once()/run_once_overlay()'s single-field fail-loudly rule, a
    failure on ONE (variable, step) pair here is logged and skipped, not
    fatal for the whole run — uv_index legitimately has no data beyond
    120h (fetch_uvi.py's own MAX_FORECAST_HOUR) and that must not abort
    the other 13 variables' otherwise-successful fetches."""
    if not FORECAST_15D_ENABLED:
        print("[wind-importer] FORECAST_15D_ENABLED=false for this deployment, skipping (spec 055 FR-009/FR-010)")
        return

    inserted = 0
    for variable in FORECAST_VARIABLES:
        fetch_fn = FORECAST_FETCHERS[variable]
        for forecast_step_hours in FORECAST_STEP_HOURS:
            try:
                raw_bytes, issued_at = fetch_fn(forecast_step_hours)
                texture = forecast_field_to_overlay_texture(variable, raw_bytes, forecast_step_hours)
            except Exception as e:  # noqa: BLE001 - one variable/step's failure (e.g. uv_index beyond its 120h limit) must not abort the other 13 variables
                print(f"[wind-importer] Skipping forecast {variable}@f{forecast_step_hours:03d}: {e}", file=sys.stderr)
                continue
            valid_at = issued_at + dt.timedelta(hours=forecast_step_hours)
            print(
                f"[wind-importer] Fetched forecast {variable}@f{forecast_step_hours:03d} "
                f"(cycle {issued_at.isoformat()}, valid {valid_at.isoformat()})"
            )
            storage_path = _upload_forecast_texture(variable, forecast_step_hours, issued_at, texture.png_bytes)
            _insert_forecast_snapshot_row(variable, forecast_step_hours, valid_at, issued_at, texture, storage_path)
            inserted += 1
            print(f"[wind-importer] Inserted forecast_snapshots row for {variable}@f{forecast_step_hours:03d}")
    print(f"[wind-importer] 15d forecast run complete: {inserted}/{len(FORECAST_VARIABLES) * len(FORECAST_STEP_HOURS)} (variable, step) rows inserted")


def _run_once_forecast_outlook(horizon: str, lead_months: int, enabled: bool) -> None:
    """
    1-month (US2) or 3-month (US3) probabilistic horizon — one CFSv2
    monthly-mean fetch, classified per (variable, region) via
    forecast_outlook.py. Deliberately a SINGLE target calendar month at
    `lead_months` out (e.g. 3mo = 'the month 3 months from now'), not a
    3-month running average — a documented simplification (fetch_cfsv2.py's
    own header), kept consistent between US2/US3 rather than giving 3mo a
    different averaging shape than 1mo for no functional reason.

    A region whose classification fails (e.g. GDAL can't resample this
    particular grid) is logged and skipped, not fatal for the whole run —
    unlike the 15d/single-texture path above, a single bad region here
    should not block every other region's row from being written.
    """
    if not enabled:
        print(f"[wind-importer] FORECAST_{horizon.upper()}_ENABLED=false for this deployment, skipping (spec 055 FR-009/FR-010)")
        return

    raw_bytes, issued_at, (valid_year, valid_month) = fetch_cfsv2_monthly_mean_grib2(lead_months)
    valid_period_start = dt.date(valid_year, valid_month, 1)
    valid_period_end = dt.date(valid_year, valid_month, calendar.monthrange(valid_year, valid_month)[1])
    print(
        f"[wind-importer] Fetched CFSv2 monthly-mean data for {horizon} "
        f"(cycle {issued_at.isoformat()}, valid {valid_period_start.isoformat()}..{valid_period_end.isoformat()})"
    )

    regions = list_region_centroids()
    print(f"[wind-importer] Classifying {len(regions)} region(s) x {len(OUTLOOK_VARIABLES)} variable(s) for {horizon}")
    rows: list[dict] = []
    for variable in OUTLOOK_VARIABLES:
        # Decode this variable's band ONCE (open_variable_grid's own
        # docstring — live-verified 2026-08-06: reopening the ~24MB/524-band
        # file per region made a 1195-region deployment take many minutes)
        # and reuse it for every region below.
        grid = open_variable_grid(raw_bytes, variable)
        for region in regions:
            try:
                classification = classify_region(grid, variable, region)
            except Exception as e:  # noqa: BLE001 - one bad region must not abort every other region's row
                print(f"[wind-importer] Skipping {region.country_code}/{region.region_code}/{variable}: {e}", file=sys.stderr)
                continue
            rows.append(_forecast_outlook_row(
                horizon, variable, region.region_code, classification,
                valid_period_start, valid_period_end, issued_at,
            ))
    _insert_forecast_outlook_rows(rows)
    print(f"[wind-importer] Inserted {len(rows)} forecast_outlooks rows for {horizon}")


def run_once_forecast(horizon: str) -> None:
    """Fetch -> classify/texture-ize -> upload -> insert, dispatching to
    the right horizon's implementation — spec 055 US1/US2/US3."""
    _require_supabase_env()
    if horizon == "15d":
        _run_once_forecast_15d()
    elif horizon == "1mo":
        _run_once_forecast_outlook("1mo", lead_months=1, enabled=FORECAST_1MO_ENABLED)
    elif horizon == "3mo":
        _run_once_forecast_outlook("3mo", lead_months=3, enabled=FORECAST_3MO_ENABLED)
    else:
        raise ValueError(f"Unknown forecast horizon {horizon!r} (expected '15d', '1mo', or '3mo')")


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--layer-type", choices=["wind", "ocean_current", "wave"])
    mode.add_argument("--overlay-type", choices=[*GFS_OVERLAY_FIELDS, *CAMS_OVERLAY_FIELDS, *NOAA_OVERLAY_FIELDS, *CMEMS_OVERLAY_FIELDS])
    mode.add_argument("--forecast-horizon", choices=["15d", "1mo", "3mo"], help="spec 055 — 15-day (GFS), 1-month/3-month (CFSv2) outlook")
    parser.add_argument("--once", action="store_true", help="Run a single import and exit, instead of looping every 6h")
    parser.add_argument(
        "--level", default="sfc",
        help="Single pressure level for one-off runs (sfc or e.g. 850) — only affects level-aware "
        "layer/overlay types (--layer-type=wind, --overlay-type=temperature/relative_humidity); ignored otherwise",
    )
    parser.add_argument(
        "--levels", default=None,
        help="Comma-separated levels to cycle through every scheduled run (e.g. 1000,850,700,500,250,70,10) "
        "— same level-aware-types-only scope as --level",
    )
    args = parser.parse_args()

    def run():
        if args.forecast_horizon:
            run_once_forecast(args.forecast_horizon)
        elif args.layer_type and args.levels:
            for level in args.levels.split(","):
                run_once(args.layer_type, level=level.strip())
        elif args.layer_type:
            run_once(args.layer_type, level=args.level)
        elif args.levels:
            for level in args.levels.split(","):
                run_once_overlay(args.overlay_type, level=level.strip())
        else:
            run_once_overlay(args.overlay_type, level=args.level)

    label = args.layer_type or args.overlay_type or args.forecast_horizon

    if args.once:
        run()
        return

    print(f"[wind-importer] Starting scheduled loop for {label}, every {REFRESH_INTERVAL_S // 3600}h")
    while True:
        try:
            run()
        except Exception as e:  # noqa: BLE001 - matches cron.ts's own "log loudly, don't crash the scheduled process" convention
            # Was `print(f"...{e}")` — some exceptions (SystemExit, some
            # third-party library internals) stringify to an EMPTY message,
            # which made real failures (live-debugged 2026-08-06:
            # copernicusmarine.subset() failing with no visible reason)
            # show up in logs as the useless "Run FAILED: " with nothing
            # after the colon. Full traceback always has something to go on.
            print(f"[wind-importer] Run FAILED: {e}", file=sys.stderr)
            traceback.print_exc()
        time.sleep(REFRESH_INTERVAL_S)


if __name__ == "__main__":
    main()
