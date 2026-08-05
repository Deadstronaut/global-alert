"""
Fetches the latest CAMS forecast fields from the Copernicus Atmosphere
Data Store (ADS) — spec 054 US2, research.md §3, extended 2026-08-06 for
Particulates mode's remaining Overlay entries (PM1/PM10/DUex/OMaot/SO4ex)
alongside the original PM2.5.

Unlike CMEMS's username/password auth (fetch_currents.py), ADS uses a
single API key tied to a URL, via the `cdsapi` client library. Requires a
free ADS account (https://ads.atmosphere.copernicus.eu) — registration is a
manual step, not something this importer can do for itself. Credentials
are read from COPERNICUS_ADS_URL / COPERNICUS_ADS_KEY env vars.
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


def _download(
    client: "cdsapi.Client", variable: str, catalog_date: dt.date, cycle_hour: int, tmp_dir: str,
    extra_params: dict | None = None,
) -> bytes:
    request = {
        "variable": [variable],
        "date": [catalog_date.strftime("%Y-%m-%d")],
        "time": [f"{cycle_hour:02d}:00"],
        "leadtime_hour": ["0"],
        "type": ["forecast"],
        "data_format": "netcdf_zip",
        **(extra_params or {}),
    }
    zip_path = os.path.join(tmp_dir, f"{variable}.zip")
    client.retrieve(DATASET_ID, request).download(zip_path)
    with zipfile.ZipFile(zip_path) as zf:
        nc_names = [n for n in zf.namelist() if n.endswith(".nc")]
        if not nc_names:
            raise RuntimeError(f"CAMS response ZIP for {variable!r} had no .nc file (contents: {zf.namelist()})")
        return zf.read(nc_names[0])


def _fetch_latest_cams_netcdf(variable: str, timeout_s: int, extra_params: dict | None = None) -> tuple[bytes, dt.datetime]:
    """
    Shared fetch for any single-variable CAMS global-atmospheric-
    composition-forecasts request — request shape live-verified 2026-08-05
    against the real ADS API's own live constraints (fetched via cdsapi's
    apply_constraints(), the authoritative source — unlike the static
    get_process() schema, which is misleadingly incomplete: it omits
    `date` entirely and only lists 2 of the 4 real `time` cycles).
    `data_format: 'netcdf_zip'` and `type: 'forecast'` are both valid per
    that same live check. Returns (netcdf_bytes, issued_at).

    Falls back to the day's 00:00 cycle if the "latest expected cycle"
    guess 400s — live-verified 2026-08-05/06: CAMS' publish lag isn't just
    the whole-day CATALOG_LAG_DAYS offset, individual later cycles (06/12/18)
    for the newest available date can themselves not be published yet even
    though the date itself already appears in the catalog, while 00:00
    (published first, earliest in the day) reliably is — same "fail open,
    don't block on the newest possible data" convention as fetch_gfs.py's
    own cycle fallback, just a within-day fallback instead of a
    previous-day one.
    """
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

    client = cdsapi.Client(url=url, key=key, timeout=timeout_s)
    with tempfile.TemporaryDirectory() as tmp_dir:
        try:
            netcdf_bytes = _download(client, variable, catalog_date, cycle_hour, tmp_dir, extra_params)
            issued_hour = cycle_hour
        except Exception as first_error:  # noqa: BLE001 - ADS raises requests.HTTPError, not a specific typed exception to catch narrowly
            if cycle_hour == 0:
                raise
            try:
                netcdf_bytes = _download(client, variable, catalog_date, 0, tmp_dir, extra_params)
                issued_hour = 0
            except Exception as second_error:
                raise RuntimeError(
                    f"Failed to fetch CAMS {variable!r} for {catalog_date} cycle {cycle_hour:02d}:00 "
                    f"({first_error}) and fallback cycle 00:00 ({second_error})"
                ) from second_error

        issued_at = dt.datetime(catalog_date.year, catalog_date.month, catalog_date.day, issued_hour, tzinfo=dt.timezone.utc)
        return netcdf_bytes, issued_at


def fetch_latest_pm25_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """PM2.5 surface concentration — NetCDF subdataset variable name 'pm2p5'."""
    return _fetch_latest_cams_netcdf("particulate_matter_2.5um", timeout_s)


# CAMS request variable name -> NetCDF subdataset variable name pairs
# live-verified 2026-08-06 against real downloaded files (gdalinfo on each
# — CAMS' subdataset names don't always match the request name mechanically,
# e.g. 'dust_aerosol_optical_depth_550nm' -> 'duaod550', so these were
# confirmed one at a time rather than guessed).
def fetch_latest_pm1_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """PM1 surface concentration — NetCDF subdataset variable name 'pm1'."""
    return _fetch_latest_cams_netcdf("particulate_matter_1um", timeout_s)


def fetch_latest_pm10_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """PM10 surface concentration — NetCDF subdataset variable name 'pm10'."""
    return _fetch_latest_cams_netcdf("particulate_matter_10um", timeout_s)


def fetch_latest_dust_aod_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """Dust aerosol optical depth @ 550nm — NetCDF subdataset variable name 'duaod550'."""
    return _fetch_latest_cams_netcdf("dust_aerosol_optical_depth_550nm", timeout_s)


def fetch_latest_organic_matter_aod_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """Organic matter aerosol optical depth @ 550nm — NetCDF subdataset variable name 'omaod550'."""
    return _fetch_latest_cams_netcdf("organic_matter_aerosol_optical_depth_550nm", timeout_s)


def fetch_latest_sulfate_aod_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """Sulphate aerosol optical depth @ 550nm — NetCDF subdataset variable name 'suaod550'."""
    return _fetch_latest_cams_netcdf("sulphate_aerosol_optical_depth_550nm", timeout_s)


# Chem mode (spec 054 follow-up, 2026-08-06) — carbon_monoxide/
# sulphur_dioxide/nitrogen_dioxide are 3D species in this dataset (unlike
# every PM/AOD field above, which are inherently surface/column fields
# with no level to pick) — live-verified 2026-08-06 via the ADS API's own
# constraints endpoint: requesting them without a pressure_level/model_level
# 400s. pressure_level=1000 (the lowest level this dataset offers) is the
# closest available proxy for "surface concentration", matching what the
# reference tool itself calls these fields (COsc/SO2sm — "surface").
# CO2 has NO entry in this dataset's variable list at all (verified against
# the same constraints endpoint) — CAMS publishes CO2 forecasts as a
# separate product this app doesn't integrate, so CO2sc has no real data
# source and stays a disabled placeholder in the frontend, same honesty
# pattern as every other not-yet-wired entry in this menu.
_SURFACE_PROXY_PRESSURE_LEVEL = {"pressure_level": ["1000"]}


def fetch_latest_co_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """Carbon monoxide @ 1000mb (surface proxy) — NetCDF subdataset variable name 'co', mass mixing ratio (kg/kg)."""
    return _fetch_latest_cams_netcdf("carbon_monoxide", timeout_s, _SURFACE_PROXY_PRESSURE_LEVEL)


def fetch_latest_so2_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """Sulphur dioxide @ 1000mb (surface proxy) — NetCDF subdataset variable name 'so2', mass mixing ratio (kg/kg)."""
    return _fetch_latest_cams_netcdf("sulphur_dioxide", timeout_s, _SURFACE_PROXY_PRESSURE_LEVEL)


def fetch_latest_no2_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """Nitrogen dioxide @ 1000mb (surface proxy) — NetCDF subdataset variable name 'no2', mass mixing ratio (kg/kg)."""
    return _fetch_latest_cams_netcdf("nitrogen_dioxide", timeout_s, _SURFACE_PROXY_PRESSURE_LEVEL)
