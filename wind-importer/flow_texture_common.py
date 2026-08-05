"""
Shared GDAL raster -> RG-channel PNG texture logic (spec 053), used by both
grib_to_texture.py (wind, GFS GRIB2) and netcdf_to_texture.py (ocean
currents, CMEMS NetCDF) — the two source formats need different GDAL
open/band-selection code (GRIB_ELEMENT metadata vs. NETCDF subdataset
syntax), but resampling to the fixed texture grid, normalizing each
component to 0-255, and PNG-encoding are identical either way.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from osgeo import gdal
from PIL import Image

gdal.UseExceptions()

TEXTURE_WIDTH = 720  # 0.5-degree equirectangular — coarse enough for a
TEXTURE_HEIGHT = 361  # small, fast-loading texture; particle motion reads
# fine at this resolution (the reference tools use comparably coarse grids
# for the same reason — smooth animated flow doesn't need per-pixel
# forecast precision, unlike this app's other exact-value hex layers).


@dataclass
class FlowTexture:
    png_bytes: bytes
    u_min: float
    u_max: float
    v_min: float
    v_max: float
    bounds: tuple[float, float, float, float]  # west, south, east, north


def resample_band_to_grid(band: "gdal.Band", src_dataset: "gdal.Dataset") -> np.ndarray:
    """Resamples one band to the fixed TEXTURE_WIDTH x TEXTURE_HEIGHT grid via gdal.Translate, in-memory.
    NoData cells (e.g. CMEMS ocean-current land mask, ~9.97e+36 by NetCDF/CF
    convention) are converted to NaN — live-verified 2026-08-05: without this,
    the fill-value sentinel itself gets picked up as the array's max, blowing
    up u_max/v_max and the resulting normalized texture."""
    out_path = "/vsimem/flow_band_resampled.tif"
    single_band_path = "/vsimem/flow_band_source.tif"
    try:
        gdal.Translate(single_band_path, src_dataset, bandList=[band.GetBand()], format="GTiff")
        gdal.Translate(
            out_path,
            single_band_path,
            width=TEXTURE_WIDTH,
            height=TEXTURE_HEIGHT,
            resampleAlg="bilinear",
            format="GTiff",
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


def normalize_to_uint8(values: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Scales `values` from [lo, hi] to [0, 255] — the vendored particle layer
    decodes real U/V back out using these same lo/hi bounds
    (contracts/flow-snapshot-contract.md)."""
    if hi - lo < 1e-9:  # a perfectly uniform field (e.g. dead calm everywhere) — avoid /0
        return np.zeros_like(values, dtype=np.uint8)
    scaled = (values - lo) / (hi - lo) * 255.0
    # NaN cells (land, via resample_band_to_grid's NoData masking) would
    # otherwise cast to an undefined uint8 value — pin them to 0 (decodes
    # back to speed=lo, i.e. reads as "calm", an acceptable stand-in since
    # this texture has no separate land/ocean mask channel to draw on).
    scaled = np.nan_to_num(scaled, nan=0.0)
    return np.clip(scaled, 0, 255).astype(np.uint8)


def build_flow_texture(u_array: np.ndarray, v_array: np.ndarray, bounds: tuple[float, float, float, float]) -> FlowTexture:
    u_min, u_max = float(np.nanmin(u_array)), float(np.nanmax(u_array))
    v_min, v_max = float(np.nanmin(v_array)), float(np.nanmax(v_array))

    red = normalize_to_uint8(u_array, u_min, u_max)
    green = normalize_to_uint8(v_array, v_min, v_max)
    # Blue channel = validity mask, not a data value: 255 where both u/v are
    # real samples, 0 where either was NaN (land/nodata, e.g. CMEMS's ocean
    # mask or WAVEWATCH III's land mask). Live-testing finding, 2026-08-05:
    # without this, land pixels decode client-side to a fixed (u_min,v_min)
    # "vector" (since NaN was zeroed before normalization) — every particle
    # that drifts onto land reads the exact same fake direction/magnitude,
    # drawing visually obvious parallel diagonal lines across entire
    # continents. The renderer treats blue<128 as "no data here" and
    # respawns the particle instead of drawing a fake trail segment.
    valid = np.isfinite(u_array) & np.isfinite(v_array)
    blue = np.where(valid, 255, 0).astype(np.uint8)
    rgb = np.dstack([red, green, blue])

    buffer = io.BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buffer, format="PNG")

    return FlowTexture(
        png_bytes=buffer.getvalue(),
        u_min=u_min, u_max=u_max, v_min=v_min, v_max=v_max,
        bounds=bounds,
    )


def metadata_json(texture: FlowTexture) -> str:
    import json

    return json.dumps({
        "uMin": texture.u_min, "uMax": texture.u_max,
        "vMin": texture.v_min, "vMax": texture.v_max,
        "bounds": list(texture.bounds),
        "width": TEXTURE_WIDTH, "height": TEXTURE_HEIGHT,
    })
