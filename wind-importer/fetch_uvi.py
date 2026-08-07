"""
Fetches NOAA/NCEP's Global UV Index Forecast GRIB2 — spec 054 follow-up,
Air mode's "UVI" Overlay entry. Publicly served over plain HTTPS (no
account/credentials needed) via NOMADS — the W/m^2 -> UV Index conversion
factor (x40.0) is confirmed via NOAA CPC's own UV forecast documentation
page, 2026-08-06; the base URL/directory/filename pattern below is
live-verified against a real NOMADS directory listing the same day (an
earlier version pointed at ftpprd.ncep.noaa.gov, which refused the
connection outright — not this product's real public host at all).

Unlike GFS wind/temp/etc. (4 cycles/day via NOMADS' filter service), this
product publishes only ONE cycle per day (12 UTC) as hourly forecast steps
out to 120h, and there's no NOMADS filter/subset service for it — this
downloads the single nearest-to-now forecast-hour file directly. Live
listing also showed real publishing gaps (a missing day between two
otherwise-consecutive cycle directories) wider than GFS's own usual lag,
hence MAX_LOOKBACK_DAYS below rather than a single one-cycle-back retry.
"""
from __future__ import annotations

import datetime as dt

import requests

BASE_URL = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/uvi/prod"
CYCLE_HOUR = 12  # this product's only published cycle
MAX_FORECAST_HOUR = 120
MAX_LOOKBACK_DAYS = 4


def _url_for(cycle_date: dt.date, forecast_hour: int) -> str:
    # Live-verified 2026-08-06 real directory listing: "uvi.YYYYMMDD" (not
    # "uv.YYYYMMDD"), filenames "uv.t12z.grbfNN.grib2" with NN the plain
    # integer forecast hour, NOT zero-padded to a fixed width past 2 digits
    # (grbf01..grbf99, then grbf100..grbf120) — f"{n:02d}" happens to
    # produce exactly this (minimum-width-2, not fixed-width) for the whole
    # 1-120 range, so no special-casing needed for the 3-digit values.
    return f"{BASE_URL}/uvi.{cycle_date:%Y%m%d}/uv.t{CYCLE_HOUR:02d}z.grbf{forecast_hour:02d}.grib2"


def fetch_latest_uvi_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """
    Returns (grib2_bytes, issued_at) — issued_at is the actual forecast
    valid time (cycle time + forecast_hour), not the cycle's own issue
    time, matching how this field is used as a "current conditions"
    nowcast the same way fetch_gfs.py's own f000 fields are (just via a
    forecast-hour OFFSET instead of f000, since this product has no f000).

    Picks the forecast hour closest to "now" from the most recent past 12z
    cycle (clamped to [1, MAX_FORECAST_HOUR] since f000 doesn't exist for
    this product); walks back up to MAX_LOOKBACK_DAYS cycles (each one
    further back adding 24h to the requested forecast hour, clamped to
    MAX_FORECAST_HOUR) if the expected file isn't published yet.
    """
    now = dt.datetime.now(dt.timezone.utc)
    cycle_date = now.date() if now.hour >= CYCLE_HOUR else now.date() - dt.timedelta(days=1)
    cycle_issued_at = dt.datetime(cycle_date.year, cycle_date.month, cycle_date.day, CYCLE_HOUR, tzinfo=dt.timezone.utc)
    hours_since_cycle = int((now - cycle_issued_at).total_seconds() // 3600)
    base_forecast_hour = max(1, min(hours_since_cycle, MAX_FORECAST_HOUR))

    last_error: Exception | None = None
    for days_back in range(MAX_LOOKBACK_DAYS):
        attempt_cycle_date = cycle_date - dt.timedelta(days=days_back)
        attempt_cycle_issued_at = dt.datetime(
            attempt_cycle_date.year, attempt_cycle_date.month, attempt_cycle_date.day, CYCLE_HOUR, tzinfo=dt.timezone.utc,
        )
        forecast_hour = min(base_forecast_hour + days_back * 24, MAX_FORECAST_HOUR)
        try:
            response = requests.get(_url_for(attempt_cycle_date, forecast_hour), timeout=timeout_s)
            if response.status_code == 404:
                last_error = RuntimeError(f"404 for {attempt_cycle_date:%Y%m%d}/f{forecast_hour}")
                continue
            response.raise_for_status()
            return response.content, attempt_cycle_issued_at + dt.timedelta(hours=forecast_hour)
        except requests.RequestException as e:
            last_error = e
            continue

    raise RuntimeError(
        f"Failed to fetch NCEP UV Index data for the last {MAX_LOOKBACK_DAYS} cycles "
        f"starting {cycle_date:%Y%m%d} (last error: {last_error})"
    )


def fetch_forecast_uvi_grib2(forecast_step_hours: int, timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """
    Returns (grib2_bytes, issued_at) for one 15-day-horizon forecast step
    (spec 055 follow-up) — issued_at is the actual forecast valid time
    (cycle + forecast_step_hours), same "current-conditions-style tuple
    shape" as fetch_latest_uvi_grib2. Unlike that function's own
    nearest-to-now step selection, this requests a SPECIFIC step directly
    — simpler, since the caller (main.py's forecast loop) already knows
    exactly which step it wants.

    Raises ValueError immediately (not RuntimeError after a network round
    trip) for forecast_step_hours > MAX_FORECAST_HOUR (120h/5 days) — this
    product genuinely has no data beyond that lead time, a permanent
    per-variable limit, not a transient fetch failure. Callers (main.py)
    catch this to skip only the affected steps for uv_index, not treat it
    as an error worth logging like a real fetch failure.
    """
    if forecast_step_hours > MAX_FORECAST_HOUR:
        raise ValueError(
            f"NCEP UV Index has no forecast data beyond {MAX_FORECAST_HOUR}h "
            f"(requested {forecast_step_hours}h) — this product's own real lead-time limit"
        )
    now = dt.datetime.now(dt.timezone.utc)
    cycle_date = now.date() if now.hour >= CYCLE_HOUR else now.date() - dt.timedelta(days=1)

    last_error: Exception | None = None
    for days_back in range(MAX_LOOKBACK_DAYS):
        attempt_cycle_date = cycle_date - dt.timedelta(days=days_back)
        attempt_cycle_issued_at = dt.datetime(
            attempt_cycle_date.year, attempt_cycle_date.month, attempt_cycle_date.day, CYCLE_HOUR, tzinfo=dt.timezone.utc,
        )
        try:
            response = requests.get(_url_for(attempt_cycle_date, forecast_step_hours), timeout=timeout_s)
            if response.status_code == 404:
                last_error = RuntimeError(f"404 for {attempt_cycle_date:%Y%m%d}/f{forecast_step_hours}")
                continue
            response.raise_for_status()
            return response.content, attempt_cycle_issued_at
        except requests.RequestException as e:
            last_error = e
            continue

    raise RuntimeError(
        f"Failed to fetch forecast NCEP UV Index data for f{forecast_step_hours} over the last "
        f"{MAX_LOOKBACK_DAYS} cycles starting {cycle_date:%Y%m%d} (last error: {last_error})"
    )
