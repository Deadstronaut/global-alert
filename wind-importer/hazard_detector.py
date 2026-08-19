"""
Synthesizes discrete, alertable hazard events (dust_storm / heatwave /
coldwave) from the same gridded CAMS/GFS data wind-importer already fetches
for the Wind & Currents panel's visual "Overlay" texture layer.

Why this exists: overlay_texture.py's converters (netcdf_dust_aod_to_
overlay_texture, grib2_temperature_to_overlay_texture) read the field's raw
per-pixel numpy array only long enough to colorize it into a PNG, then
discard it — nothing about the actual dust/temperature VALUES at any point
survives past that. Neither this app's hazard pipeline (data_sources /
hazard_thresholds / the 9 original hazard tables) nor its Impact Analysis
tooling had any live source for these two hazards until now (see
20260818100000_dust_storm_heatwave_coldwave_hazards.sql's own header for the
full context).

Design: unlike this app's other hazard sources, which each report one
genuinely discrete physical event (an earthquake, a FIRMS wildfire hotspot),
dust/temperature are continuous global fields — there is no natural "one
event" to report. This module coarsens the field into a fixed lat/lng grid
of cells (COARSE_CELL_DEG wide) and reports ONE event per cell whose peak
value crosses that hazard's lowest configured severity breakpoint, at the
peak pixel's own coordinates — the same "only write cells that clear a
threshold" filtering DEM slope's landslide-susceptibility importer already
established as this codebase's precedent for grid-to-discrete-record
conversion (demSlopeAggregate.ts), just against a hazard_thresholds-backed
alertable event instead of a static exposure hexagon.

Severity is evaluated from the LIVE hazard_thresholds table (not a
hardcoded copy) so an admin's edit via HazardThresholdEditor.vue takes
effect on the next detector run with no code change/redeploy, matching the
"admin-configurable, not hardcoded" design of every other hazard type's
severity.
"""
from __future__ import annotations

import datetime as dt
import os
import sys
import uuid

import h3
import numpy as np
import requests
from osgeo import gdal

from flow_texture_common import resample_band_to_grid
from grib_to_texture import _band_by_grib_element

gdal.UseExceptions()

# Same resolution server/src/processors/normalizer.js's Node-side h3Id
# computation uses (H3_RESOLUTION there) — get_aggregated_disasters' hex/
# "Petek" mode groups by h3_id across every hazard table, so every writer
# must agree on one resolution or the same physical area would fragment
# into differently-sized cells depending on which pipeline wrote a given row.
H3_RESOLUTION = 7

# Coarse detection grid — 5 degrees (~550km at the equator). Wide enough
# that a real dust plume or heat-dome event (typically thousands of km
# across) is reported as a handful of events, not hundreds of near-duplicate
# adjacent-pixel ones; narrow enough that a genuinely regional event (e.g.
# heat over one country) still resolves as more than one point.
COARSE_CELL_DEG = 5.0

# Only cells whose peak clears the LOWEST configured breakpoint become an
# event at all — matches DEM slope's "steep-terrain zones, not slope
# everywhere" filtering; most of the globe on most days is simply not dusty
# or hot enough to be a hazard, and should produce zero rows, not a
# 'minimal'-severity row for every cell on Earth.


def _hazard_thresholds_url() -> str:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    return f"{base}/rest/v1/hazard_thresholds"


def fetch_breakpoints(hazard_type_code: str) -> list[dict]:
    """Live GET of one hazard type's breakpoints ([{min_value, severity}, ...],
    already sorted ascending per the DB's own validate_hazard_breakpoints
    trigger). Returns [] (never raises) if the table/row can't be reached —
    callers must treat that as "detection disabled this run", matching this
    importer's existing fail-loudly-but-don't-crash-the-whole-loop
    convention (main.py's scheduled-loop try/except)."""
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    base = os.environ.get("SUPABASE_URL", "")
    if not base or not key:
        print("[hazard_detector] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set, skipping detection", file=sys.stderr)
        return []
    try:
        res = requests.get(
            _hazard_thresholds_url(),
            params={"hazard_type_code": f"eq.{hazard_type_code}", "select": "breakpoints"},
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=30,
        )
        res.raise_for_status()
        rows = res.json()
        return rows[0]["breakpoints"] if rows else []
    except Exception as e:  # noqa: BLE001 - a threshold-fetch failure must not crash the whole overlay run (temperature/dust texture generation, which already succeeded, must still complete)
        print(f"[hazard_detector] Failed to fetch hazard_thresholds for {hazard_type_code!r}: {e}", file=sys.stderr)
        return []


def _severity_for_value(value: float, breakpoints: list[dict]) -> str | None:
    """Highest severity whose min_value <= value, or None if value doesn't
    even clear the lowest breakpoint (i.e. not a hazard at all right now)."""
    matched = None
    for bp in breakpoints:
        if value >= bp["min_value"]:
            matched = bp["severity"]
        else:
            break
    return matched


def _open_band_values(bytes_data: bytes, *, netcdf_subdataset: str | None, grib_element: str | None) -> tuple[np.ndarray, float, float, float, float]:
    """Opens either a CAMS NetCDF subdataset or a GFS GRIB2 element band
    (exactly one of netcdf_subdataset/grib_element must be given) and
    returns (values, west, north, east, south) — same GDAL access pattern
    and resample_band_to_grid() coarsening already used by
    overlay_texture.py's converters, duplicated here rather than shared
    because those functions return a colorized PNG, not the raw array."""
    is_netcdf = netcdf_subdataset is not None
    source_path = "/vsimem/hazard_detector_source." + ("nc" if is_netcdf else "grib2")
    gdal.FileFromMemBuffer(source_path, bytes_data)
    try:
        dataset = (
            gdal.Open(f'NETCDF:"{source_path}":{netcdf_subdataset}')
            if is_netcdf
            else gdal.Open(source_path)
        )
        if dataset is None:
            raise RuntimeError(f"GDAL could not open hazard_detector source ({netcdf_subdataset or grib_element!r})")

        band = _band_by_grib_element(dataset, grib_element) if grib_element else dataset.GetRasterBand(1)
        values = resample_band_to_grid(band, dataset)

        gt = dataset.GetGeoTransform()
        width, height = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]
        return values, west, north, east, south
    finally:
        gdal.Unlink(source_path)


def _coarse_peaks(values: np.ndarray, west: float, north: float, east: float, south: float) -> list[tuple[float, float, float]]:
    """Splits the equirectangular `values` grid into COARSE_CELL_DEG cells
    and returns (lat, lng, peak_value) for each cell's single highest pixel
    — the peak pixel's own coordinates, not the cell's geometric centroid,
    so the reported point is where the hazard actually peaks, not just
    "somewhere in this cell". NaN-only cells (e.g. a CAMS domain gap) are
    skipped. Longitude normalized into west/east's own [west, east) range —
    _unwrap_0_360_lon isn't needed here since we only need lat/lng per pixel,
    not a contiguous image to warp."""
    height, width = values.shape
    lon_span = east - west
    lat_span = north - south  # positive: row 0 is the north edge

    cell_cols = max(1, round((lon_span / COARSE_CELL_DEG)))
    cell_rows = max(1, round((lat_span / COARSE_CELL_DEG)))
    col_edges = np.linspace(0, width, cell_cols + 1, dtype=int)
    row_edges = np.linspace(0, height, cell_rows + 1, dtype=int)

    peaks: list[tuple[float, float, float]] = []
    for r0, r1 in zip(row_edges[:-1], row_edges[1:]):
        if r1 <= r0:
            continue
        for c0, c1 in zip(col_edges[:-1], col_edges[1:]):
            if c1 <= c0:
                continue
            block = values[r0:r1, c0:c1]
            if np.all(np.isnan(block)):
                continue
            flat_idx = np.nanargmax(block)
            local_row, local_col = np.unravel_index(flat_idx, block.shape)
            peak_value = float(block[local_row, local_col])
            row = r0 + local_row
            col = c0 + local_col
            lat = north - (row + 0.5) * (lat_span / height)
            lng = west + (col + 0.5) * (lon_span / width)
            # Normalize into [-180, 180) regardless of the source dataset's
            # own longitude convention (CAMS/GFS both commonly publish
            # 0-360) — this app's map/frontend expects [-180, 180].
            lng = ((lng + 180) % 360) - 180
            peaks.append((lat, lng, peak_value))
    return peaks


def _h3_id_for(lat: float, lng: float) -> str | None:
    """Same "compute at write time, leave null on failure rather than
    aborting the whole event" contract as normalizer.js's own try/except
    around latLngToCell — out-of-range coordinates (shouldn't happen here,
    _coarse_peaks() only ever derives lat/lng from a real dataset's own
    geotransform, but defend anyway) fall back to None rather than crash
    detection for every other cell in the same run."""
    try:
        return h3.latlng_to_cell(lat, lng, H3_RESOLUTION)
    except Exception:  # noqa: BLE001 - see docstring
        return None


def _hazard_row(hazard_type: str, lat: float, lng: float, magnitude: float, severity: str,
                 title: str, description: str, source: str, source_url: str, issued_at: dt.datetime) -> dict:
    """Same shape as server/src/output/supabaseWriter.js's mapToRow() for
    the generic `disaster` bucket table — Node-side ingestion writes this
    same field set for any hazard_type with no dedicated table, so a
    Python-side write here must match it exactly for the frontend's
    rowToEvent()/createDisasterEvent() to render it identically. h3_id is
    computed here (not left null for backfillH3.js to sweep up later) so
    get_aggregated_disasters' hex/"Petek" mode sees these events on the
    very next fetch, same as every other hazard type's live-ingested rows."""
    return {
        "id": f"{hazard_type}-{issued_at.strftime('%Y%m%d%H')}-{lat:.2f}-{lng:.2f}",
        "type": hazard_type,
        "lat": round(lat, 4),
        "lng": round(lng, 4),
        "h3_id": _h3_id_for(lat, lng),
        "severity": severity,
        "magnitude": round(magnitude, 3),
        "depth": 0,
        "title": title,
        "description": description,
        "time": issued_at.isoformat(),
        "source": source,
        "source_url": source_url,
        "country_code": None,
        "extra": {"detector": "wind-importer/hazard_detector.py"},
        "received_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def _write_hazard_rows(rows: list[dict]) -> None:
    """Upserts into the generic `disaster` table (no dedicated dust_storm/
    heatwave/coldwave table — see the migration header). on_conflict=id +
    merge-duplicates makes an accidental same-cycle retry idempotent instead
    of erroring on the PK, same x-upsert intent as _upload_texture()'s
    storage writes in main.py, just PostgREST's REST equivalent."""
    if not rows:
        return
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not base or not key:
        print("[hazard_detector] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set, cannot write hazard events", file=sys.stderr)
        return
    res = requests.post(
        f"{base}/rest/v1/disaster",
        params={"on_conflict": "id"},
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json=rows,
        timeout=60,
    )
    res.raise_for_status()


def detect_dust_storm_events(netcdf_bytes: bytes, issued_at: dt.datetime) -> int:
    """Reads the same CAMS dust_aerosol_optical_depth_550nm NetCDF bytes
    fetch_overlay_cams.fetch_latest_dust_aod_netcdf() already fetched for
    the Overlay texture, and writes one `disaster` row per coarse cell whose
    peak AOD clears the 'dust_storm' hazard type's lowest severity
    breakpoint. Returns the number of events written."""
    breakpoints = fetch_breakpoints("dust_storm")
    if not breakpoints:
        print("[hazard_detector] No dust_storm breakpoints configured, skipping detection")
        return 0

    values, west, north, east, south = _open_band_values(netcdf_bytes, netcdf_subdataset="duaod550", grib_element=None)
    rows = []
    for lat, lng, peak_aod in _coarse_peaks(values, west, north, east, south):
        severity = _severity_for_value(peak_aod, breakpoints)
        if severity is None:
            continue
        rows.append(_hazard_row(
            "dust_storm", lat, lng, peak_aod, severity,
            title=f"Dust Storm (AOD {peak_aod:.2f})",
            description=f"Dust aerosol optical depth @ 550nm: {peak_aod:.2f} (Copernicus CAMS, cycle {issued_at.isoformat()})",
            source="Copernicus CAMS", source_url="https://ads.atmosphere.copernicus.eu",
            issued_at=issued_at,
        ))
    _write_hazard_rows(rows)
    print(f"[hazard_detector] dust_storm: {len(rows)} event(s) written")
    return len(rows)


def detect_temperature_extreme_events(grib2_bytes: bytes, issued_at: dt.datetime) -> int:
    """Reads the same GFS 2m-temperature GRIB2 bytes fetch_gfs.
    fetch_latest_temperature_grib2() already fetched for the Overlay
    texture, and writes one `disaster` row per coarse cell for EACH of
    heatwave (peak temp_c) and coldwave (peak cold_index_c = -min temp_c)
    that clears its own hazard type's lowest breakpoint. A single run can
    produce both kinds of rows (a hot region and a cold region can coexist
    on the same global temperature field). Returns the total events written."""
    heat_breakpoints = fetch_breakpoints("heatwave")
    cold_breakpoints = fetch_breakpoints("coldwave")
    if not heat_breakpoints and not cold_breakpoints:
        print("[hazard_detector] No heatwave/coldwave breakpoints configured, skipping detection")
        return 0

    values, west, north, east, south = _open_band_values(grib2_bytes, netcdf_subdataset=None, grib_element="TMP")

    rows = []
    if heat_breakpoints:
        for lat, lng, peak_temp_c in _coarse_peaks(values, west, north, east, south):
            severity = _severity_for_value(peak_temp_c, heat_breakpoints)
            if severity is None:
                continue
            rows.append(_hazard_row(
                "heatwave", lat, lng, peak_temp_c, severity,
                title=f"Heatwave ({peak_temp_c:.1f}°C)",
                description=f"2m air temperature: {peak_temp_c:.1f}°C (NOAA GFS, cycle {issued_at.isoformat()})",
                source="NOAA GFS", source_url="https://nomads.ncep.noaa.gov",
                issued_at=issued_at,
            ))
    if cold_breakpoints:
        # _coarse_peaks() finds each cell's MAX — negate the field so its
        # "peak" becomes that cell's coldest point, then negate the reported
        # value back for a human-readable °C in the row.
        for lat, lng, peak_cold_index in _coarse_peaks(-values, west, north, east, south):
            # Antarctica (interior routinely -40..-70°C even in its own
            # summer) is EXCLUDED, not just given a high floor — live-
            # verified 2026-08-18: even after raising the floor well above
            # any real Northern-Hemisphere cold snap, Antarctica's own
            # ordinary climate would still trip it on literally every run,
            # forever. This isn't a genuine hazard to anyone (uninhabited),
            # so no absolute-temperature floor alone can distinguish "actual
            # cold wave" from "just Tuesday at the pole" — geographic
            # exclusion is the only correct fix, not a threshold tune.
            if lat < -60:
                continue
            severity = _severity_for_value(peak_cold_index, cold_breakpoints)
            if severity is None:
                continue
            actual_temp_c = -peak_cold_index
            rows.append(_hazard_row(
                "coldwave", lat, lng, peak_cold_index, severity,
                title=f"Coldwave ({actual_temp_c:.1f}°C)",
                description=f"2m air temperature: {actual_temp_c:.1f}°C (NOAA GFS, cycle {issued_at.isoformat()})",
                source="NOAA GFS", source_url="https://nomads.ncep.noaa.gov",
                issued_at=issued_at,
            ))

    _write_hazard_rows(rows)
    print(f"[hazard_detector] heatwave/coldwave: {len(rows)} event(s) written")
    return len(rows)
