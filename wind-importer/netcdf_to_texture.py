"""
Converts a CMEMS ocean-current NetCDF (uo/vo variables) into the same
RG-channel PNG texture + range-metadata shape grib_to_texture.py produces
for wind — spec 053 US4. NetCDF's GDAL access pattern is subdataset-based
(`NETCDF:"path":variable`, one gdal.Open() call per variable) rather than
GRIB2's single-dataset-many-bands layout, so this can't reuse
grib_to_texture.py's band-selection code directly — only the resample/
normalize/PNG-encode tail (flow_texture_common.py) is shared.
"""
from __future__ import annotations

from osgeo import gdal

from flow_texture_common import FlowTexture, build_flow_texture, resample_band_to_grid

gdal.UseExceptions()


def _open_variable(source_path: str, variable: str) -> "gdal.Dataset":
    dataset = gdal.Open(f'NETCDF:"{source_path}":{variable}')
    if dataset is None:
        raise RuntimeError(f"GDAL could not open NetCDF variable {variable!r}")
    return dataset


def netcdf_uv_to_flow_texture(netcdf_bytes: bytes) -> FlowTexture:
    """
    Raises RuntimeError on anything GDAL can't open/read — same "fail
    loudly, never emit a silently-wrong texture" convention as
    grib2_to_flow_texture().
    """
    # GDAL's NETCDF driver needs a real file path (not /vsimem/) on some
    # builds when the file has multiple subdatasets — writing to /vsimem/
    # here anyway since this GDAL image is the same "ghcr.io/osgeo/gdal:
    # ubuntu-full" build already used successfully for GRIB2 in
    # grib_to_texture.py, which does support /vsimem/ NETCDF subdatasets.
    source_path = "/vsimem/currents_source.nc"
    gdal.FileFromMemBuffer(source_path, netcdf_bytes)
    try:
        u_dataset = _open_variable(source_path, "uo")
        v_dataset = _open_variable(source_path, "vo")

        # Single depth level + single day were already selected in the
        # CMEMS subset request (fetch_currents.py), so band 1 is the only
        # band on each variable.
        u_band = u_dataset.GetRasterBand(1)
        v_band = v_dataset.GetRasterBand(1)
        u_array = resample_band_to_grid(u_band, u_dataset)
        v_array = resample_band_to_grid(v_band, v_dataset)

        gt = u_dataset.GetGeoTransform()
        width, height = u_dataset.RasterXSize, u_dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]  # gt[5] is negative for north-up rasters

        return build_flow_texture(u_array, v_array, bounds=(west, south, east, north))
    finally:
        gdal.Unlink(source_path)
