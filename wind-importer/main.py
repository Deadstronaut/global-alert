"""
Entrypoint for the wind/ocean-current/wave flow-texture importer AND the
air-quality overlay importer — spec 053 + spec 054.

Usage:
    python3 main.py --layer-type=wind --once
    python3 main.py --layer-type=ocean_current --once
    python3 main.py --layer-type=wave --once
    python3 main.py --overlay-type=air_quality_pm25 --once
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
import datetime as dt
import os
import sys
import time
import uuid

import requests

from fetch_currents import fetch_latest_currents_netcdf
from fetch_gfs import (
    fetch_latest_cape_grib2,
    fetch_latest_cwat_grib2,
    fetch_latest_mslp_grib2,
    fetch_latest_precip_3hr_grib2,
    fetch_latest_pwat_grib2,
    fetch_latest_relative_humidity_grib2,
    fetch_latest_temperature_grib2,
    fetch_latest_wind_grib2,
)
from fetch_overlay_cams import fetch_latest_pm25_netcdf
from fetch_waves import fetch_latest_wave_grib2
from flow_texture_common import FlowTexture, metadata_json
from grib_to_texture import grib2_to_flow_texture
from netcdf_to_texture import netcdf_uv_to_flow_texture
from overlay_texture import (
    OverlayTexture,
    grib2_cape_to_overlay_texture,
    grib2_cwat_to_overlay_texture,
    grib2_mslp_to_overlay_texture,
    grib2_precip_3hr_to_overlay_texture,
    grib2_pwat_to_overlay_texture,
    grib2_relative_humidity_to_overlay_texture,
    grib2_temperature_to_overlay_texture,
    netcdf_pm25_to_overlay_texture,
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
}

REFRESH_INTERVAL_S = 6 * 60 * 60  # matches GFS's own 6-hourly cycle (research.md §1/spec FR-007); also used as the overlay loop's poll interval — coarser than CAMS' own ~12h cadence, but re-fetching early just re-uploads the same cycle's data, harmless

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = "flow-snapshots"
OVERLAY_STORAGE_BUCKET = "overlay-snapshots"


def _require_supabase_env() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("[wind-importer] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, cannot write results", file=sys.stderr)
        sys.exit(1)


def _upload_texture(layer_type: str, issued_at: dt.datetime, png_bytes: bytes) -> str:
    """Uploads the PNG to Supabase Storage, returns the storage path (contracts/flow-snapshot-contract.md)."""
    path = f"{layer_type}/{issued_at.strftime('%Y-%m-%dT%H-%M-%SZ')}.png"
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


def _upload_overlay_texture(overlay_type: str, issued_at: dt.datetime, png_bytes: bytes) -> str:
    """Same shape as _upload_texture, targeting the overlay-snapshots bucket (contracts/overlay-snapshot-contract.md)."""
    path = f"{overlay_type}/{issued_at.strftime('%Y-%m-%dT%H-%M-%SZ')}.png"
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


SOURCE_NAME_BY_LAYER = {"wind": "gfs", "ocean_current": "cmems", "wave": "wavewatch3"}
SOURCE_NAME_BY_OVERLAY = {"air_quality_pm25": "cams", **{key: "gfs" for key in GFS_OVERLAY_FIELDS}}


def _insert_flow_snapshot_row(layer_type: str, issued_at: dt.datetime, texture: FlowTexture, storage_path: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/flow_snapshots"
    west, south, east, north = texture.bounds
    row = {
        "id": str(uuid.uuid4()),
        "layer_type": layer_type,
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


def _insert_overlay_snapshot_row(overlay_type: str, issued_at: dt.datetime, texture: OverlayTexture, storage_path: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/overlay_snapshots"
    west, south, east, north = texture.bounds
    row = {
        "id": str(uuid.uuid4()),
        "overlay_type": overlay_type,
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


def run_once(layer_type: str) -> None:
    """
    Fetch -> convert -> upload -> insert. Deliberately does NOT touch any
    prior row on failure at any step (an uncaught exception here just
    exits non-zero; the previously-inserted flow_snapshots row, if any,
    stays exactly as it was) — contracts/flow-snapshot-contract.md's
    "fail loudly, keep prior data" rule, same convention as
    writeExposureDataset.ts's supersede-only-after-success behavior.
    """
    _require_supabase_env()

    if layer_type == "wind":
        raw_bytes, issued_at = fetch_latest_wind_grib2()
        texture = grib2_to_flow_texture(raw_bytes)
    elif layer_type == "ocean_current":
        raw_bytes, issued_at = fetch_latest_currents_netcdf()
        texture = netcdf_uv_to_flow_texture(raw_bytes)
    elif layer_type == "wave":
        raw_bytes, issued_at = fetch_latest_wave_grib2()
        texture = wave_grib2_to_flow_texture(raw_bytes)
    else:
        raise ValueError(f"Unknown layer_type {layer_type!r} (expected 'wind', 'ocean_current', or 'wave')")

    print(f"[wind-importer] Fetched {layer_type} data issued at {issued_at.isoformat()}")
    print(
        f"[wind-importer] Converted to texture: "
        f"u=[{texture.u_min:.2f},{texture.u_max:.2f}] v=[{texture.v_min:.2f},{texture.v_max:.2f}] "
        f"({len(texture.png_bytes)} bytes PNG)"
    )
    storage_path = _upload_texture(layer_type, issued_at, texture.png_bytes)
    print(f"[wind-importer] Uploaded texture to {STORAGE_BUCKET}/{storage_path}")
    _insert_flow_snapshot_row(layer_type, issued_at, texture, storage_path)
    print(f"[wind-importer] Inserted flow_snapshots row for {layer_type} @ {issued_at.isoformat()}")
    # metadata_json(texture) is available for local debugging but is not
    # itself persisted — the flow_snapshots row's own columns are the
    # source of truth the frontend reads (contracts/flow-snapshot-contract.md).
    _ = metadata_json(texture)


def run_once_overlay(overlay_type: str) -> None:
    """Fetch -> color -> upload -> insert, for the Overlay path — same
    fail-loudly-keep-prior-data rule as run_once() (contracts/
    overlay-snapshot-contract.md Producer)."""
    _require_supabase_env()

    if overlay_type == "air_quality_pm25":
        raw_bytes, issued_at = fetch_latest_pm25_netcdf()
        texture = netcdf_pm25_to_overlay_texture(raw_bytes)
    elif overlay_type in GFS_OVERLAY_FIELDS:
        fetch_fn, convert_fn = GFS_OVERLAY_FIELDS[overlay_type]
        raw_bytes, issued_at = fetch_fn()
        texture = convert_fn(raw_bytes)
    else:
        expected = ", ".join(["'air_quality_pm25'", *(repr(k) for k in GFS_OVERLAY_FIELDS)])
        raise ValueError(f"Unknown overlay_type {overlay_type!r} (expected one of: {expected})")

    print(f"[wind-importer] Fetched {overlay_type} data issued at {issued_at.isoformat()}")
    print(
        f"[wind-importer] Colored to overlay texture: "
        f"value=[{texture.value_min:.2f},{texture.value_max:.2f}] ({len(texture.png_bytes)} bytes PNG)"
    )
    storage_path = _upload_overlay_texture(overlay_type, issued_at, texture.png_bytes)
    print(f"[wind-importer] Uploaded overlay texture to {OVERLAY_STORAGE_BUCKET}/{storage_path}")
    _insert_overlay_snapshot_row(overlay_type, issued_at, texture, storage_path)
    print(f"[wind-importer] Inserted overlay_snapshots row for {overlay_type} @ {issued_at.isoformat()}")


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--layer-type", choices=["wind", "ocean_current", "wave"])
    mode.add_argument("--overlay-type", choices=["air_quality_pm25", *GFS_OVERLAY_FIELDS])
    parser.add_argument("--once", action="store_true", help="Run a single import and exit, instead of looping every 6h")
    args = parser.parse_args()

    run = (lambda: run_once(args.layer_type)) if args.layer_type else (lambda: run_once_overlay(args.overlay_type))
    label = args.layer_type or args.overlay_type

    if args.once:
        run()
        return

    print(f"[wind-importer] Starting scheduled loop for {label}, every {REFRESH_INTERVAL_S // 3600}h")
    while True:
        try:
            run()
        except Exception as e:  # noqa: BLE001 - matches cron.ts's own "log loudly, don't crash the scheduled process" convention
            print(f"[wind-importer] Run FAILED: {e}", file=sys.stderr)
        time.sleep(REFRESH_INTERVAL_S)


if __name__ == "__main__":
    main()
