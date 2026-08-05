"""
Fetches the latest global wave field (significant wave height + primary
direction) from NOAA NOMADS — spec 054 US1 (Waves, Ocean mode).

URL shape live-verified 2026-08-05 against the real NOMADS filter service
(https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl?dir=...&file=
gfswave.t06z.global.0p25.f000.grib2&var_HTSGW=on&var_DIRPW=on&
lev_surface=on) — a real ~1.3MB GRIB2 subset on the global 0.25° wave grid,
confirmed via gdalinfo to contain HTSGW (GRIB_ELEMENT, meters, NoData=9999)
and DIRPW (GRIB_ELEMENT, degrees true, NoData=9999) surface bands. Same
00/06/12/18 UTC cycle schedule as GFS wind (fetch_gfs.py) — WAVEWATCH III
is NCEP's own wave model, published on the same NOMADS infrastructure.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import requests

NOMADS_WAVE_FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl"
CYCLE_HOURS = (0, 6, 12, 18)
FORECAST_HOUR = "f000"  # nowcast, matching fetch_gfs.py's own "current conditions, not forecast" choice
GRID = "global.0p25"


@dataclass
class WaveCycle:
    """One WAVEWATCH III model run: the cycle this data was issued for (UTC)."""

    date: dt.date
    hour: int

    @property
    def issued_at(self) -> dt.datetime:
        return dt.datetime(self.date.year, self.date.month, self.date.day, self.hour, tzinfo=dt.timezone.utc)

    @property
    def dir_param(self) -> str:
        return f"/gfs.{self.date:%Y%m%d}/{self.hour:02d}/wave/gridded"

    @property
    def filename(self) -> str:
        return f"gfswave.t{self.hour:02d}z.{GRID}.{FORECAST_HOUR}.grib2"


def latest_available_cycle(now: dt.datetime | None = None) -> WaveCycle:
    """Same "most recent already-occurred cycle slot" logic as fetch_gfs.py's
    latest_available_cycle() — real-world NOMADS publishing lag is handled by
    the fallback in fetch_latest_wave_grib2(), not by guessing a fixed lag here."""
    now = now or dt.datetime.now(dt.timezone.utc)
    candidate_hour = max(h for h in CYCLE_HOURS if h <= now.hour)
    return WaveCycle(date=now.date(), hour=candidate_hour)


def previous_cycle(cycle: WaveCycle) -> WaveCycle:
    idx = CYCLE_HOURS.index(cycle.hour)
    if idx > 0:
        return WaveCycle(date=cycle.date, hour=CYCLE_HOURS[idx - 1])
    return WaveCycle(date=cycle.date - dt.timedelta(days=1), hour=CYCLE_HOURS[-1])


def _download(cycle: WaveCycle, timeout_s: int) -> bytes:
    params = {
        "dir": cycle.dir_param,
        "file": cycle.filename,
        "var_HTSGW": "on",
        "var_DIRPW": "on",
        "lev_surface": "on",
    }
    response = requests.get(NOMADS_WAVE_FILTER_URL, params=params, timeout=timeout_s)
    response.raise_for_status()
    body = response.content
    # Same NOMADS quirk as fetch_gfs.py: a missing cycle/file comes back as
    # HTTP 200 with an HTML error page, not a 404 — a real GRIB2 file always
    # starts with the 4-byte "GRIB" magic.
    if body[:4] != b"GRIB":
        raise RuntimeError(f"NOMADS did not return a GRIB2 file for {cycle.dir_param}/{cycle.filename}")
    return body


def fetch_latest_wave_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """Returns (grib2_bytes, issued_at). Tries the latest expected cycle first,
    falling back one cycle (6h) if NOMADS hasn't published it yet — mirrors
    fetch_gfs.py's own fallback shape exactly."""
    cycle = latest_available_cycle()
    try:
        return _download(cycle, timeout_s), cycle.issued_at
    except (requests.RequestException, RuntimeError) as first_error:
        fallback = previous_cycle(cycle)
        try:
            return _download(fallback, timeout_s), fallback.issued_at
        except (requests.RequestException, RuntimeError) as second_error:
            raise RuntimeError(
                f"Failed to fetch wave data for {cycle.dir_param} "
                f"({first_error}) and fallback {fallback.dir_param} ({second_error})"
            ) from second_error
