"""
Converts a GFS wave GRIB2 (significant height + primary direction) into the
same synthetic u/v vector shape build_flow_texture() expects — spec 054
US1, research.md §2. Reuses grib_to_texture.py's GRIB2 band-selection
helper (GRIB2 access is identical to wind's — same GRIB_ELEMENT-metadata
pattern, just different element names, live-verified 2026-08-05 via
gdalinfo against a real NOMADS wave subset) rather than duplicating it.

u = height * sin(direction), v = height * cos(direction) — the magnitude of
this synthetic vector is wave height in meters, not a real velocity, so
SimpleWindLayer's decoded "speed" reads as wave height for this layer_type
(contracts/wave-snapshot-contract.md's frontend note — the panel must label
this "wave height", not "wind speed"). DIRPW is GRIB2's "primary wave
direction" field, the compass bearing waves are heading toward (0=north) —
the same "motion heading" convention wind's own UGRD/VGRD already use in
this pipeline, so no direction-flip is needed.
"""
from __future__ import annotations

import numpy as np
from osgeo import gdal

from flow_texture_common import FlowTexture, build_flow_texture, resample_band_to_grid
from grib_to_texture import _band_by_grib_element

gdal.UseExceptions()


def wave_grib2_to_flow_texture(grib2_bytes: bytes) -> FlowTexture:
    """Raises RuntimeError on anything GDAL can't open/read, same convention
    as grib2_to_flow_texture()."""
    source_path = "/vsimem/wave_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched wave GRIB2 data")

        height_band = _band_by_grib_element(dataset, "HTSGW")
        direction_band = _band_by_grib_element(dataset, "DIRPW")
        wave_height = resample_band_to_grid(height_band, dataset)
        wave_direction_deg = resample_band_to_grid(direction_band, dataset)

        direction_rad = np.deg2rad(wave_direction_deg)
        u = wave_height * np.sin(direction_rad)
        v = wave_height * np.cos(direction_rad)

        gt = dataset.GetGeoTransform()
        width, height_px = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height_px * gt[5]  # gt[5] is negative for north-up rasters

        return build_flow_texture(u, v, bounds=(west, south, east, north))
    finally:
        gdal.Unlink(source_path)
