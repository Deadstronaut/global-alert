"""
Fetches NOAA Coral Reef Watch's daily global 5km Bleaching Alert Area
(7-day maximum composite) product — spec 054 follow-up, Ocean mode's "BAA"
Overlay entry. Publicly served over plain HTTPS (no account/credentials
needed, unlike CMEMS) directly from NOAA/NESDIS/STAR's own file share —
URL pattern and the NetCDF variable name (`bleaching_alert_area`)
confirmed via NOAA/NESDIS's own documentation and a real listed file,
2026-08-06: .../baa-max-7d/2022/ct5km_baa-max-7d_v3.1_20220714.nc.

Same-day files can lag behind real-time by a day or two (satellite
processing/compositing latency) — falls back a few days at a time, same
"try newest expected, then fall back" shape as fetch_waves.py's own cycle
fallback.
"""
from __future__ import annotations

import datetime as dt

import requests

BASE_URL = "https://www.star.nesdis.noaa.gov/pub/sod/mecb/crw/data/5km/v3.1_op/nc/v1.0/daily/baa-max-7d"
MAX_LOOKBACK_DAYS = 5


def _url_for(date: dt.date) -> str:
    return f"{BASE_URL}/{date.year}/ct5km_baa-max-7d_v3.1_{date.strftime('%Y%m%d')}.nc"


def fetch_latest_baa_netcdf(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """Returns (netcdf_bytes, issued_at) — issued_at is midnight UTC of the
    day the successfully-fetched file is dated for, matching CMEMS's own
    daily-mean granularity convention (fetch_currents.py/fetch_sst.py)."""
    today = dt.datetime.now(dt.timezone.utc).date()
    last_error: Exception | None = None
    for days_back in range(MAX_LOOKBACK_DAYS):
        date = today - dt.timedelta(days=days_back)
        try:
            response = requests.get(_url_for(date), timeout=timeout_s)
            if response.status_code == 404:
                continue
            response.raise_for_status()
            issued_at = dt.datetime(date.year, date.month, date.day, tzinfo=dt.timezone.utc)
            return response.content, issued_at
        except requests.RequestException as e:  # noqa: PERF203 - a handful of iterations, clarity over micro-perf
            last_error = e
            continue
    raise RuntimeError(
        f"Failed to fetch NOAA CRW BAA data for the last {MAX_LOOKBACK_DAYS} days"
        + (f" (last error: {last_error})" if last_error else " (all returned 404)")
    )
