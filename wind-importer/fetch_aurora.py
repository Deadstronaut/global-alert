"""
Fetches the latest OVATION Prime aurora probability forecast from NOAA
SWPC — spec 054 follow-up, 2026-08-06: Space mode's Overlay: Aurora.

Unlike GFS (NOMADS) and CAMS (ADS/cdsapi), this is a small, plain public
JSON endpoint — no auth, no request/poll cycle, no GRIB/NetCDF parsing.
Live-verified 2026-08-06: a 360x181 grid (1-degree steps), longitude 0-359
(NOT -180..180 — reordered in aurora_json_to_grid below to match every
other importer's -180..179-ish west-to-east convention), latitude -90..90,
aurora value 0-100 (a probability-ish index, real-world observed range on
a geomagnetically quiet day was 0-24).
"""
from __future__ import annotations

import datetime as dt

import numpy as np
import requests

OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"

GRID_WIDTH = 360  # 1 degree/column, longitude 0-359
GRID_HEIGHT = 181  # 1 degree/row, latitude -90..90 inclusive


def fetch_latest_aurora_json(timeout_s: int = 30) -> tuple[bytes, dt.datetime]:
    """Returns (json_bytes, issued_at) — same (bytes, issued_at) shape
    every other fetch_latest_* function in this app returns, so main.py's
    dict-driven dispatch doesn't need a special case for this one despite
    the very different source format underneath."""
    response = requests.get(OVATION_URL, timeout=timeout_s)
    response.raise_for_status()
    payload = response.json()
    # "Observation Time" is when the underlying data was actually
    # measured — the closest analogue to every other field's issued_at
    # (a real-world nowcast timestamp), as opposed to "Forecast Time"
    # (OVATION Prime's own ~30-90min-ahead nowcast target).
    issued_at = dt.datetime.fromisoformat(payload["Observation Time"].replace("Z", "+00:00"))
    return response.content, issued_at


def aurora_json_to_grid(json_bytes: bytes) -> np.ndarray:
    """
    Parses the flat [lng, lat, value] coordinate list into a 2D grid
    matching this app's other importers' orientation: rows north-to-south
    (row 0 = north pole), columns west-to-east spanning roughly -180..179
    (NOT NOAA's own 0..359 raw longitude convention).

    NOAA's raw grid is ordered lon-major (lon 0 first, all latitudes, then
    lon 1, ...) with longitude 0..359 eastward from Greenwich — reordering
    columns via np.roll(shift=180) moves the column that was at raw
    longitude 180 (which represents app longitude -180) to column 0,
    ending with columns spanning app longitude -180..179 ascending, same
    as every GFS/CAMS grid this app already builds.
    """
    import json

    payload = json.loads(json_bytes)
    coords = payload["coordinates"]

    grid = np.zeros((GRID_HEIGHT, GRID_WIDTH), dtype=np.float64)
    for lng_raw, lat, value in coords:
        row = 90 - lat  # NOAA's own list starts at lat=-90; row 0 should be north (lat=90)
        grid[row, lng_raw] = value

    return np.roll(grid, shift=180, axis=1)
