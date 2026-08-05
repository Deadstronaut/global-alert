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
import math
from dataclasses import dataclass

import numpy as np
from osgeo import gdal
from PIL import Image

from flow_texture_common import resample_band_to_grid
from grib_to_texture import _band_by_grib_element

gdal.UseExceptions()

# Matches src/utils/windLayerData.js's own WEB_MERCATOR_MAX_LAT exactly —
# the standard Web Mercator projection limit (where the projected world
# becomes a square), both files clamp/warp to this same value so frontend
# and backend never disagree about where the overlay's edges are.
WEB_MERCATOR_MAX_LAT = 85.0511287798


def _mercator_y(lat_deg: float) -> float:
    """Normalized Web Mercator y in [0,1]-ish (0 near the north pole, 1
    near the south) — same formula as simple-wind-layer.js's
    lngLatToMercator(), duplicated here in Python since GDAL/wind-importer
    has no JS interop."""
    lat_rad = math.radians(lat_deg)
    sin_lat = math.sin(lat_rad)
    return 0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)


def warp_equirect_rgba_to_web_mercator(rgba: np.ndarray, source_south: float, source_north: float) -> np.ndarray:
    """
    Row-remaps an equirectangular (plate carrée — uniform degrees per
    pixel row, what resample_band_to_grid produces) RGBA image into Web
    Mercator's own vertical spacing, output always spanning the fixed
    [-WEB_MERCATOR_MAX_LAT, +WEB_MERCATOR_MAX_LAT] domain.

    Why this is needed at all (live-debugged via user screenshot,
    2026-08-06): MapLibre's `image` source places a texture by linearly
    interpolating between its four given lng/lat corners, in *Mercator*
    screen space — it does not know or care that the source pixel rows
    are evenly spaced in *latitude* instead. Handing it an unwarped
    equirectangular image made high-latitude content (Russia) read as
    pushed further north than it should, and low/mid-latitude content
    (Africa) read as stretched further south — a real geometric distortion,
    not a resolution/scaling complaint. SimpleWindLayer's particles never
    had this problem because they project each point's own lng/lat to
    Mercator individually (lngLatToMercator) rather than relying on a
    single linearly-interpolated quad.

    Only the vertical (latitude) axis needs remapping — longitude maps
    identically in both projections (both are simply linear in longitude),
    so this is a per-row resample, not a full 2D reprojection: for each
    output row, compute which latitude that row's Mercator-y position
    corresponds to, then pick (nearest-neighbor) the closest source row
    for that latitude.
    """
    height, width = rgba.shape[:2]
    merc_north = _mercator_y(WEB_MERCATOR_MAX_LAT)
    merc_south = _mercator_y(-WEB_MERCATOR_MAX_LAT)
    out_row_frac = np.arange(height) / (height - 1)
    merc_y = merc_north + out_row_frac * (merc_south - merc_north)
    # Inverse of _mercator_y: solve y = 0.5 - ln((1+sin(lat))/(1-sin(lat)))/(4*pi) for lat.
    a = (0.5 - merc_y) * 4 * np.pi
    lat = np.degrees(np.arcsin(np.tanh(a / 2)))

    src_row_frac = (source_north - lat) / (source_north - source_south) * (height - 1)
    src_row = np.clip(np.round(src_row_frac).astype(np.int64), 0, height - 1)
    return rgba[src_row]

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

# The rest of Air mode's "easy" GFS-native Overlay fields (spec 054
# follow-up, 2026-08-05) — same live-extraction-not-guessing standard as
# TEMP_RAMP above, one 12-stop ramp per field, sampled from
# earth.nullschool.net's own colorbar for that field. Domains are this
# app's own choice (nullschool doesn't expose its numeric colorbar bounds
# in the DOM) picked to cover realistic real-world ranges for each field.
RH_RAMP = [
    (0xe6, 0xa5, 0x1e), (0xbe, 0x8e, 0x35), (0x96, 0x76, 0x4d), (0x73, 0x60, 0x5f),
    (0x5e, 0x52, 0x5e), (0x49, 0x43, 0x5d), (0x35, 0x35, 0x5c), (0x23, 0x24, 0x76),
    (0x18, 0x12, 0xb2), (0x2e, 0x24, 0xd4), (0x46, 0x52, 0xed), (0x19, 0xff, 0xff),
]
RH_DOMAIN_PCT = (0.0, 100.0)

MSLP_RAMP = [
    (0x28, 0x00, 0x00), (0x61, 0x17, 0x0c), (0x9c, 0x2f, 0x18), (0xa9, 0x32, 0x1f),
    (0x78, 0x1c, 0x20), (0x18, 0x03, 0x2a), (0x19, 0x01, 0x41), (0x22, 0x01, 0x59),
    (0xf0, 0xfd, 0x25), (0xe7, 0xf8, 0xb2), (0xef, 0xfa, 0xec), (0xff, 0xff, 0xff),
]
# Live-verified range 2026-08-05: a real global GFS cycle spanned
# 944.93-1075.78 hPa (a deep low + a strong high both present somewhere on
# Earth at once) — widened slightly beyond that observed range so neither
# extreme sits pinned at the very end of the ramp.
MSLP_DOMAIN_HPA = (940.0, 1080.0)

CAPE_RAMP = [
    (0x05, 0x30, 0x61), (0x1e, 0x61, 0xa5), (0x3d, 0x8b, 0xbf), (0x7c, 0xb7, 0xd6),
    (0xb9, 0xd9, 0xe9), (0xe6, 0xef, 0xf4), (0xfa, 0xea, 0xe1), (0xfa, 0xc6, 0xad),
    (0xec, 0x92, 0x73), (0xd0, 0x53, 0x47), (0xaa, 0x16, 0x2a), (0x67, 0x00, 0x1f),
]
CAPE_DOMAIN_JKG = (0.0, 5000.0)

TPW_RAMP = [
    (0xe6, 0xa5, 0x1e), (0xa1, 0x7c, 0x47), (0x62, 0x55, 0x5e), (0x30, 0x31, 0x5c),
    (0x1e, 0x1b, 0x92), (0x1f, 0x16, 0xc9), (0x41, 0x36, 0xe3), (0x3f, 0x6b, 0xf0),
    (0x30, 0xa8, 0xf6), (0x20, 0xe4, 0xfc), (0x47, 0xff, 0xff), (0x96, 0xff, 0xff),
]
# Live-verified range 2026-08-05: real global max was 87.54mm (deep
# tropical moisture) — widened past 70mm to avoid clipping that.
TPW_DOMAIN_MM = (0.0, 90.0)

TCW_RAMP = [
    (0x05, 0x05, 0x59), (0x4f, 0x4f, 0x99), (0x9b, 0x9b, 0xd9), (0xb2, 0xb2, 0xe8),
    (0xbb, 0xbb, 0xeb), (0xc5, 0xc5, 0xee), (0xcf, 0xcf, 0xf1), (0xd8, 0xd8, 0xf4),
    (0xe2, 0xe2, 0xf6), (0xec, 0xec, 0xf9), (0xf5, 0xf5, 0xfc), (0xff, 0xff, 0xff),
]
# Live-verified range 2026-08-05: real global max was 3.34 kg/m^2 (dense
# convective cloud) — the initial 0-1.5 guess clipped that badly.
TCW_DOMAIN_KGM2 = (0.0, 4.0)

PRECIP_3HR_RAMP = [
    (0x25, 0x4f, 0x5c), (0x3e, 0x3a, 0xac), (0x87, 0x00, 0x97), (0xc6, 0x00, 0x85),
    (0xf2, 0x00, 0x6b), (0xff, 0x53, 0x4c), (0xff, 0x8e, 0x2b), (0xff, 0xc6, 0x00),
    (0xff, 0xdd, 0x15), (0xff, 0xe7, 0x27), (0xff, 0xf1, 0x35), (0xff, 0xfb, 0x41),
]
PRECIP_3HR_DOMAIN_MM = (0.0, 50.0)


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

        gt = dataset.GetGeoTransform()
        width, height = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]
        rgba = warp_equirect_rgba_to_web_mercator(rgba, south, north)

        buffer = io.BytesIO()
        Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")

        return OverlayTexture(
            png_bytes=buffer.getvalue(),
            value_min=value_min, value_max=value_max,
            bounds=(west, -WEB_MERCATOR_MAX_LAT, east, WEB_MERCATOR_MAX_LAT),
        )
    finally:
        gdal.Unlink(source_path)


def grib2_scalar_to_overlay_texture(
    grib2_bytes: bytes,
    grib_element: str,
    ramp: list[tuple[int, int, int]],
    domain: tuple[float, float],
    transform=None,
) -> OverlayTexture:
    """
    Generic GFS scalar-field -> pre-colored Overlay texture, shared by
    Temp/RH/MSLP/CAPE/TPW/TCW/precip (spec 054 follow-up, 2026-08-05) —
    each is a single-band GRIB2 field colored with colorize_linear's
    fixed absolute-value scale, differing only in which GRIB_ELEMENT band
    to read and what color ramp/domain/unit conversion applies. Same GDAL
    GRIB2 access pattern as grib_to_texture.py's wind conversion (band
    selected by GRIB_ELEMENT metadata).
    `transform`, if given, is applied to the raw resampled array before
    colorizing (e.g. Pa -> hPa for MSLP) — None means use the band's
    values as-is (e.g. Temp, already Celsius per NOMADS' own GRIB_UNIT
    metadata, live-verified 2026-08-05).
    """
    source_path = "/vsimem/scalar_overlay_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError(f"GDAL could not open the fetched GFS {grib_element} GRIB2 data")

        band = _band_by_grib_element(dataset, grib_element)
        values = resample_band_to_grid(band, dataset)
        if transform is not None:
            values = transform(values)

        value_min = float(np.nanmin(values))
        value_max = float(np.nanmax(values))
        rgba = colorize_linear(values, ramp, *domain)

        gt = dataset.GetGeoTransform()
        width, height = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]
        rgba = warp_equirect_rgba_to_web_mercator(rgba, south, north)

        buffer = io.BytesIO()
        Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")

        return OverlayTexture(
            png_bytes=buffer.getvalue(),
            value_min=value_min, value_max=value_max,
            bounds=(west, -WEB_MERCATOR_MAX_LAT, east, WEB_MERCATOR_MAX_LAT),
        )
    finally:
        gdal.Unlink(source_path)


def grib2_temperature_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS 2m air temperature (TMP) -> the Overlay: Temp field — spec 054 follow-up, 2026-08-05."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "TMP", TEMP_RAMP, TEMP_DOMAIN_C)


def grib2_relative_humidity_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS 2m relative humidity (RH, %) -> the Overlay: RH field."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "RH", RH_RAMP, RH_DOMAIN_PCT)


def grib2_mslp_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS mean sea level pressure (PRMSL, Pa -> hPa) -> the Overlay: MSLP field."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "PRMSL", MSLP_RAMP, MSLP_DOMAIN_HPA, transform=lambda v: v / 100.0)


def grib2_cape_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS surface-based CAPE (J/kg) -> the Overlay: CAPE field."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "CAPE", CAPE_RAMP, CAPE_DOMAIN_JKG)


def grib2_pwat_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS total precipitable water (PWAT, kg/m^2 = mm) -> the Overlay: TPW field."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "PWAT", TPW_RAMP, TPW_DOMAIN_MM)


def grib2_cwat_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS total column cloud water (CWAT, kg/m^2) -> the Overlay: TCW field."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "CWAT", TCW_RAMP, TCW_DOMAIN_KGM2)


def grib2_precip_3hr_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """
    GFS 3-hour accumulated precipitation (kg/m^2 = mm) -> the Overlay: 3HPA
    field. GDAL's GRIB_ELEMENT for this band is "APCP03" (the accumulation
    period baked into the element name), not plain "APCP" — live-verified
    2026-08-05 after an initial guess of "APCP" found zero matching bands
    (the f003 GRIB2 response has two identical APCP03 bands, an apparent
    GFS/NOMADS quirk of encoding the same field under two GRIB2 templates;
    _band_by_grib_element's first-match behavior picks either, harmless
    since they're identical).
    """
    return grib2_scalar_to_overlay_texture(grib2_bytes, "APCP03", PRECIP_3HR_RAMP, PRECIP_3HR_DOMAIN_MM)
