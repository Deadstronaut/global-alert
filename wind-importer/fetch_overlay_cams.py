"""
Fetches the latest CAMS PM2.5 surface-concentration forecast from the
Copernicus Atmosphere Data Store (ADS) — spec 054 US2, research.md §3.

Unlike CMEMS's username/password auth (fetch_currents.py), ADS uses a
single API key tied to a URL, via the `cdsapi` client library. Requires a
free ADS account (https://ads.atmosphere.copernicus.eu) — registration is a
manual step, not something this importer can do for itself. Credentials
are read from COPERNICUS_ADS_URL / COPERNICUS_ADS_KEY env vars.

NOTE: written against cdsapi's documented retrieve() API and the
"cams-global-atmospheric-composition-forecasts" dataset id /
'particulate_matter_2.5um' variable name, but NOT live-verified end to end
the way fetch_gfs.py/fetch_waves.py's NOMADS URLs were — this repo has no
ADS credentials to test against yet. If the dataset id, variable name, or
response format (netcdf_zip contains a .nc file, assumed extractable by
name) have drifted, the first real run's error will point at what needs
adjusting — the same situation fetch_currents.py started in before CMEMS
access was confirmed live.
"""
from __future__ import annotations

import datetime as dt
import os
import tempfile
import zipfile

import cdsapi

DATASET_ID = "cams-global-atmospheric-composition-forecasts"


def fetch_latest_pm25_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """Returns (netcdf_bytes, issued_at). CAMS publishes twice a day (00/12
    UTC) — issued_at is today's most recent of those two slots that has
    already occurred, mirroring fetch_gfs.py's own "most recent already-
    occurred cycle" logic."""
    url = os.environ.get("COPERNICUS_ADS_URL", "https://ads.atmosphere.copernicus.eu/api")
    key = os.environ.get("COPERNICUS_ADS_KEY")
    if not key:
        raise RuntimeError(
            "COPERNICUS_ADS_KEY not set — register a free account at "
            "https://ads.atmosphere.copernicus.eu and add it (plus COPERNICUS_ADS_URL "
            "if different from the default) to server/.env"
        )

    now = dt.datetime.now(dt.timezone.utc)
    cycle_hour = 12 if now.hour >= 12 else 0
    issued_at = dt.datetime(now.year, now.month, now.day, cycle_hour, tzinfo=dt.timezone.utc)

    client = cdsapi.Client(url=url, key=key, timeout=timeout_s)
    request = {
        "variable": ["particulate_matter_2.5um"],
        "date": [issued_at.strftime("%Y-%m-%d/%Y-%m-%d")],
        "time": [issued_at.strftime("%H:%M")],
        "leadtime_hour": ["0"],
        "type": ["forecast"],
        "data_format": "netcdf_zip",
    }

    with tempfile.TemporaryDirectory() as tmp_dir:
        zip_path = os.path.join(tmp_dir, "pm25.zip")
        client.retrieve(DATASET_ID, request).download(zip_path)
        with zipfile.ZipFile(zip_path) as zf:
            nc_names = [n for n in zf.namelist() if n.endswith(".nc")]
            if not nc_names:
                raise RuntimeError(f"CAMS response ZIP had no .nc file (contents: {zf.namelist()})")
            return zf.read(nc_names[0]), issued_at
