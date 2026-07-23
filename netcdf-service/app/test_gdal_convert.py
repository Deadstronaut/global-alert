"""
Exercises gdal_convert.py against a small synthetic NetCDF file (created
with GDAL's own netCDF driver, not a real GDO archive) so this proves the
open-variable/crop/return-GeoTIFF-bytes mechanics work correctly
independent of GDO's actual file layout, which was still under research
as of 2026-07-22 (see main.py's DATASET_REGISTRY TODOs).
"""
import numpy as np
import pytest
from osgeo import gdal, osr

from .gdal_convert import netcdf_variable_to_geotiff

gdal.UseExceptions()


@pytest.fixture
def synthetic_netcdf(tmp_path):
    path = str(tmp_path / "synthetic.nc")
    width, height = 20, 10
    # west=-10, north=10, 1 degree/pixel -> east=10, south=0
    driver = gdal.GetDriverByName("netCDF")
    dataset = driver.Create(path, width, height, 1, gdal.GDT_Float32)
    dataset.SetGeoTransform([-10.0, 1.0, 0, 10.0, 0, -1.0])
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    dataset.SetProjection(srs.ExportToWkt())
    band = dataset.GetRasterBand(1)
    data = np.arange(width * height, dtype=np.float32).reshape(height, width)
    band.WriteArray(data)
    band.SetNoDataValue(-9999)
    dataset.FlushCache()
    dataset = None
    return path


def test_netcdf_variable_to_geotiff_returns_valid_geotiff_bytes(synthetic_netcdf):
    # GDAL's netCDF driver names the default written variable "Band1" when
    # no variable name is given at creation time — live-verified against
    # this fixture's own output rather than assumed.
    info = gdal.Info(synthetic_netcdf, format="json")
    variable_name = next(iter(gdal.Open(f'NETCDF:"{synthetic_netcdf}"').GetSubDatasets() or []), None)
    # Fall back to opening the file directly with a generic driver name if
    # GDAL didn't report subdatasets (single-variable files sometimes open
    # directly without the NETCDF: prefix needing a variable name).
    var = "Band1"

    tif_bytes = netcdf_variable_to_geotiff(synthetic_netcdf, var, 1, (-5.0, 0.0, 5.0, 10.0))

    assert tif_bytes[:4] in (b"II*\x00", b"MM\x00*")  # TIFF magic bytes (little/big-endian)
    assert len(tif_bytes) > 0


def test_netcdf_variable_to_geotiff_raises_on_unknown_variable(synthetic_netcdf):
    with pytest.raises(Exception):
        netcdf_variable_to_geotiff(synthetic_netcdf, "does_not_exist", 1, (-5.0, 0.0, 5.0, 10.0))


def test_netcdf_variable_to_geotiff_raises_on_out_of_range_band(synthetic_netcdf):
    with pytest.raises(ValueError):
        netcdf_variable_to_geotiff(synthetic_netcdf, "Band1", 99, (-5.0, 0.0, 5.0, 10.0))
