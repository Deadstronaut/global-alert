"""
Fetches the latest available GFS surface (10m) wind U/V GRIB2 subset from
NOAA NOMADS — spec 053 research.md §1 (GEOS-5/GMAO ruled out: its own docs
say "experimental... not recommended" for non-research use; GFS is free,
public, no auth, and matches the app's chosen 6-hour refresh cadence
exactly, since GFS itself cycles at 00/06/12/18 UTC).

URL shape live-verified 2026-08-05 against the real NOMADS filter service
(https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl) — a real ~1.9MB
GRIB2 subset containing only the UGRD/VGRD 10m-above-ground fields.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import requests

NOMADS_FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
CYCLE_HOURS = (0, 6, 12, 18)
# f000 = the model's own analysis for the cycle time (nearest thing to
# "now"), not a forecast step — this feature shows current conditions, not
# a forecast, so the nowcast band is what we want (spec.md's "current wind
# patterns", not "forecast wind patterns").
FORECAST_HOUR = "f000"


@dataclass
class GfsCycle:
    """One GFS model run: the cycle this data was issued for (UTC)."""

    date: dt.date
    hour: int

    @property
    def issued_at(self) -> dt.datetime:
        return dt.datetime(self.date.year, self.date.month, self.date.day, self.hour, tzinfo=dt.timezone.utc)

    @property
    def dir_param(self) -> str:
        return f"/gfs.{self.date:%Y%m%d}/{self.hour:02d}/atmos"

    @property
    def filename(self) -> str:
        return f"gfs.t{self.hour:02d}z.pgrb2.0p25.{FORECAST_HOUR}"


def latest_available_cycle(now: dt.datetime | None = None) -> GfsCycle:
    """
    GFS publishes a new cycle every 6h but with a real-world processing lag
    (a few hours) before NOMADS actually has it — rather than guess a fixed
    lag, this just returns the most recent CYCLE_HOURS slot that has
    already occurred; callers should fall back to the previous cycle
    (see fetch_latest_wind_grib2's retry) if NOMADS 404s it.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    candidate_hour = max(h for h in CYCLE_HOURS if h <= now.hour)
    return GfsCycle(date=now.date(), hour=candidate_hour)


def previous_cycle(cycle: GfsCycle) -> GfsCycle:
    idx = CYCLE_HOURS.index(cycle.hour)
    if idx > 0:
        return GfsCycle(date=cycle.date, hour=CYCLE_HOURS[idx - 1])
    return GfsCycle(date=cycle.date - dt.timedelta(days=1), hour=CYCLE_HOURS[-1])


def _download(cycle: GfsCycle, timeout_s: int) -> bytes:
    params = {
        "dir": cycle.dir_param,
        "file": cycle.filename,
        "var_UGRD": "on",
        "var_VGRD": "on",
        "lev_10_m_above_ground": "on",
    }
    response = requests.get(NOMADS_FILTER_URL, params=params, timeout=timeout_s)
    response.raise_for_status()
    body = response.content
    # NOMADS returns HTTP 200 with an HTML error page (not a 404) when the
    # requested cycle/file doesn't exist yet — a real GRIB2 file always
    # starts with the 4-byte "GRIB" magic, live-verified 2026-08-05.
    if body[:4] != b"GRIB":
        raise RuntimeError(f"NOMADS did not return a GRIB2 file for {cycle.dir_param}/{cycle.filename}")
    return body


def fetch_latest_wind_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """
    Returns (grib2_bytes, issued_at). Tries the latest expected cycle first,
    falling back one cycle (6h) if NOMADS hasn't published it yet — mirrors
    this app's existing "fail open, don't block on the newest possible
    data" convention (e.g. supabaseWriter.js's fail-open dedup checks)
    rather than erroring outright on a processing-lag miss.
    """
    cycle = latest_available_cycle()
    try:
        return _download(cycle, timeout_s), cycle.issued_at
    except (requests.RequestException, RuntimeError) as first_error:
        fallback = previous_cycle(cycle)
        try:
            return _download(fallback, timeout_s), fallback.issued_at
        except (requests.RequestException, RuntimeError) as second_error:
            raise RuntimeError(
                f"Failed to fetch GFS wind data for {cycle.dir_param} "
                f"({first_error}) and fallback {fallback.dir_param} ({second_error})"
            ) from second_error
