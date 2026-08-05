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


CYCLE_HOURS = (0, 6, 12, 18)
# The dataset's own catalog runs about a day behind "now" — live-verified
# 2026-08-05 via cdsapi's apply_constraints(), which returned valid `date`
# values ending at 2026-08-04 (yesterday), not today, even though `time`
# offers same-day-looking cycles up to 18:00. Requesting "today" 400s with
# a generic "invalid combination of values" error that gives no hint the
# actual problem is the date being outside the currently-published range —
# same class of publish-lag issue fetch_gfs.py/fetch_waves.py handle via a
# fallback-to-previous-cycle retry, just a full day of lag instead of one
# cycle here.
CATALOG_LAG_DAYS = 1


def fetch_latest_pm25_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """Returns (netcdf_bytes, issued_at).

    Request shape live-verified 2026-08-05 against the real ADS API's own
    live constraints (fetched via cdsapi's apply_constraints(), the
    authoritative source — unlike the static get_process() schema, which
    is misleadingly incomplete: it omits `date` entirely and only lists 2
    of the 4 real `time` cycles). `data_format: 'netcdf_zip'` and
    `type: 'forecast'` are both valid per that same live check."""
    url = os.environ.get("COPERNICUS_ADS_URL", "https://ads.atmosphere.copernicus.eu/api")
    key = os.environ.get("COPERNICUS_ADS_KEY")
    if not key:
        raise RuntimeError(
            "COPERNICUS_ADS_KEY not set — register a free account at "
            "https://ads.atmosphere.copernicus.eu and add it (plus COPERNICUS_ADS_URL "
            "if different from the default) to server/.env"
        )

    now = dt.datetime.now(dt.timezone.utc)
    catalog_date = (now - dt.timedelta(days=CATALOG_LAG_DAYS)).date()
    cycle_hour = max(h for h in CYCLE_HOURS if h <= now.hour) if now.hour >= CYCLE_HOURS[0] else CYCLE_HOURS[-1]
    issued_at = dt.datetime(catalog_date.year, catalog_date.month, catalog_date.day, cycle_hour, tzinfo=dt.timezone.utc)

    client = cdsapi.Client(url=url, key=key, timeout=timeout_s)
    request = {
        "variable": ["particulate_matter_2.5um"],
        "date": [catalog_date.strftime("%Y-%m-%d")],
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
