"""
Converts a GFS wind GRIB2 U/V field into the RG-channel PNG texture +
range-metadata shape the vendored MapLibre particle layer expects — spec 053
research.md §2-3 (the standard technique this class of tool uses; NOT this
app's existing scalar-per-hex raster pipeline, which has no concept of a
vector/two-band field — see research.md §3 for why that pipeline doesn't
fit).

Mirrors netcdf-service/app/gdal_convert.py's GDAL conventions
(gdal.UseExceptions(), /vsimem/ for in-memory files, "fail loudly" on
anything GDAL can't read) but opens GRIB2 directly (`gdal.Open(path)`,
bands selected by GRIB metadata) rather than NetCDF's
`NETCDF:"path":variable` subdataset syntax used by netcdf_to_texture.py
(the ocean-currents counterpart of this file) — the two formats' GDAL
access patterns are different enough that only the resample/normalize/
encode tail (flow_texture_common.py) is shared between them.
"""
from __future__ import annotations

from osgeo import gdal

from flow_texture_common import FlowTexture, build_flow_texture, resample_band_to_grid

gdal.UseExceptions()


def _band_by_grib_element(dataset: "gdal.Dataset", element: str) -> "gdal.Band":
    for band_index in range(1, dataset.RasterCount + 1):
        band = dataset.GetRasterBand(band_index)
        # GDAL's GRIB2 driver exposes the message's short name in this
        # metadata key — live-verified against a real NOMADS UGRD/VGRD
        # subset (see fetch_gfs.py's own live-verification note).
        if band.GetMetadataItem("GRIB_ELEMENT") == element:
            return band
    raise RuntimeError(f"No GRIB2 band with GRIB_ELEMENT={element!r} found (dataset has {dataset.RasterCount} bands)")


def grib2_to_flow_texture(grib2_bytes: bytes) -> FlowTexture:
    """
    Raises RuntimeError on anything GDAL can't open/read — same "fail
    loudly, never emit a silently-wrong texture" convention as
    netcdf_variable_to_geotiff() in netcdf-service.
    """
    source_path = "/vsimem/wind_source.grib2"
    gdal.FileFromMemBuffer(source_path, grib2_bytes)
    try:
        dataset = gdal.Open(source_path)
        if dataset is None:
            raise RuntimeError("GDAL could not open the fetched GRIB2 data")

        u_band = _band_by_grib_element(dataset, "UGRD")
        v_band = _band_by_grib_element(dataset, "VGRD")
        u_array = resample_band_to_grid(u_band, dataset)
        v_array = resample_band_to_grid(v_band, dataset)

        gt = dataset.GetGeoTransform()
        width, height = dataset.RasterXSize, dataset.RasterYSize
        west, north = gt[0], gt[3]
        east = west + width * gt[1]
        south = north + height * gt[5]  # gt[5] is negative for north-up rasters

        return build_flow_texture(u_array, v_array, bounds=(west, south, east, north))
    finally:
        gdal.Unlink(source_path)
