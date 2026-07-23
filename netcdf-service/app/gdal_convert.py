"""
Pure GDAL conversion helper: opens one variable/band inside a NetCDF4/HDF5
(or GRIB2) file GDAL already knows how to read, crops it to a bounding box,
and returns GeoTIFF bytes — no dataset-specific knowledge here (variable
names, archive URLs, band-to-period mapping all live in main.py's
DATASET_REGISTRY). Kept separate and dependency-free (just `osgeo.gdal`)
so it's testable against a small synthetic NetCDF file without needing a
real ~260MB GDO archive or network access — see test_gdal_convert.py.
"""
from osgeo import gdal

gdal.UseExceptions()


def netcdf_variable_to_geotiff(
    source_path: str,
    variable_name: str,
    band_index: int,
    bbox: tuple[float, float, float, float],  # (west, south, east, north)
) -> bytes:
    """
    Raises FileNotFoundError / RuntimeError (via gdal.UseExceptions()) on
    anything GDAL can't open or read — callers should treat any exception
    here as a conversion failure, not attempt to interpret GDAL's error
    text themselves (mirrors this project's "fail loudly" convention, spec
    047 Edge Cases: a GDO layout change must surface as an error, never a
    silently wrong raster).
    """
    gdal_source = f'NETCDF:"{source_path}":{variable_name}'
    dataset = gdal.Open(gdal_source)
    if dataset is None:
        raise RuntimeError(f"GDAL could not open {gdal_source}")

    if band_index < 1 or band_index > dataset.RasterCount:
        raise ValueError(f"band_index {band_index} out of range (dataset has {dataset.RasterCount} bands)")

    west, south, east, north = bbox
    out_path = "/vsimem/convert_output.tif"
    try:
        gdal.Translate(
            out_path,
            dataset,
            bandList=[band_index],
            projWin=[west, north, east, south],  # GDAL's projWin order is ULX, ULY, LRX, LRY
            format="GTiff",
        )
        vsi_file = gdal.VSIFOpenL(out_path, "rb")
        if vsi_file is None:
            raise RuntimeError("gdal.Translate produced no output (empty crop region?)")
        try:
            gdal.VSIFSeekL(vsi_file, 0, 2)
            size = gdal.VSIFTellL(vsi_file)
            gdal.VSIFSeekL(vsi_file, 0, 0)
            # gdal.VSIFReadL returns a bytearray, not bytes — Starlette's
            # Response.render only accepts bytes/memoryview/str (live-
            # verified: passing the bytearray straight through raises
            # "'bytearray' object has no attribute 'encode'" deep inside
            # Starlette), so this must be cast before it crosses that
            # boundary.
            return bytes(gdal.VSIFReadL(1, size, vsi_file))
        finally:
            gdal.VSIFCloseL(vsi_file)
    finally:
        gdal.Unlink(out_path)
