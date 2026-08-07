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

from flow_texture_common import TEXTURE_HEIGHT, TEXTURE_WIDTH, resample_band_to_grid
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

# Height selector (spec 054 follow-up, 2026-08-06) — a single fixed domain
# doesn't work across all altitudes: stratospheric levels (70/10mb) never
# get anywhere near TEMP_DOMAIN_C's warm end, so every pixel up there would
# pin to the same coldest ramp color with no visible variation. Per-level
# domains live-verified 2026-08-06 against real global min/max at each
# level, widened a little past the observed range the same way TEMP_DOMAIN_C
# itself was.
TEMP_DOMAIN_BY_LEVEL_C = {
    "sfc": TEMP_DOMAIN_C,
    "1000": (-55.0, 50.0),
    "850": (-55.0, 40.0),
    "700": (-60.0, 30.0),
    "500": (-60.0, 15.0),
    "250": (-80.0, -15.0),
    "70": (-95.0, -30.0),
    "10": (-95.0, -25.0),
}

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

WBT_RAMP = [
    (0xe4, 0xec, 0xff), (0xe0, 0xea, 0xfe), (0xd5, 0xe1, 0xfd), (0xcc, 0xda, 0xfb),
    (0xc3, 0xd3, 0xf7), (0xb8, 0xc9, 0xf3), (0xac, 0xbe, 0xeb), (0x58, 0x72, 0xab),
    (0x39, 0x50, 0x8b), (0x3d, 0x34, 0x6f), (0xcf, 0x31, 0x58), (0xff, 0xff, 0xff),
]
# 35°C wet bulb is the widely-cited threshold beyond which the human body
# can no longer cool itself by sweating — capping the domain there (with a
# little headroom) keeps that threshold meaningfully visible in the color
# scale instead of buried mid-ramp the way a wider domain would bury it.
WBT_DOMAIN_C = (-20.0, 38.0)


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


def _unwrap_0_360_lon(values: np.ndarray, west: float, east: float) -> tuple[np.ndarray, float, float]:
    """
    CAMS's own NetCDF exports (via cdsapi's netcdf_zip format) use a 0..360
    longitude grid, NOT -180..180 like every other source in this pipeline
    (CMEMS, GFS, WAVEWATCH III, NOAA CRW) — confirmed 2026-08-06 (a known,
    documented CDS/ADS behavior, not guessed). Left unhandled, `west`/`east`
    stay 0/360, which the frontend's boundsToImageCoordinates() clamps to
    0/180 (its own longitude clamp is ±180) — squeezing the whole-globe
    image into just the map's eastern half at the wrong scale, with the
    western hemisphere missing entirely (live-testing finding: "kimyasalların
    harita resmi olarak oturmuyor").

    Only unwraps when the source actually looks like 0..360 (west roughly
    >= 0, east > 180) — every other converter in this module already uses
    -180..180 sources, so this is a no-op for them if ever reused. The
    tolerance on `west` is deliberately wide (-10, not -1e-3): live-verified
    2026-08-06 that a real downloaded CAMS grid's west edge was -0.2, not
    exactly 0 — a half-pixel-edge artifact of the same kind already
    documented elsewhere in this codebase (e.g. wind-importer's north=
    90.125). The original tight -1e-3 tolerance missed that by a wide
    margin and silently no-op'd on every CAMS overlay — the exact bug this
    whole function exists to fix, still showing up unfixed in the live
    "kimyasalların harita resmi olarak oturmuyor" report. A -180..180
    source's west is never anywhere close to -10 (that range only makes
    sense for the 0..360 case's own small negative edge slop), so this
    stays safe for both conventions.
    Rolling by exactly half the array's width converts 0..360 ordering to
    -180..180 ordering directly (self-inverse for an even width — see the
    call site's own reasoning), which is why this needs no separate GDAL
    reprojection step.
    """
    if west >= -10.0 and east > 180.0 + 1e-3:
        width = values.shape[1]
        values = np.roll(values, width // 2, axis=1)
        return values, -180.0, 180.0
    return values, west, east


def netcdf_pm_mass_to_overlay_texture(netcdf_bytes: bytes, subdataset_var: str) -> OverlayTexture:
    """
    Shared PM1/PM2.5/PM10 mass-concentration converter (spec 054 US2 +
    2026-08-06 follow-up) — all three CAMS particulate-mass fields share
    the same PM25_RAMP quantile-bucket coloring and the same kg/m^3 ->
    µg/m^3 unit conversion (units live-verified 2026-08-05 against a real
    downloaded CAMS PM2.5 file: GRIB_units = 'kg m**-3', NOT the µg/m³
    these are conventionally reported in). `subdataset_var` is the
    NetCDF's own internal variable name, which does NOT always match the
    CAMS request's `variable` string (e.g. PM2.5 -> 'pm2p5'; live-verified
    per-field in fetch_overlay_cams.py's own header comment).

    Raises RuntimeError on anything GDAL can't open/read, same "fail
    loudly" convention as the wind/currents/wave conversions.
    """
    source_path = "/vsimem/overlay_source.nc"
    gdal.FileFromMemBuffer(source_path, netcdf_bytes)
    try:
        dataset = gdal.Open(f'NETCDF:"{source_path}":{subdataset_var}')
        if dataset is None:
            raise RuntimeError(f"GDAL could not open the fetched CAMS NetCDF (expected a {subdataset_var!r} subdataset)")

        band = dataset.GetRasterBand(1)
        values = resample_band_to_grid(band, dataset) * 1e9  # kg/m^3 -> ug/m^3

        gt = dataset.GetGeoTransform()
        width, height = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]
        values, west, east = _unwrap_0_360_lon(values, west, east)

        value_min = float(np.nanmin(values))
        value_max = float(np.nanmax(values))
        rgba = colorize_quantile(values, PM25_RAMP)
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


def netcdf_pm25_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_pm_mass_to_overlay_texture(netcdf_bytes, "pm2p5")


def netcdf_pm1_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_pm_mass_to_overlay_texture(netcdf_bytes, "pm1")


def netcdf_pm10_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_pm_mass_to_overlay_texture(netcdf_bytes, "pm10")


# earth.nullschool.net's own DUex/OMaot/SO4ex color ramps — same live-
# extraction standard as every other ramp in this module. Aerosol optical
# depth is dimensionless (GRIB_units '~', live-verified 2026-08-06 — no
# unit conversion needed, unlike the PM mass fields above), so these use
# colorize_linear's fixed domain the same way Temp/CAPE/etc. do.
DUST_AOD_RAMP = [
    (0x04, 0x04, 0x04), (0x2b, 0x13, 0x26), (0x2c, 0x21, 0x71), (0x1b, 0x3e, 0x84),
    (0x04, 0x5f, 0x72), (0x00, 0x7f, 0x52), (0x00, 0x9d, 0x32), (0x40, 0xb5, 0x00),
    (0x99, 0xc4, 0x00), (0xda, 0xcd, 0x74), (0xf7, 0xe2, 0xd1), (0xff, 0xff, 0xff),
]
# Live-verified 2026-08-06: a real global cycle's max dust AOD was 1.28 —
# widened a bit past that so an unusually dusty day still leaves headroom.
DUST_AOD_DOMAIN = (0.0, 2.0)

ORGANIC_MATTER_AOD_RAMP = [
    (0x17, 0x4f, 0x7c), (0x90, 0xb5, 0xda), (0xdc, 0xe7, 0xf3), (0xfd, 0xe0, 0xcf),
    (0xec, 0xa7, 0x7b), (0xcb, 0x93, 0x57), (0xac, 0x7f, 0x34), (0x8c, 0x6b, 0x04),
    (0x78, 0x51, 0x1a), (0x65, 0x38, 0x24), (0x52, 0x1e, 0x2a), (0x3d, 0x00, 0x2d),
]
# Live-verified 2026-08-06: a real global cycle's max was 1.79, past the
# initial 0-1.0 guess — widened to avoid clipping that.
ORGANIC_MATTER_AOD_DOMAIN = (0.0, 2.0)

SULFATE_AOD_RAMP = [
    (0x00, 0x00, 0x00), (0x19, 0x12, 0x2b), (0x17, 0x35, 0x4c), (0x18, 0x5c, 0x48),
    (0x3b, 0x75, 0x33), (0x7e, 0x7a, 0x36), (0xbc, 0x79, 0x67), (0xd4, 0x86, 0xb1),
    (0xcb, 0xa8, 0xe6), (0xc1, 0xd2, 0xf3), (0xd6, 0xf0, 0xef), (0xff, 0xff, 0xff),
]
SULFATE_AOD_DOMAIN = (0.0, 1.0)


def netcdf_aod_to_overlay_texture(
    netcdf_bytes: bytes, subdataset_var: str, ramp: list[tuple[int, int, int]], domain: tuple[float, float],
) -> OverlayTexture:
    """Shared DUex/OMaot/SO4ex converter — same shape as
    netcdf_pm_mass_to_overlay_texture but with colorize_linear's fixed
    absolute-value domain and no unit conversion (AOD is dimensionless)."""
    source_path = "/vsimem/aod_overlay_source.nc"
    gdal.FileFromMemBuffer(source_path, netcdf_bytes)
    try:
        dataset = gdal.Open(f'NETCDF:"{source_path}":{subdataset_var}')
        if dataset is None:
            raise RuntimeError(f"GDAL could not open the fetched CAMS NetCDF (expected a {subdataset_var!r} subdataset)")

        band = dataset.GetRasterBand(1)
        values = resample_band_to_grid(band, dataset)

        gt = dataset.GetGeoTransform()
        width, height = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]
        values, west, east = _unwrap_0_360_lon(values, west, east)

        value_min = float(np.nanmin(values))
        value_max = float(np.nanmax(values))
        rgba = colorize_linear(values, ramp, *domain)
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


def netcdf_dust_aod_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_aod_to_overlay_texture(netcdf_bytes, "duaod550", DUST_AOD_RAMP, DUST_AOD_DOMAIN)


def netcdf_organic_matter_aod_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_aod_to_overlay_texture(netcdf_bytes, "omaod550", ORGANIC_MATTER_AOD_RAMP, ORGANIC_MATTER_AOD_DOMAIN)


def netcdf_sulfate_aod_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_aod_to_overlay_texture(netcdf_bytes, "suaod550", SULFATE_AOD_RAMP, SULFATE_AOD_DOMAIN)


# Chem mode (spec 054 follow-up, 2026-08-06) — CAMS reports CO/SO2/NO2 as
# mass mixing ratio (kg gas per kg air, live-verified 2026-08-06 via
# gdalinfo), not a directly readable air-quality unit. Converted to ppb
# (parts per billion by volume), the standard unit these gases are
# conventionally reported in, via the textbook mixing-ratio -> volume-
# ratio formula: ppb = mixing_ratio * (M_air / M_gas) * 1e9. Molar masses
# in g/mol (M_AIR is the standard dry-air mean; M_CO/M_SO2/M_NO2 are each
# gas's own molar mass) — a fixed physical constant per gas, not
# something to live-verify.
M_AIR_G_MOL = 28.9644
M_CO_G_MOL = 28.01
M_SO2_G_MOL = 64.066
M_NO2_G_MOL = 46.0055
M_CO2_G_MOL = 44.01


def mixing_ratio_to_ppb(values: np.ndarray, molar_mass_g_mol: float) -> np.ndarray:
    return values * (M_AIR_G_MOL / molar_mass_g_mol) * 1e9


def mixing_ratio_to_ppm(values: np.ndarray, molar_mass_g_mol: float) -> np.ndarray:
    """Same mixing-ratio -> volume-ratio conversion as mixing_ratio_to_ppb,
    just scaled to parts-per-MILLION — CO2's ~420ppm atmospheric background
    would be a meaningless 420,000 on CO/SO2/NO2's own ppb scale, so CO2sc
    uses the unit it's actually conventionally reported in instead."""
    return values * (M_AIR_G_MOL / molar_mass_g_mol) * 1e6


CO_RAMP = [
    (0x00, 0x26, 0x28), (0x97, 0xa4, 0x93), (0xf7, 0xee, 0xc7), (0xeb, 0xc2, 0x95),
    (0xe3, 0x91, 0x76), (0xd3, 0x5c, 0x6e), (0xb5, 0x24, 0x76), (0x78, 0x00, 0x88),
    (0x2f, 0x02, 0x87), (0x18, 0x09, 0x60), (0x16, 0x08, 0x31), (0x00, 0x00, 0x00),
]
# Live-verified 2026-08-06: a real global 1000mb cycle spanned ~40-3400ppb
# (background to a wildfire-plume-scale spike) — widened a bit past that.
CO_DOMAIN_PPB = (0.0, 3500.0)

SO2_RAMP = [
    (0x86, 0x86, 0x6b), (0x8c, 0x8c, 0x71), (0xa0, 0xa0, 0x84), (0xc5, 0xc5, 0xa8),
    (0xec, 0xec, 0xcd), (0xf3, 0xe5, 0xbf), (0xe3, 0xb1, 0x8b), (0xd1, 0x76, 0x6f),
    (0xb2, 0x3b, 0x6c), (0x7c, 0x05, 0x76), (0x1e, 0x05, 0x6f), (0x17, 0x14, 0x12),
]
# Live-verified 2026-08-06: real global max ~111ppb (volcanic/industrial-
# plume scale).
SO2_DOMAIN_PPB = (0.0, 130.0)

NO2_RAMP = [
    (0x1a, 0x1a, 0x1a), (0x49, 0x49, 0x49), (0x7c, 0x7c, 0x7c), (0xab, 0xab, 0xab),
    (0xd1, 0xd1, 0xd1), (0xf0, 0xef, 0xee), (0xfd, 0xed, 0xe3), (0xf9, 0xc6, 0xad),
    (0xea, 0x91, 0x74), (0xcf, 0x53, 0x49), (0xa6, 0x1b, 0x2c), (0x67, 0x00, 0x1f),
]
# Live-verified 2026-08-06: real global max ~59.4ppb (polluted-urban scale).
NO2_DOMAIN_PPB = (0.0, 70.0)


def netcdf_gas_to_overlay_texture(
    netcdf_bytes: bytes, subdataset_var: str, molar_mass_g_mol: float,
    ramp: list[tuple[int, int, int]], domain: tuple[float, float],
    unit_fn=mixing_ratio_to_ppb,
) -> OverlayTexture:
    """Shared CO/SO2/NO2/CO2 converter — same shape as netcdf_aod_to_overlay_texture
    but with a kg/kg -> volume-ratio conversion applied before colorizing.
    `unit_fn` defaults to ppb (CO/SO2/NO2's own convention); CO2sc passes
    mixing_ratio_to_ppm instead (see that function's own comment for why)."""
    source_path = "/vsimem/gas_overlay_source.nc"
    gdal.FileFromMemBuffer(source_path, netcdf_bytes)
    try:
        dataset = gdal.Open(f'NETCDF:"{source_path}":{subdataset_var}')
        if dataset is None:
            raise RuntimeError(f"GDAL could not open the fetched CAMS NetCDF (expected a {subdataset_var!r} subdataset)")

        band = dataset.GetRasterBand(1)
        values_converted = unit_fn(resample_band_to_grid(band, dataset), molar_mass_g_mol)

        gt = dataset.GetGeoTransform()
        width, height = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]
        values_converted, west, east = _unwrap_0_360_lon(values_converted, west, east)

        value_min = float(np.nanmin(values_converted))
        value_max = float(np.nanmax(values_converted))
        rgba = colorize_linear(values_converted, ramp, *domain)
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


def netcdf_co_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_gas_to_overlay_texture(netcdf_bytes, "co", M_CO_G_MOL, CO_RAMP, CO_DOMAIN_PPB)


def netcdf_so2_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_gas_to_overlay_texture(netcdf_bytes, "so2", M_SO2_G_MOL, SO2_RAMP, SO2_DOMAIN_PPB)


def netcdf_no2_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_gas_to_overlay_texture(netcdf_bytes, "no2", M_NO2_G_MOL, NO2_RAMP, NO2_DOMAIN_PPB)


# CO2sc (spec 054 follow-up, 2026-08-06 — see fetch_overlay_cams.py's own
# fetch_latest_co2_netcdf comment for the "this is the least-verified
# integration" caveat: NetCDF subdataset name assumed 'co2', not confirmed
# against a real downloaded file the way co/so2/no2's own subdataset names
# were). Background atmospheric CO2 is ~420ppm — domain widened a bit
# either side of that to show real variation (biogenic sources/sinks,
# combustion plumes) without the whole map reading as one flat color.
CO2_RAMP = [
    (0x08, 0x30, 0x6b), (0x2c, 0x7f, 0xb8), (0x74, 0xad, 0xd1), (0xd1, 0xe5, 0xf0),
    (0xf7, 0xf7, 0xf7), (0xfd, 0xe0, 0xc4), (0xf9, 0xb9, 0x82), (0xef, 0x8a, 0x62),
    (0xd6, 0x60, 0x4d), (0xb2, 0x18, 0x2b), (0x8b, 0x0f, 0x1c), (0x5c, 0x08, 0x10),
]
CO2_DOMAIN_PPM = (380.0, 460.0)


def netcdf_co2_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    return netcdf_gas_to_overlay_texture(
        netcdf_bytes, "co2", M_CO2_G_MOL, CO2_RAMP, CO2_DOMAIN_PPM, unit_fn=mixing_ratio_to_ppm,
    )


# Space mode (spec 054 follow-up, 2026-08-06) — earth.nullschool.net's own
# Aurora color ramp, same live-extraction standard as every other ramp.
AURORA_RAMP = [
    (0x00, 0x00, 0x00), (0x13, 0x23, 0x2b), (0x2a, 0x5d, 0x3f), (0x3c, 0x9d, 0x51),
    (0x4a, 0xe1, 0x61), (0x91, 0xff, 0x5c), (0xd8, 0xff, 0x48), (0xfd, 0xf0, 0x59),
    (0xfc, 0xcc, 0x8d), (0xf7, 0xa5, 0xb6), (0xec, 0x7c, 0xdc), (0xdb, 0x4b, 0xff),
]
# NOAA's OVATION Prime value is a 0-100 probability-ish index — kept at
# its full theoretical range (not the ~0-24 seen on a geomagnetically
# quiet day) so the color scale stays meaningful during an actual storm.
AURORA_DOMAIN = (0.0, 100.0)


def aurora_json_to_overlay_texture(json_bytes: bytes) -> OverlayTexture:
    """
    NOAA SWPC OVATION Prime JSON -> the Overlay: Aurora field. No GDAL
    involved (unlike every other converter in this module) — this source
    is a small flat JSON grid, not GRIB2/NetCDF, so fetch_aurora.py's own
    aurora_json_to_grid() does the parsing directly with plain numpy.
    """
    from fetch_aurora import aurora_json_to_grid

    values = aurora_json_to_grid(json_bytes)
    value_min = float(np.nanmin(values))
    value_max = float(np.nanmax(values))
    rgba = colorize_linear(values, AURORA_RAMP, *AURORA_DOMAIN)
    rgba = warp_equirect_rgba_to_web_mercator(rgba, -90.0, 90.0)

    buffer = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")

    return OverlayTexture(
        png_bytes=buffer.getvalue(),
        value_min=value_min, value_max=value_max,
        bounds=(-180.0, -WEB_MERCATOR_MAX_LAT, 180.0, WEB_MERCATOR_MAX_LAT),
    )


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


def grib2_temperature_to_overlay_texture(grib2_bytes: bytes, level: str = "sfc") -> OverlayTexture:
    """GFS air temperature (TMP) -> the Overlay: Temp field — spec 054
    follow-up, 2026-08-05. `level` (Height selector, 2026-08-06) picks the
    color domain matching that altitude's real temperature range —
    see TEMP_DOMAIN_BY_LEVEL_C's own comment for why a single domain
    doesn't work across every level."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "TMP", TEMP_RAMP, TEMP_DOMAIN_BY_LEVEL_C[level])


def grib2_relative_humidity_to_overlay_texture(grib2_bytes: bytes, level: str = "sfc") -> OverlayTexture:
    """GFS relative humidity (RH, %) -> the Overlay: RH field. `level` is
    accepted (not just ignored outright) for the same uniform LEVEL_AWARE_
    OVERLAY_FIELDS calling convention grib2_temperature_to_overlay_texture
    needs — RH's own 0-100% domain is already level-independent, so it's
    unused here."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "RH", RH_RAMP, RH_DOMAIN_PCT)


# Dew point uses the exact same color ramp as Temp on earth.nullschool.net
# (live-verified against its own colorbar, 2026-08-06) — just a narrower
# domain, since dew point is always <= actual air temperature.
# Live-verified 2026-08-06: real global min was -78.45C (cold/dry polar
# air) — widened past the initial -40C guess to avoid clipping that.
DEW_POINT_DOMAIN_C = (-80.0, 30.0)


def grib2_dew_point_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS 2m dew point temperature (DPT) -> the Overlay: Dew field."""
    return grib2_scalar_to_overlay_texture(grib2_bytes, "DPT", TEMP_RAMP, DEW_POINT_DOMAIN_C)


WPD_RAMP = [
    (0x0f, 0x04, 0x60), (0x19, 0x7d, 0xc6), (0x34, 0xbf, 0xdd), (0x51, 0xb3, 0xcd),
    (0x6c, 0x95, 0xb2), (0x88, 0x76, 0x96), (0xa4, 0x57, 0x7a), (0xc0, 0x38, 0x5e),
    (0xdb, 0x1a, 0x43), (0xf1, 0x01, 0x3e), (0xf2, 0x00, 0x99), (0xf3, 0x00, 0xf1),
]
# Instantaneous Wind Power Density = 0.5 * air_density * speed^3 (W/m^2) —
# a standard sea-level air density (1.225 kg/m^3) is used rather than a
# real pressure-derived one, matching this being a rough visualization,
# not an engineering-grade wind-resource calculation.
AIR_DENSITY_KG_M3 = 1.225
# Deliberately NOT widened to the real observed max (21472 W/m^2, a rare
# ~32m/s storm outlier) — cubing wind speed means a domain wide enough to
# fit that single extreme compresses every normal-wind area (the vast
# majority of the globe, under ~15m/s) into a barely-varying sliver of the
# ramp. 3000 W/m^2 keeps typical conditions (up to ~18m/s) readable across
# most of the ramp; genuine storm-force winds just clip to the top color,
# which reads correctly as "extreme" rather than needing its own shade.
WPD_DOMAIN_WM2 = (0.0, 3000.0)


def grib2_wpd_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS 10m wind (UGRD/VGRD, the same bands fetch_latest_wind_grib2()
    already fetches for Animate) -> Instantaneous Wind Power Density, the
    Overlay: WPD field. Reads both bands directly (not built on
    grib2_scalar_to_overlay_texture's single-band shape) since WPD is
    derived from wind speed, not a GFS field of its own."""
    source_path = "/vsimem/wpd_overlay_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched GFS wind GRIB2 data")

        u_band = _band_by_grib_element(dataset, "UGRD")
        v_band = _band_by_grib_element(dataset, "VGRD")
        u = resample_band_to_grid(u_band, dataset)
        v = resample_band_to_grid(v_band, dataset)
        speed = np.sqrt(u**2 + v**2)
        wpd = 0.5 * AIR_DENSITY_KG_M3 * speed**3

        value_min = float(np.nanmin(wpd))
        value_max = float(np.nanmax(wpd))
        rgba = colorize_linear(wpd, WPD_RAMP, *WPD_DOMAIN_WM2)

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


# Wind speed magnitude (spec 055 US1 — Forecast: 15-day wind view). Same
# ramp shape as WPD_RAMP (both are wind-derived) but a plain m/s domain
# instead of WPD's cubed W/m^2 one, since the Forecast panel shows raw
# speed, not power density.
WIND_SPEED_RAMP = WPD_RAMP
WIND_SPEED_DOMAIN_MS = (0.0, 40.0)  # ~144 km/h ceiling; genuine storm-force gusts clip to the top color, same "reads as extreme" tradeoff as WPD_DOMAIN_WM2


def grib2_wind_speed_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """GFS 10m wind (UGRD/VGRD) -> plain wind speed magnitude, the Forecast
    panel's 15-day wind_speed variable. Same band-reading shape as
    grib2_wpd_to_overlay_texture, minus the cubing/air-density step."""
    source_path = "/vsimem/wind_speed_overlay_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched GFS wind GRIB2 data")

        u_band = _band_by_grib_element(dataset, "UGRD")
        v_band = _band_by_grib_element(dataset, "VGRD")
        u = resample_band_to_grid(u_band, dataset)
        v = resample_band_to_grid(v_band, dataset)
        speed = np.sqrt(u**2 + v**2)

        value_min = float(np.nanmin(speed))
        value_max = float(np.nanmax(speed))
        rgba = colorize_linear(speed, WIND_SPEED_RAMP, *WIND_SPEED_DOMAIN_MS)

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


HTSGW_RAMP = [
    (0x08, 0x1d, 0x58), (0x24, 0x43, 0x9b), (0x1e, 0x84, 0xba), (0x47, 0xb8, 0xc3),
    (0x9e, 0xd9, 0xb8), (0xe6, 0xf5, 0xb2), (0xfe, 0xc6, 0x59), (0xfd, 0x9b, 0x43),
    (0xf7, 0x67, 0x2f), (0xe9, 0x33, 0x21), (0xc6, 0x0a, 0x25), (0xa3, 0x00, 0x29),
]
HTSGW_DOMAIN_M = (0.0, 15.0)


def grib2_htsgw_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """
    WAVEWATCH III significant wave height (HTSGW, meters) -> the Overlay:
    HTSGW field. Reuses the exact same GRIB2 bytes fetch_latest_wave_grib2()
    already fetches for Animate: Waves (it pulls HTSGW+DIRPW together to
    build that layer's synthetic vector encoding) — no new NOMADS request
    needed, just a different band read out of data already being fetched.
    """
    return grib2_scalar_to_overlay_texture(grib2_bytes, "HTSGW", HTSGW_RAMP, HTSGW_DOMAIN_M)


# Ocean mode's SST field (spec 054 follow-up, 2026-08-06) — reuses TEMP_RAMP
# (same "cold -> warm" language as Air mode's Temp) rather than a dedicated
# ramp, since this hasn't been live-extracted from the reference tool's own
# SST colorbar the way TEMP_RAMP itself was (no live browser access when
# this was written — see fetch_sst.py's own NOTE). Domain is real seawater's
# own physical range: -1.8°C is the approximate freezing point of seawater
# (salinity depresses it below 0°C), 34°C comfortably covers the warmest
# tropical warm-pool surface waters.
SST_DOMAIN_C = (-1.8, 34.0)


def netcdf_sst_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    """CMEMS sea water potential temperature (thetao, shallowest depth,
    assumed °C per CMEMS's documented convention for this variable) -> the
    Overlay: SST field. Same NetCDF subdataset access pattern as
    netcdf_uv_to_flow_texture (simple-current-layer.js's own data source),
    just a single scalar band instead of a vector pair."""
    source_path = "/vsimem/sst_overlay_source.nc"
    gdal.FileFromMemBuffer(source_path, netcdf_bytes)
    try:
        dataset = gdal.Open(f'NETCDF:"{source_path}":thetao')
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched CMEMS NetCDF (expected a 'thetao' subdataset)")

        band = dataset.GetRasterBand(1)
        values = resample_band_to_grid(band, dataset)

        value_min = float(np.nanmin(values))
        value_max = float(np.nanmax(values))
        rgba = colorize_linear(values, TEMP_RAMP, *SST_DOMAIN_C)

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


def _resample_to_common_grid(band: "gdal.Band", src_dataset: "gdal.Dataset", ulx: float, uly: float, lrx: float, lry: float, width: int, height: int) -> np.ndarray:
    """
    gdal.Translate with an EXPLICIT target window (projWin) — unlike
    resample_band_to_grid (which resamples to a fixed pixel COUNT but
    preserves whatever geographic extent the source dataset itself
    covers), this forces the output onto an exact caller-chosen
    geographic box. Needed for SSTA: two different-source rasters (CMEMS
    current SST, -180..180 native; NOAA's climatology, 0..360 native) only
    become pixel-aligned — safe to subtract one from the other — once both
    are resampled onto the identical box, not just the same width/height.
    """
    out_path = "/vsimem/common_grid_resampled.tif"
    single_band_path = "/vsimem/common_grid_source.tif"
    try:
        gdal.Translate(single_band_path, src_dataset, bandList=[band.GetBand()], format="GTiff")
        gdal.Translate(
            out_path, single_band_path,
            projWin=[ulx, uly, lrx, lry],
            width=width, height=height,
            resampleAlg="bilinear", format="GTiff",
        )
        resampled = gdal.Open(out_path)
        resampled_band = resampled.GetRasterBand(1)
        array = resampled_band.ReadAsArray().astype(np.float64)
        nodata = resampled_band.GetNoDataValue()
        if nodata is not None:
            array[np.isclose(array, nodata, rtol=1e-6)] = np.nan
        return array
    finally:
        gdal.Unlink(single_band_path)
        gdal.Unlink(out_path)


SSTA_RAMP = [
    (0x05, 0x30, 0x61), (0x21, 0x66, 0xac), (0x67, 0xa9, 0xcf), (0xd1, 0xe5, 0xf0),
    (0xf7, 0xf7, 0xf7), (0xfd, 0xdb, 0xc7), (0xf4, 0xa5, 0x82), (0xd6, 0x60, 0x4d),
    (0xb2, 0x18, 0x2b), (0x67, 0x00, 0x1f), (0x40, 0x00, 0x13), (0x20, 0x00, 0x09),
]
# Marine heatwaves rarely exceed +3 to +5°C above the 1991-2020 normal;
# widened a little past that on both ends so a genuinely extreme event
# still leaves headroom instead of pinning to the ramp's very end.
SSTA_DOMAIN_C = (-6.0, 6.0)


def netcdf_sst_anomaly_to_overlay_texture(netcdf_bytes_pair: tuple[bytes, bytes]) -> OverlayTexture:
    """
    Current SST (fetch_latest_sst_netcdf, same CMEMS thetao source as
    netcdf_sst_to_overlay_texture) minus the day-of-year climatological
    normal (fetch_latest_sst_climatology_netcdf, NOAA's public 1991-2020
    baseline) -> the Overlay: SSTA field. See fetch_sst.py's own
    CLIMATOLOGY_* comments for why this — not a ready-made CMEMS anomaly
    variable — is the data source, and _resample_to_common_grid's docstring
    for why a plain resample_band_to_grid call on each side independently
    would NOT be safe to subtract (different native extents/lon
    conventions between the two sources).

    `netcdf_bytes_pair` is (sst_netcdf_bytes, climatology_netcdf_bytes) —
    packed into one tuple by fetch_sst.py's own fetch_latest_ssta_inputs()
    so this fits run_once_overlay's one-fetch-fn-one-convert-fn-per-
    overlay-type dispatch shape (main.py) without a special case there.

    NOT live-verified end to end (no live access to either source here) —
    if the resulting overlay reads as implausible (e.g. suspiciously
    uniform, or clearly offset), the climatology fetch's day-of-year
    indexing (fetch_latest_sst_climatology_netcdf's own docstring) or the
    thetao/sst unit assumption are the first things to check.
    """
    sst_netcdf_bytes, climatology_netcdf_bytes = netcdf_bytes_pair
    lat_hi = WEB_MERCATOR_MAX_LAT
    lat_lo = -WEB_MERCATOR_MAX_LAT
    width, height = TEXTURE_WIDTH, TEXTURE_HEIGHT

    sst_source_path = "/vsimem/ssta_sst_source.nc"
    gdal.FileFromMemBuffer(sst_source_path, sst_netcdf_bytes)
    try:
        sst_dataset = gdal.Open(f'NETCDF:"{sst_source_path}":thetao')
        if sst_dataset is None:
            raise RuntimeError("GDAL could not open the fetched CMEMS SST NetCDF (expected a 'thetao' subdataset)")
        current = _resample_to_common_grid(sst_dataset.GetRasterBand(1), sst_dataset, -180, lat_hi, 180, lat_lo, width, height)
    finally:
        gdal.Unlink(sst_source_path)

    climo_source_path = "/vsimem/ssta_climatology_source.nc"
    gdal.FileFromMemBuffer(climo_source_path, climatology_netcdf_bytes)
    try:
        climo_dataset = gdal.Open(f'NETCDF:"{climo_source_path}":sst')
        if climo_dataset is None:
            climo_dataset = gdal.Open(climo_source_path)  # ERDDAP's single-timestep subset response may not expose a named subdataset at all
        if climo_dataset is None:
            raise RuntimeError("GDAL could not open the fetched NOAA climatology NetCDF (expected an 'sst' subdataset)")
        climo_band = climo_dataset.GetRasterBand(1)
        # Native lon convention is 0..360 (fetch_sst.py's own
        # CLIMATOLOGY_LON_RANGE comment) — resampled as two separate
        # halves (source 180..360 -> target -180..0, source 0..180 ->
        # target 0..180) and concatenated, rather than resampling the
        # whole thing then rolling — avoids a single projWin request that
        # would need to cross the antimeridian in the SOURCE's own 0..360
        # coordinate system, which gdal.Translate's projWin does not wrap.
        west_half = _resample_to_common_grid(climo_band, climo_dataset, 180, lat_hi, 360, lat_lo, width // 2, height)
        east_half = _resample_to_common_grid(climo_band, climo_dataset, 0, lat_hi, 180, lat_lo, width // 2, height)
        climatology = np.concatenate([west_half, east_half], axis=1)
    finally:
        gdal.Unlink(climo_source_path)

    anomaly = current - climatology  # NaN (land/nodata in either source) propagates naturally

    value_min = float(np.nanmin(anomaly))
    value_max = float(np.nanmax(anomaly))
    rgba = colorize_linear(anomaly, SSTA_RAMP, *SSTA_DOMAIN_C)
    rgba = warp_equirect_rgba_to_web_mercator(rgba, lat_lo, lat_hi)

    buffer = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")

    return OverlayTexture(
        png_bytes=buffer.getvalue(),
        value_min=value_min, value_max=value_max,
        bounds=(-180.0, lat_lo, 180.0, lat_hi),
    )


# NOAA Coral Reef Watch's own Bleaching Alert Area color scheme (blue/no
# stress -> yellow/watch -> orange/warning -> red/alert -> deep maroon for
# the most extreme levels) — approximated with colorize_linear rather than
# a hard per-category step function, so adjacent categories blend a little
# at their boundaries instead of a crisp cutoff; acceptable for this app's
# purpose (a readable heatmap, not an exact category legend).
# NOTE (2026-08-06, no live access to confirm the exact current max): NOAA
# extended the original 0 ("No Stress") .. 4 ("Alert Level 2") scale with
# three more levels above the old open-ended top end after 2023's
# unprecedented heat stress event (up to "Alert Level 5", ~near-total
# mortality risk) — this domain is set generously to 0..8 to comfortably
# fit that extended top end without needing the exact new maximum confirmed.
BAA_RAMP = [
    (0x08, 0x30, 0x6b), (0x2c, 0x7f, 0xb8), (0xa6, 0xd9, 0x6a), (0xff, 0xff, 0x8c),
    (0xff, 0xd9, 0x2e), (0xff, 0xa5, 0x00), (0xff, 0x4d, 0x00), (0xd7, 0x30, 0x1f),
    (0xa8, 0x1a, 0x1a), (0x7a, 0x0a, 0x2e), (0x4a, 0x04, 0x2a), (0x1a, 0x00, 0x1a),
]
BAA_DOMAIN = (0.0, 8.0)


def netcdf_baa_to_overlay_texture(netcdf_bytes: bytes) -> OverlayTexture:
    """NOAA CRW Bleaching Alert Area (bleaching_alert_area, integer
    category 0-N) -> the Overlay: BAA field."""
    source_path = "/vsimem/baa_overlay_source.nc"
    gdal.FileFromMemBuffer(source_path, netcdf_bytes)
    try:
        dataset = gdal.Open(f'NETCDF:"{source_path}":bleaching_alert_area')
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched NOAA CRW NetCDF (expected a 'bleaching_alert_area' subdataset)")

        band = dataset.GetRasterBand(1)
        values = resample_band_to_grid(band, dataset)

        value_min = float(np.nanmin(values))
        value_max = float(np.nanmax(values))
        rgba = colorize_linear(values, BAA_RAMP, *BAA_DOMAIN)

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


# WHO/standard UV Index color scale — green (low) -> yellow (moderate) ->
# orange (high) -> red (very high) -> purple (extreme), the conventional
# public-facing UV Index language (same family of scale as PM25_RAMP's air
# quality convention, just UV's own standard stops/colors).
UVI_RAMP = [
    (0x55, 0x9c, 0x30), (0x8b, 0xc3, 0x4a), (0xf5, 0xd7, 0x1c), (0xf5, 0xa6, 0x23),
    (0xf2, 0x7e, 0x1e), (0xe8, 0x50, 0x1e), (0xd7, 0x2b, 0x2b), (0xb5, 0x1f, 0x3e),
    (0x95, 0x2e, 0x8e), (0x77, 0x2f, 0xb5), (0x5a, 0x2c, 0xa0), (0x3f, 0x22, 0x7a),
]
# 0-11+ is the standard public UV Index scale (11+ = "extreme") — domain
# widened a little past 11 so an extreme reading doesn't pin exactly at the
# ramp's last stop.
UVI_DOMAIN = (0.0, 12.0)
# NCEP's own file reports UV irradiance in W/m^2, not the UV Index itself —
# confirmed 2026-08-06 via NOAA CPC's UV forecast documentation page (see
# fetch_uvi.py's own header).
UVI_WM2_TO_INDEX = 40.0


def grib2_uvi_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """NCEP Global UV Index Forecast (W/m^2 -> UV Index via x40.0) -> the
    Overlay: UVI field. Single-band file (no GRIB_ELEMENT band-selection
    needed, unlike the multi-field GFS pgrb2 files elsewhere in this
    module) — reads band 1 directly."""
    source_path = "/vsimem/uvi_overlay_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched NCEP UV Index GRIB2 data")

        band = dataset.GetRasterBand(1)
        values = resample_band_to_grid(band, dataset) * UVI_WM2_TO_INDEX

        value_min = float(np.nanmin(values))
        value_max = float(np.nanmax(values))
        rgba = colorize_linear(values, UVI_RAMP, *UVI_DOMAIN)

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


def _stull_wet_bulb_c(temp_c: np.ndarray, rh_pct: np.ndarray) -> np.ndarray:
    """
    Stull (2011)'s empirical wet-bulb temperature approximation — accurate
    to within ~1°C across -20..50°C / 5..99% RH per the original paper,
    which is more than sufficient for a color overlay (not a precision
    meteorological calculation). Used because GFS has no WBT field of its
    own (unlike every other Overlay field in this module, which reads a
    real GFS band directly) — Temp and RH do, so this is the standard way
    to derive it rather than running a full psychrometric solver.
    """
    return (
        temp_c * np.arctan(0.151977 * np.sqrt(rh_pct + 8.313659))
        + np.arctan(temp_c + rh_pct)
        - np.arctan(rh_pct - 1.676331)
        + 0.00391838 * rh_pct**1.5 * np.arctan(0.023101 * rh_pct)
        - 4.686035
    )


# Misery Index (Overlay: MI) — "feels like" temperature, standard NWS
# formulas: Rothfusz regression for Heat Index (hot+humid conditions) and
# the NWS/JAG/TI-2001 Wind Chill formula (cold+windy conditions); actual
# air temperature everywhere in between. Both formulas are textbook/
# standard (not data-source-dependent like the ramps elsewhere in this
# module that needed live extraction from a real colorbar), same
# confidence level as _stull_wet_bulb_c's own Stull approximation below.
def _heat_index_f(temp_f: np.ndarray, rh_pct: np.ndarray) -> np.ndarray:
    """Rothfusz regression, valid roughly >= 80°F / >= 40% RH (NWS's own
    documented applicability range) — used here everywhere hot enough to
    matter, since outside that range the result should be overridden by
    the plain actual-temperature branch anyway (see the masking below)."""
    T, R = temp_f, rh_pct
    return (
        -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R
        - 0.00683783 * T**2 - 0.05481717 * R**2 + 0.00122874 * T**2 * R
        + 0.00085282 * T * R**2 - 0.00000199 * T**2 * R**2
    )


def _wind_chill_f(temp_f: np.ndarray, wind_mph: np.ndarray) -> np.ndarray:
    """NWS/JAG/TI-2001 wind chill formula, valid roughly <= 50°F / >= 3mph wind."""
    v16 = np.power(np.maximum(wind_mph, 0.0), 0.16)
    return 35.74 + 0.6215 * temp_f - 35.75 * v16 + 0.4275 * temp_f * v16


MI_DOMAIN_C = TEMP_DOMAIN_C  # same "feels like" units/range as the plain Temp overlay


def grib2_misery_index_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """
    GFS 2m Temp+RH + 10m UGRD/VGRD (fetch_latest_misery_index_inputs_grib2)
    -> "feels like" temperature -> the Overlay: MI field. Heat Index where
    hot+humid enough for it to apply, Wind Chill where cold+windy enough,
    plain actual temperature everywhere else — matches how the NWS itself
    presents a single blended "feels like" field (their own apparent-
    temperature products switch between the same two formulas the same
    way), reusing TEMP_RAMP so MI reads as a variant of the Temp overlay
    rather than an unrelated color language.
    """
    source_path = "/vsimem/mi_overlay_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched GFS Temp+RH+wind GRIB2 data")

        temp_c = resample_band_to_grid(_band_by_grib_element(dataset, "TMP"), dataset)
        rh_pct = resample_band_to_grid(_band_by_grib_element(dataset, "RH"), dataset)
        u = resample_band_to_grid(_band_by_grib_element(dataset, "UGRD"), dataset)
        v = resample_band_to_grid(_band_by_grib_element(dataset, "VGRD"), dataset)
        wind_mph = np.sqrt(u**2 + v**2) * 2.236936  # m/s -> mph, both formulas' own native unit

        temp_f = temp_c * 9.0 / 5.0 + 32.0
        heat_index_f = _heat_index_f(temp_f, rh_pct)
        wind_chill_f = _wind_chill_f(temp_f, wind_mph)

        hot_enough = (temp_f >= 80.0) & (rh_pct >= 40.0)
        cold_enough = (temp_f <= 50.0) & (wind_mph >= 3.0)
        feels_like_f = np.where(hot_enough, heat_index_f, np.where(cold_enough, wind_chill_f, temp_f))
        feels_like_c = (feels_like_f - 32.0) * 5.0 / 9.0

        value_min = float(np.nanmin(feels_like_c))
        value_max = float(np.nanmax(feels_like_c))
        rgba = colorize_linear(feels_like_c, TEMP_RAMP, *MI_DOMAIN_C)

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


def grib2_wet_bulb_to_overlay_texture(grib2_bytes: bytes) -> OverlayTexture:
    """
    GFS 2m Temp (already Celsius, live-verified 2026-08-05) + RH (%) ->
    Stull's wet-bulb approximation -> the Overlay: WBT field. Both bands
    come from one fetch_latest_wet_bulb_inputs_grib2() request (see its
    own docstring for why: guarantees the same GFS cycle for both inputs).
    """
    source_path = "/vsimem/wbt_overlay_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched GFS Temp+RH GRIB2 data")

        temp_band = _band_by_grib_element(dataset, "TMP")
        rh_band = _band_by_grib_element(dataset, "RH")
        temp_c = resample_band_to_grid(temp_band, dataset)
        rh_pct = resample_band_to_grid(rh_band, dataset)
        wbt_c = _stull_wet_bulb_c(temp_c, rh_pct)

        value_min = float(np.nanmin(wbt_c))
        value_max = float(np.nanmax(wbt_c))
        rgba = colorize_linear(wbt_c, WBT_RAMP, *WBT_DOMAIN_C)

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
