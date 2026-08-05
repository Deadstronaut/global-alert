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
