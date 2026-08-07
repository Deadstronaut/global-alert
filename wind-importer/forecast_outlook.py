"""
Classifies a NOAA CFSv2 monthly-mean GRIB2 field into a per-region
below/near/above-normal outlook — spec 055 US2/US3, data-model.md's
ForecastOutlook entity.

Region geometry comes from the EXISTING country_boundaries table
(supabase/migrations/20260705_country_boundaries.sql) — the same
GeoJSON-FeatureCollection-per-country data that already powers the
"sadece bölgemi göster" map filter and CAP dispatch's region dropdown
(spec 015). No new region/geometry table is introduced, matching
spec 055's Assumption that forecast region selection reuses the existing
region concept.

Climatology reference (research.md §3): a small, static, latitude-band
table of typical monthly precipitation/temperature — NOT a per-region,
per-month historical normal (that would require ingesting a multi-decade
reforecast dataset, out of proportion for this feature's baseline). This
is a documented, disclosed simplification: the classification answers
"wetter/warmer or drier/colder than a typical month for this climate
zone", not "wetter/warmer than THIS exact place's own historical August".
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
import requests
from osgeo import gdal

gdal.UseExceptions()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# (GRIB_ELEMENT, GRIB_SHORT_NAME) pairs — live-verified 2026-08-06 against a
# real pgbf monthly-mean file (spec 055, see fetch_cfsv2.py): this product
# has NO plain 2m-surface temperature band (its TMP element repeats at ~50
# different isobaric levels, e.g. '100-ISBL' for 100mb/~16km altitude) — the
# closest near-surface proxy is TMP at the lowest sigma level ('0.995-SIGL',
# roughly the bottom few tens of meters of the atmosphere), which is why a
# level qualifier is required here, unlike fetch_gfs.py's GFS fields which
# only ever have one unambiguous 'TMP' band per file. Precipitation is
# 'APCP01m' — GDAL reports its unit as kg/(m^2) (= mm), but live-sampled
# values (2026-08-06: Amazon basin ~3.0, Jakarta ~0.3, Sahara/Istanbul
# ~0.06) are ~30x too small to be a full-month accumulation and instead
# match a plausible AVERAGE DAILY rate in mm/day (Amazon ~3mm/day is
# realistic; a full month would be ~90mm). Treated as mm/day here — the
# climatology table below is authored in the same unit accordingly.
GRIB_FIELD_BY_VARIABLE = {
    "temperature": ("TMP", "0.995-SIGL"),
    "precipitation": ("APCP01m", "0-SFC"),
}


@dataclass
class RegionCentroid:
    country_code: str
    region_code: str
    lat: float
    lng: float


def _walk_coordinates(coordinates, lats: list[float], lngs: list[float]) -> None:
    if not coordinates:
        return
    if isinstance(coordinates[0], (int, float)):
        lngs.append(coordinates[0])
        lats.append(coordinates[1])
    else:
        for item in coordinates:
            _walk_coordinates(item, lats, lngs)


def polygon_centroid_approx(geometry: dict | None) -> tuple[float, float] | None:
    """
    Vertex-average centroid (NOT area-weighted) of a GeoJSON
    Polygon/MultiPolygon geometry — adequate for placing one sample point
    inside a region against CFSv2's own coarse (~200km) native grid, where
    sub-degree centroid precision doesn't change which grid cell gets
    sampled anyway. Returns None for anything else (missing geometry, a
    Point-only boundary upload, empty coordinates).
    """
    if not geometry or geometry.get("type") not in ("Polygon", "MultiPolygon"):
        return None
    lats: list[float] = []
    lngs: list[float] = []
    _walk_coordinates(geometry.get("coordinates"), lats, lngs)
    if not lats:
        return None
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


def list_region_centroids(country_code: str | None = None) -> list[RegionCentroid]:
    """
    Fetches every served country's country_boundaries row and resolves one
    centroid per named region feature — this IS "which regions does this
    deployment serve" for forecast purposes, no separate registry needed.
    Service-role key bypasses country_boundaries' per-country RLS (same as
    every other importer's write access to its own tables).
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, cannot list regions")
    url = f"{SUPABASE_URL}/rest/v1/country_boundaries?select=country_code,name_property,geojson"
    if country_code:
        url += f"&country_code=eq.{country_code}"
    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}", "apikey": SUPABASE_SERVICE_ROLE_KEY},
        timeout=30,
    )
    response.raise_for_status()
    centroids: list[RegionCentroid] = []
    for row in response.json():
        name_property = row["name_property"]
        for feature in row["geojson"].get("features", []):
            region_code = feature.get("properties", {}).get(name_property)
            centroid = polygon_centroid_approx(feature.get("geometry"))
            if region_code and centroid:
                centroids.append(RegionCentroid(row["country_code"], region_code, centroid[0], centroid[1]))
    return centroids


@dataclass
class VariableGrid:
    """One fully-decoded GRIB2 band, ready for repeated point sampling —
    see open_variable_grid's own docstring for why this exists as a
    separate step from sampling."""

    values: np.ndarray
    geotransform: tuple
    width: int
    height: int


def open_variable_grid(grib2_bytes: bytes, variable: str) -> VariableGrid:
    """
    Opens the CFSv2 file and decodes ONE variable's band into memory once —
    live-verified 2026-08-06 that a naive "reopen the whole ~24MB, 524-band
    GRIB2 file with GDAL per region" design (an earlier version of this
    module) made a real deployment's 1195-region classification pass take
    many minutes just in GDAL overhead, on top of the network-request count
    problem main.py's OUTLOOK_INSERT_CHUNK_SIZE addresses separately. The
    caller opens this ONCE per variable and reuses it for every region via
    sample_grid_at_point, instead of once per (variable, region) pair.
    """
    grib_element, grib_level = GRIB_FIELD_BY_VARIABLE[variable]
    source_path = "/vsimem/cfsv2_outlook_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched CFSv2 GRIB2 data")

        band = None
        for band_index in range(1, dataset.RasterCount + 1):
            candidate = dataset.GetRasterBand(band_index)
            if (
                candidate.GetMetadataItem("GRIB_ELEMENT") == grib_element
                and candidate.GetMetadataItem("GRIB_SHORT_NAME") == grib_level
            ):
                band = candidate
                break
        if band is None:
            raise RuntimeError(
                f"No GRIB2 band with GRIB_ELEMENT={grib_element!r}, GRIB_SHORT_NAME={grib_level!r} "
                f"found (dataset has {dataset.RasterCount} bands)"
            )

        return VariableGrid(
            values=band.ReadAsArray(),
            geotransform=dataset.GetGeoTransform(),
            width=dataset.RasterXSize,
            height=dataset.RasterYSize,
        )
    finally:
        gdal.Unlink(source_path)


def sample_grid_at_point(grid: VariableGrid, lat: float, lng: float) -> float:
    """
    Nearest-grid-cell value at (lat, lng) from an already-decoded
    VariableGrid — no interpolation, matching CFSv2's own coarse
    resolution where interpolating between cells implies more precision
    than the model actually has. Pure in-memory array indexing, no GDAL
    call — this is what makes sampling 1000+ regions fast once
    open_variable_grid has decoded the band a single time.
    """
    gt = grid.geotransform
    # CFS's raw grid uses 0-360 longitude (same convention as GFS's own
    # raw grid before GDAL/warp normalization elsewhere in this repo).
    lng_0_360 = lng if lng >= 0 else lng + 360
    px = int((lng_0_360 - gt[0]) / gt[1])
    py = int((lat - gt[3]) / gt[5])
    px = min(max(px, 0), grid.width - 1)
    py = min(max(py, 0), grid.height - 1)
    return float(grid.values[py, px])


# Latitude-band climatology reference (research.md §3) — coarse, static,
# not per-region. (mean, spread) per variable; "near normal" is
# mean +/- spread. Precipitation in mm/day (APCP01m's own header comment
# above — an average daily rate, not a month total). Temperature in
# Celsius (TMP is delivered in Celsius by NOAA's CFS GRIB2, same convention
# fetch_gfs.py already relies on for GFS's own TMP field).
CLIMATOLOGY_BY_LATITUDE_BAND = {
    # (min_abs_lat, max_abs_lat): {variable: (mean, spread)}
    "tropical": (0, 15, {
        "precipitation": (5.0, 2.5),
        "temperature": (26.0, 3.0),
    }),
    "subtropical": (15, 35, {
        "precipitation": (2.3, 1.7),
        "temperature": (20.0, 6.0),
    }),
    "temperate": (35, 55, {
        "precipitation": (2.0, 1.2),
        "temperature": (12.0, 8.0),
    }),
    "polar": (55, 90, {
        "precipitation": (1.2, 0.8),
        "temperature": (-5.0, 10.0),
    }),
}


def climatology_for(variable: str, lat: float) -> tuple[float, float]:
    abs_lat = min(abs(lat), 90.0)
    for _band_name, (lo, hi, table) in CLIMATOLOGY_BY_LATITUDE_BAND.items():
        if lo <= abs_lat <= hi:
            return table[variable]
    return CLIMATOLOGY_BY_LATITUDE_BAND["polar"][2][variable]  # bands cover 0-90 inclusive; unreachable in practice


def classify_tercile(value: float, climatology_mean: float, climatology_spread: float) -> str:
    """below_normal / near_normal / above_normal (research.md §3)."""
    if value < climatology_mean - climatology_spread:
        return "below_normal"
    if value > climatology_mean + climatology_spread:
        return "above_normal"
    return "near_normal"


def classify_region(grid: VariableGrid, variable: str, region: RegionCentroid) -> str:
    """Sample -> classify, for one region against an already-opened
    VariableGrid (open_variable_grid) — callers open the grid once per
    variable and loop regions against it, not once per region."""
    value = sample_grid_at_point(grid, region.lat, region.lng)
    mean, spread = climatology_for(variable, region.lat)
    return classify_tercile(value, mean, spread)
