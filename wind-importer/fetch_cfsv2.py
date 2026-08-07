"""
Fetches NOAA CFSv2 monthly-mean forecast GRIB2 fields (2m temperature,
precipitation rate) — spec 055 US2/US3 (1-month/3-month horizons),
research.md §2.

Uses the public `noaa-cfs-pds` S3 mirror (plain HTTPS GET, no auth, no
request-parameter filter service needed — unlike GFS's NOMADS filter CGI
in fetch_gfs.py) rather than nomads.ncep.noaa.gov directly; both are the
same free/public NOAA data, the S3 mirror's flat static-file layout is
just simpler to construct URLs for. Path/filename convention:
`cfs.{init_date}/{init_hour}/monthly_grib_{member}/pgbf.{member}.{init_date}{init_hour}.{valid_yyyymm}.avrg.grib.grb2`
(NOAA's own CFS documentation, cfs.ncep.noaa.gov/cfsv2/downloads.html).

Scope simplification (documented, not a bug — research.md §2/§3): this
fetches ensemble member '01' only from the single latest available
initialization, not a full multi-member/multi-initialization ensemble
mean. A true CFSv2 seasonal-skill product averages many members across a
rolling window of initializations; that is a substantially larger
data-engineering effort than this feature's free/no-API-key baseline
scope, and is called out here so a future spec can upgrade it without
re-deriving this decision.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import requests

CFSV2_S3_BASE_URL = "https://noaa-cfs-pds.s3.amazonaws.com"
CYCLE_HOURS = (0, 6, 12, 18)
MEMBER = "01"


@dataclass
class Cfsv2Cycle:
    """One CFSv2 model initialization (UTC)."""

    date: dt.date
    hour: int

    @property
    def issued_at(self) -> dt.datetime:
        return dt.datetime(self.date.year, self.date.month, self.date.day, self.hour, tzinfo=dt.timezone.utc)

    def monthly_mean_url(self, valid_year: int, valid_month: int) -> str:
        init_str = f"{self.date:%Y%m%d}{self.hour:02d}"
        valid_str = f"{valid_year:04d}{valid_month:02d}"
        return (
            f"{CFSV2_S3_BASE_URL}/cfs.{self.date:%Y%m%d}/{self.hour:02d}/monthly_grib_{MEMBER}/"
            f"pgbf.{MEMBER}.{init_str}.{valid_str}.avrg.grib.grb2"
        )


def latest_available_cycle(now: dt.datetime | None = None) -> Cfsv2Cycle:
    """Same 'most recent already-occurred cycle slot' logic as
    fetch_gfs.py's latest_available_cycle() — CFSv2 also initializes at
    00/06/12/18 UTC."""
    now = now or dt.datetime.now(dt.timezone.utc)
    candidate_hour = max(h for h in CYCLE_HOURS if h <= now.hour)
    return Cfsv2Cycle(date=now.date(), hour=candidate_hour)


def previous_cycle(cycle: Cfsv2Cycle) -> Cfsv2Cycle:
    idx = CYCLE_HOURS.index(cycle.hour)
    if idx > 0:
        return Cfsv2Cycle(date=cycle.date, hour=CYCLE_HOURS[idx - 1])
    return Cfsv2Cycle(date=cycle.date - dt.timedelta(days=1), hour=CYCLE_HOURS[-1])


def _target_valid_year_month(issued_at: dt.datetime, lead_months: int) -> tuple[int, int]:
    """The calendar (year, month) `lead_months` after `issued_at`'s own
    month — e.g. issued in 2026-08, lead_months=1 -> (2026, 9);
    lead_months=3 -> (2026, 11)."""
    total = issued_at.year * 12 + (issued_at.month - 1) + lead_months
    year, month0 = divmod(total, 12)
    return year, month0 + 1


def _download(cycle: Cfsv2Cycle, valid_year: int, valid_month: int, timeout_s: int) -> bytes:
    url = cycle.monthly_mean_url(valid_year, valid_month)
    response = requests.get(url, timeout=timeout_s)
    response.raise_for_status()
    body = response.content
    # Same "a real GRIB2 file always starts with the 4-byte magic" check
    # fetch_gfs.py's _download() uses — an S3 404 for a not-yet-published
    # cycle returns an XML error body, not these bytes.
    if body[:4] != b"GRIB":
        raise RuntimeError(f"S3 did not return a GRIB2 file for {url}")
    return body


# How many cycles back to search for a published monthly-mean file before
# giving up — live-verified 2026-08-06 against the real S3 mirror: for
# lead_months=1 the very latest cycle already has it, but for lead_months=3
# the two most recent cycles (today's 12Z and 06Z) 404'd while every cycle
# from today's 00Z backward through the prior two days succeeded. This is
# NOAA's own product-generation lag (a longer-lead monthly mean takes more
# wall-clock time to finish processing after initialization), NOT a sign
# the data doesn't exist — so unlike fetch_gfs.py's single-fallback retry
# (GFS has no such lag), this searches back up to 3 days (12 cycles) rather
# than just one step.
MAX_CYCLES_BACK = 12


def fetch_cfsv2_monthly_mean_grib2(lead_months: int, timeout_s: int = 120) -> tuple[bytes, dt.datetime, tuple[int, int]]:
    """
    Returns (grib2_bytes, issued_at, (valid_year, valid_month)).
    `lead_months` is 1 for the 1-month horizon (US2) or 3 for the 3-month
    horizon (US3) — the returned file contains both 2m temperature (TMP)
    and precipitation rate (PRATE) bands, read separately by the caller
    (same "one fetch covers every field this run needs" shape as
    fetch_gfs.py's fetch_latest_wet_bulb_inputs_grib2).

    Searches backward through recent cycles (MAX_CYCLES_BACK's own
    docstring explains why this needs more than a single fallback step)
    and returns the FIRST (i.e. most recent) cycle that has already
    published this lead's monthly mean — not necessarily the very latest
    cycle overall.
    """
    cycle = latest_available_cycle()
    valid_year, valid_month = _target_valid_year_month(cycle.issued_at, lead_months)
    errors: list[str] = []
    for _ in range(MAX_CYCLES_BACK):
        try:
            body = _download(cycle, valid_year, valid_month, timeout_s)
            return body, cycle.issued_at, (valid_year, valid_month)
        except (requests.RequestException, RuntimeError) as error:
            errors.append(f"{cycle.date:%Y%m%d}/{cycle.hour:02d} ({error})")
            cycle = previous_cycle(cycle)
    raise RuntimeError(
        f"Failed to fetch CFSv2 monthly-mean data for lead_months={lead_months} "
        f"after searching {MAX_CYCLES_BACK} cycles back: " + "; ".join(errors)
    )
