"""
Colors a CAMS PM2.5 concentration field into a pre-colored RGBA PNG overlay
— spec 054 US2, research.md §4. Mirrors src/utils/exposureLayerColor.js's
quantile-bucket ramp technique (same "equal population per bucket, not
equal value range" reasoning for a right-skewed field) in Python instead of
JS, since coloring happens server-side here rather than in a MapLibre paint
expression — no code-sharing possible across the language boundary, but the
visual technique matches this app's existing gridded-metric convention.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from osgeo import gdal
from PIL import Image

from flow_texture_common import resample_band_to_grid
from grib_to_texture import _band_by_grib_element

gdal.UseExceptions()

# WHO/EPA-style air-quality progression: green (clean) -> yellow -> orange
# -> red -> purple (hazardous) — the conventional PM2.5 color language,
# deliberately distinct from this app's existing rainfall/drought ramps
# (exposureLayerColor.js's GRID_METRIC_RAMPS) so air quality doesn't read
# as "just another blue-ish gridded metric."
PM25_RAMP = [
    (0, 228, 0),     # good
    (255, 255, 0),   # moderate
    (255, 126, 0),   # unhealthy for sensitive groups
    (255, 0, 0),     # unhealthy
    (126, 0, 35),    # very unhealthy / hazardous
]


# earth.nullschool.net's own Temp overlay color ramp — live-extracted
# 2026-08-05 by sampling that site's colorbar canvas pixel-by-pixel (12
# evenly-spaced stops across its rendered gradient), not guessed, so this
# app's Temp overlay reads identically to the reference tool the user is
# matching against.
TEMP_RAMP = [
    (0x25, 0x04, 0x2a), (0x29, 0x0a, 0x7d), (0x4d, 0x25, 0x30), (0xa7, 0x26, 0x7c),
    (0x8f, 0x6d, 0xb0), (0x4a, 0xd0, 0xd5), (0x27, 0x83, 0xc5), (0x51, 0xa2, 0x1a),
    (0xf6, 0xf7, 0x39), (0xe9, 0x7f, 0x1d), (0xbd, 0x3a, 0x2f), (0x58, 0x1b, 0x43),
]
# Fixed absolute-value domain (not data-min/max like PM25_RAMP's quantile
# buckets) — matches how the reference tool's own Temp scale reads: the
# same color always means the same temperature run to run, so a viewer can
# compare today's map to yesterday's at a glance. Generously covers
# real-world 2m air temperature extremes (coldest Antarctic records sit
# well above -60°C at 2m rather than the surface-level record lows).
TEMP_DOMAIN_C = (-60.0, 50.0)


def colorize_linear(values: np.ndarray, ramp: list[tuple[int, int, int]], lo: float, hi: float) -> np.ndarray:
    """Linear interpolation across `ramp`'s stops over the fixed [lo, hi]
    domain — distinct from colorize_quantile's equal-population buckets,
    used instead whenever the reference tool's own scale is a fixed
    absolute-value gradient rather than a data-relative one (e.g. Temp).
    Alpha=0 for NaN cells, same "no data = fully transparent" convention."""
    height, width = values.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    finite_mask = np.isfinite(values)

    span = hi - lo
    t = np.clip((values - lo) / span, 0.0, 1.0) if span > 1e-9 else np.zeros_like(values)
    scaled = t * (len(ramp) - 1)
    idx = np.clip(scaled.astype(np.int32), 0, len(ramp) - 2)
    frac = (scaled - idx)[..., None]

    ramp_arr = np.array(ramp, dtype=np.float64)
    lower = ramp_arr[idx]
    upper = ramp_arr[idx + 1]
    interpolated = lower + (upper - lower) * frac

    rgba[..., 0:3] = np.where(finite_mask[..., None], interpolated, 0).astype(np.uint8)
    rgba[..., 3] = np.where(finite_mask, 255, 0).astype(np.uint8)
    return rgba


@dataclass
class OverlayTexture:
    png_bytes: bytes
    value_min: float
    value_max: float
    bounds: tuple[float, float, float, float]


def _quantile_breakpoints(values: np.ndarray, steps: int) -> list[float]:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return []
    unique_sorted = np.unique(finite)
    if unique_sorted.size == 1:
        return []
    return [float(np.quantile(unique_sorted, i / steps)) for i in range(1, steps)]


def colorize_quantile(values: np.ndarray, ramp: list[tuple[int, int, int]]) -> np.ndarray:
    """values: 2D array (may contain NaN for nodata/no-coverage). Returns an
    RGBA uint8 array — alpha=0 for NaN cells (fully transparent, not drawn),
    matching how a MapLibre raster layer should render "no data" as nothing
    rather than a misleading flat color."""
    breakpoints = _quantile_breakpoints(values, len(ramp))
    height, width = values.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    finite_mask = np.isfinite(values)

    if not breakpoints:
        # No spread (uniform or empty field) — mid-ramp color everywhere
        # finite, matching exposureLayerColor.js's gridMetricFillExpression
        # fallback for the same case.
        mid = ramp[len(ramp) // 2]
        rgba[finite_mask, 0:3] = mid
        rgba[finite_mask, 3] = 255
        return rgba

    bucket = np.zeros_like(values, dtype=np.int32)
    for bp in breakpoints:
        bucket += (values >= bp).astype(np.int32)
    bucket = np.clip(bucket, 0, len(ramp) - 1)

    for i, color in enumerate(ramp):
        mask = finite_mask & (bucket == i)
        rgba[mask, 0:3] = color
        rgba[mask, 3] = 255

    return rgba


def netcdf_pm25_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    """
    Raises RuntimeError on anything GDAL can't open/read, same "fail
    loudly" convention as the wind/currents/wave conversions.

    NetCDF subdataset variable name ('pm2p5') and units live-verified
    2026-08-05 via gdalinfo against a real downloaded CAMS file: GRIB_units
    / units = 'kg m**-3' (mass concentration), NOT the µg/m³ PM2.5 is
    conventionally reported in — real observed range on that file was
    ~1.9e-13 to 1.1e-6 kg/m³. Converted to µg/m³ (×1e9) below so
    value_min/value_max read as normal PM2.5 numbers (single/low-triple
    digits) in the frontend legend instead of a string of leading zeros.
    """
    source_path = "/vsimem/overlay_source.nc"
    gdal.FileFromMemBuffer(source_path, netcdf_bytes)
    try:
        dataset = gdal.Open(f'NETCDF:"{source_path}":pm2p5')
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched CAMS PM2.5 NetCDF (expected a 'pm2p5' subdataset)")

        band = dataset.GetRasterBand(1)
        values = resample_band_to_grid(band, dataset) * 1e9  # kg/m^3 -> ug/m^3

        value_min = float(np.nanmin(values))
        value_max = float(np.nanmax(values))
        rgba = colorize_quantile(values, PM25_RAMP)

        buffer = io.BytesIO()
        Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")

        gt = dataset.GetGeoTransform()
        width, height = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]

        return OverlayTexture(
            png_bytes=buffer.getvalue(),
            value_min=value_min, value_max=value_max,
            bounds=(west, south, east, north),
        )
    finally:
        gdal.Unlink(source_path)


def grib2_temperature_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """
    GFS 2m air temperature (TMP) -> the Overlay: Temp field — spec 054
    follow-up, 2026-08-05. Same GDAL GRIB2 access pattern as
    grib_to_texture.py's wind conversion (band selected by GRIB_ELEMENT
    metadata), but colored with colorize_linear's fixed absolute-value
    scale instead of build_flow_texture's vector encoding, since this is a
    scalar overlay, not an animated particle field.
    """
    source_path = "/vsimem/temp_overlay_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched GFS temperature GRIB2 data")

        band = _band_by_grib_element(dataset, "TMP")
        # NOMADS' filter_gfs_0p25.pl TMP band is already Celsius (GRIB_UNIT
        # metadata reads "[C]", not the raw GRIB2 Kelvin one might expect) —
        # live-verified 2026-08-05: converting as if it were Kelvin produced
        # impossible ~-300°C values. No unit conversion needed here.
        values_c = resample_band_to_grid(band, dataset)

        value_min = float(np.nanmin(values_c))
        value_max = float(np.nanmax(values_c))
        rgba = colorize_linear(values_c, TEMP_RAMP, *TEMP_DOMAIN_C)

        buffer = io.BytesIO()
        Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")

        gt = dataset.GetGeoTransform()
        width, height = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]

        return OverlayTexture(
            png_bytes=buffer.getvalue(),
            value_min=value_min, value_max=value_max,
            bounds=(west, south, east, north),
        )
    finally:
        gdal.Unlink(source_path)
