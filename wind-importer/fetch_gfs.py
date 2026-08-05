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

    def filename(self, forecast_hour: str = FORECAST_HOUR) -> str:
        return f"gfs.t{self.hour:02d}z.pgrb2.0p25.{forecast_hour}"


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


def _download(cycle: GfsCycle, timeout_s: int, extra_params: dict[str, str], forecast_hour: str) -> bytes:
    params = {
        "dir": cycle.dir_param,
        "file": cycle.filename(forecast_hour),
        **extra_params,
    }
    response = requests.get(NOMADS_FILTER_URL, params=params, timeout=timeout_s)
    response.raise_for_status()
    body = response.content
    # NOMADS returns HTTP 200 with an HTML error page (not a 404) when the
    # requested cycle/file doesn't exist yet — a real GRIB2 file always
    # starts with the 4-byte "GRIB" magic, live-verified 2026-08-05.
    if body[:4] != b"GRIB":
        raise RuntimeError(f"NOMADS did not return a GRIB2 file for {cycle.dir_param}/{cycle.filename(forecast_hour)}")
    return body


def _fetch_latest_field(
    extra_params: dict[str, str], field_label: str, timeout_s: int, forecast_hour: str = FORECAST_HOUR,
) -> tuple[bytes, dt.datetime]:
    """
    Shared "latest cycle, fall back one cycle on miss" retry (see
    fetch_latest_wind_grib2's own docstring) — parameterized by which
    NOMADS var_*/lev_* filter params to request, so wind and temperature
    (and any future GFS field) share the exact same cycle-selection logic
    instead of drifting apart. `forecast_hour` defaults to f000 (nowcast,
    see FORECAST_HOUR's own docstring) but accumulation fields like APCP
    (precip) are always zero at f000 — they need a real forecast step
    (e.g. f003) to have any accumulated value at all.
    """
    cycle = latest_available_cycle()
    try:
        return _download(cycle, timeout_s, extra_params, forecast_hour), cycle.issued_at
    except (requests.RequestException, RuntimeError) as first_error:
        fallback = previous_cycle(cycle)
        try:
            return _download(fallback, timeout_s, extra_params, forecast_hour), fallback.issued_at
        except (requests.RequestException, RuntimeError) as second_error:
            raise RuntimeError(
                f"Failed to fetch GFS {field_label} data for {cycle.dir_param} "
                f"({first_error}) and fallback {fallback.dir_param} ({second_error})"
            ) from second_error


def fetch_latest_wind_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """Returns (grib2_bytes, issued_at)."""
    return _fetch_latest_field(
        {"var_UGRD": "on", "var_VGRD": "on", "lev_10_m_above_ground": "on"}, "wind", timeout_s,
    )


# Height selector (spec 054 follow-up, 2026-08-06) — GFS pressure levels
# live-verified against a real cycle's own .idx file (TMP and RH both
# exist at all seven). 'sfc' keeps using each field's original near-
# surface level (2m for both Temp and RH) rather than an actual pressure
# level, matching the reference tool's own "Sfc" meaning "near-surface",
# not "1013 mb" or similar.
PRESSURE_LEVELS = ("1000", "850", "700", "500", "250", "70", "10")


def fetch_latest_temperature_grib2(timeout_s: int = 60, level: str = "sfc") -> tuple[bytes, dt.datetime]:
    """
    Returns (grib2_bytes, issued_at) — GFS air temperature (TMP), the
    Overlay: Temp field (spec 054 follow-up, 2026-08-05: "ilk yapmamız
    gereken şey overlay yapmak"). `level='sfc'` (default) is 2m-above-
    ground; anything in PRESSURE_LEVELS selects that isobaric level
    instead (spec 054 follow-up, 2026-08-06: Height selector). Same
    NOMADS filter service, same cycle/fallback logic as wind — GFS
    publishes TMP in the same 0.25° pgrb2 file family, just a different
    var_*/lev_* filter selection.
    """
    lev_param = "lev_2_m_above_ground" if level == "sfc" else f"lev_{level}_mb"
    return _fetch_latest_field(
        {"var_TMP": "on", lev_param: "on"}, f"temperature@{level}", timeout_s,
    )


# GFS var_*/lev_* pairs live-verified 2026-08-05 by reading a real GFS
# cycle's own .idx index file (NOMADS publishes one alongside every GRIB2,
# listing every var/level combination actually present) rather than
# guessed — same "confirm against the real thing" standard as fetch_gfs's
# original wind live-verification note.
def fetch_latest_relative_humidity_grib2(timeout_s: int = 60, level: str = "sfc") -> tuple[bytes, dt.datetime]:
    """Returns (grib2_bytes, issued_at) — GFS relative humidity (RH, %), Overlay: RH.
    Same `level` parameter/meaning as fetch_latest_temperature_grib2's own."""
    lev_param = "lev_2_m_above_ground" if level == "sfc" else f"lev_{level}_mb"
    return _fetch_latest_field({"var_RH": "on", lev_param: "on"}, f"relative_humidity@{level}", timeout_s)


def fetch_latest_mslp_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """Returns (grib2_bytes, issued_at) — GFS mean sea level pressure (PRMSL, Pa), Overlay: MSLP."""
    return _fetch_latest_field({"var_PRMSL": "on", "lev_mean_sea_level": "on"}, "mslp", timeout_s)


def fetch_latest_cape_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """Returns (grib2_bytes, issued_at) — GFS surface-based CAPE (J/kg), Overlay: CAPE."""
    return _fetch_latest_field({"var_CAPE": "on", "lev_surface": "on"}, "cape", timeout_s)


def fetch_latest_pwat_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """Returns (grib2_bytes, issued_at) — GFS total precipitable water (PWAT, kg/m^2), Overlay: TPW."""
    return _fetch_latest_field(
        {"var_PWAT": "on", "lev_entire_atmosphere_(considered_as_a_single_layer)": "on"}, "pwat", timeout_s,
    )


def fetch_latest_wet_bulb_inputs_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """
    Returns (grib2_bytes, issued_at) — GFS 2m temperature AND relative
    humidity in one request (both var_TMP and var_RH set), Overlay: WBT.
    Wet bulb temperature isn't a GFS output field itself (unlike Temp/RH/
    MSLP/CAPE/... above) — it has to be computed from Temp+RH client-side
    of this fetch (overlay_texture.py's grib2_wet_bulb_to_overlay_texture,
    Stull's 2011 approximation). Fetching both fields in a single GRIB2
    response, rather than two separate fetch_latest_*_grib2() calls,
    guarantees they're the exact same GFS cycle — two independent fetches
    could straddle a cycle rollover and silently compute WBT from
    mismatched Temp/RH data.
    """
    return _fetch_latest_field(
        {"var_TMP": "on", "var_RH": "on", "lev_2_m_above_ground": "on"}, "wet_bulb_temp inputs", timeout_s,
    )


def fetch_latest_cwat_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """Returns (grib2_bytes, issued_at) — GFS total column cloud water (CWAT, kg/m^2), Overlay: TCW."""
    return _fetch_latest_field(
        {"var_CWAT": "on", "lev_entire_atmosphere_(considered_as_a_single_layer)": "on"}, "cwat", timeout_s,
    )


def fetch_latest_precip_3hr_grib2(timeout_s: int = 60) -> tuple[bytes, dt.datetime]:
    """
    Returns (grib2_bytes, issued_at) — GFS 3-hour accumulated precipitation
    (APCP, kg/m^2 = mm), Overlay: 3HPA. Unlike every other field here,
    APCP is an accumulation *over* a forecast window, not an instantaneous
    analysis value — it's exactly zero at f000 (the nowcast forecast hour
    every other fetch_latest_* function uses), so this one requests f003
    (the 0-3h accumulation window) instead, live-verified against the real
    .idx file (f000's index has no APCP entry at all; f003's does).
    """
    return _fetch_latest_field(
        {"var_APCP": "on", "lev_surface": "on"}, "precip_3hr", timeout_s, forecast_hour="f003",
    )
