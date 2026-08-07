"""
Fetches the latest global sea surface temperature (thetao, shallowest
depth) from Copernicus Marine (CMEMS) — spec 054 follow-up, Ocean mode's
"SST" Overlay entry. Same dataset family and access pattern as
fetch_currents.py (GLOBAL_ANALYSISFORECAST_PHY_001_024, 0.083deg,
daily-mean) — Copernicus Marine publishes a dedicated per-variable dataset
ID for potential temperature (thetao) rather than bundling it with uo/vo,
confirmed via Copernicus Marine's own product catalog, 2026-08-06:
cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m.

Same credentials as fetch_currents.py (COPERNICUS_MARINE_USERNAME/
COPERNICUS_MARINE_PASSWORD) — one Copernicus Marine account covers every
dataset in the product, no separate registration needed for SST.

NOTE: like fetch_currents.py, this has NOT been live-verified end to end
(no CMEMS credentials in this dev environment) — if the dataset id or
`thetao`'s reported units (assumed °C, CMEMS's own documented convention
for this variable) have drifted, the first real run's error message or an
implausible value_min/value_max in the resulting overlay_snapshots row
will point at exactly what needs adjusting.
"""
from __future__ import annotations

import datetime as dt
import os
import tempfile

import copernicusmarine
import requests

DATASET_ID = "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m"
# Same shallowest-level range as fetch_currents.py's own MIN/MAX_DEPTH_M —
# see that file's comment for why a range (not an exact 0.0) survives
# across dataset version bumps to the real depth-coordinate float.
MIN_DEPTH_M = 0.0
MAX_DEPTH_M = 1.0


def fetch_latest_sst_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """Returns (netcdf_bytes, issued_at) — same daily-mean granularity as
    fetch_latest_currents_netcdf()."""
    username = os.environ.get("COPERNICUS_MARINE_USERNAME")
    password = os.environ.get("COPERNICUS_MARINE_PASSWORD")
    if not username or not password:
        raise RuntimeError(
            "COPERNICUS_MARINE_USERNAME / COPERNICUS_MARINE_PASSWORD not set — "
            "register a free account at https://data.marine.copernicus.eu/register "
            "and add both to server/.env"
        )

    now = dt.datetime.now(dt.timezone.utc)
    issued_at = dt.datetime(now.year, now.month, now.day, tzinfo=dt.timezone.utc)

    with tempfile.TemporaryDirectory() as tmp_dir:
        filename = "sst.nc"
        copernicusmarine.subset(
            dataset_id=DATASET_ID,
            variables=["thetao"],
            minimum_longitude=-180,
            maximum_longitude=180,
            minimum_latitude=-80,
            maximum_latitude=90,
            minimum_depth=MIN_DEPTH_M,
            maximum_depth=MAX_DEPTH_M,
            start_datetime=issued_at.isoformat(),
            end_datetime=issued_at.isoformat(),
            username=username,
            password=password,
            output_directory=tmp_dir,
            output_filename=filename,
            overwrite=True,
            disable_progress_bar=True,
        )
        out_path = os.path.join(tmp_dir, filename)
        with open(out_path, "rb") as f:
            return f.read(), issued_at


# SSTA (spec 054 follow-up, 2026-08-06) — CMEMS's own daily NRT SST product
# has no ready-made "anomaly" variable (that only exists in its monthly/
# reprocessed products, confirmed 2026-08-06 via Copernicus Marine's own
# documentation) — the anomaly is computed here instead, against NOAA's
# public 1991-2020 daily SST climatology (a well-established, widely-used
# baseline for exactly this purpose), served over plain HTTPS/ERDDAP with
# no account needed, confirmed 2026-08-06:
# https://comet.nefsc.noaa.gov/erddap/griddap/noaa_psl_4e02_3713_6583.html
CLIMATOLOGY_ERDDAP_URL = "https://comet.nefsc.noaa.gov/erddap/griddap/noaa_psl_4e02_3713_6583.nc"
# Confirmed via that dataset's own metadata, 2026-08-06 — NOT live-verified
# against a real response (no live access to fetch and inspect one here).
CLIMATOLOGY_LAT_RANGE = (-89.875, 89.875)
# NOTE: this source's own longitude convention is 0..360 (0.125..359.875),
# NOT -180..180 like CMEMS's — overlay_texture.py's own
# netcdf_sst_anomaly_to_overlay_texture() un-wraps this (a clean half-grid
# roll, both grids share the same TEXTURE_WIDTH spacing) before subtracting,
# rather than relying on ERDDAP's own longitude-wraparound query handling,
# which would need a live request to confirm actually works for this
# specific dataset.
CLIMATOLOGY_LON_RANGE = (0.125, 359.875)


def fetch_latest_sst_climatology_netcdf(for_date: dt.date | None = None, timeout_s: int = 60) -> bytes:
    """
    Fetches one day-of-year's global climatological-mean SST slice as
    NetCDF, via ERDDAP griddap's bracket-subsetting query (returns only
    that one slice, not the whole ~1.5GB climatology file). `for_date`
    defaults to today (UTC) — the caller (netcdf_sst_anomaly_to_overlay_
    texture's own driver) always wants "today's" climatological normal to
    compare the current SST fetch against.

    Time is selected by plain 0-based INDEX (day-of-year - 1), not by
    value — this dataset's own time axis uses a shifted pseudo-year
    (confirmed via its metadata to span roughly Dec 30 - Dec 29, an
    artifact of how the underlying climatology tool centers leap-day
    handling) rather than a plain Jan-1-indexed calendar, so requesting by
    calendar value directly is not reliable; requesting by array index
    (this dataset has one time entry per day-of-year, in day-of-year order)
    sidesteps needing to reverse-engineer that exact pseudo-year encoding.
    NOT live-verified (no live access to confirm the index truly lines up
    day-for-day) — if the resulting SSTA overlay reads as offset by roughly
    a day or looks implausible, this indexing assumption is the first thing
    to check.
    """
    date = for_date or dt.datetime.now(dt.timezone.utc).date()
    day_index = min(date.timetuple().tm_yday - 1, 365)  # clamps Dec 31 of a leap year into the dataset's last (366th) slot rather than erroring
    lat_lo, lat_hi = CLIMATOLOGY_LAT_RANGE
    lon_lo, lon_hi = CLIMATOLOGY_LON_RANGE
    url = f"{CLIMATOLOGY_ERDDAP_URL}?sst[{day_index}][({lat_lo}):({lat_hi})][({lon_lo}):({lon_hi})]"
    response = requests.get(url, timeout=timeout_s)
    response.raise_for_status()
    return response.content


def fetch_latest_ssta_inputs(timeout_s: int = 120) -> tuple[tuple[bytes, bytes], dt.datetime]:
    """
    Combined fetch for the Overlay: SSTA field — run_once_overlay
    (main.py) calls every overlay's fetch_fn with zero args and expects
    back (raw_bytes, issued_at); packs the two NetCDF payloads SSTA needs
    (current SST + that day's climatology) into a single tuple so it fits
    that same one-fetch-fn-per-overlay-type shape without needing a
    special case in main.py's dispatch loop.
    """
    sst_bytes, issued_at = fetch_latest_sst_netcdf(timeout_s=timeout_s)
    climatology_bytes = fetch_latest_sst_climatology_netcdf(for_date=issued_at.date())
    return (sst_bytes, climatology_bytes), issued_at
