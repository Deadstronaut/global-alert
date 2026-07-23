"""
Exercises the /convert HTTP contract end-to-end against a synthetic local
NetCDF file (same fixture approach as test_gdal_convert.py) with
urllib.request.urlopen mocked out — proves the ad-hoc sourceUrl/
variableName/bandIndex contract (main.py's 2026-07-22 pivot, see its
module docstring) works without needing a real EWDS job/token, which
wasn't available in this environment as of that date.
"""
import io
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient
from osgeo import gdal, osr

gdal.UseExceptions()


@pytest.fixture
def synthetic_netcdf_bytes(tmp_path):
    path = str(tmp_path / "synthetic.nc")
    width, height = 20, 10
    driver = gdal.GetDriverByName("netCDF")
    dataset = driver.Create(path, width, height, 1, gdal.GDT_Float32)
    dataset.SetGeoTransform([-10.0, 1.0, 0, 10.0, 0, -1.0])
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    dataset.SetProjection(srs.ExportToWkt())
    band = dataset.GetRasterBand(1)
    band.WriteArray(np.arange(width * height, dtype=np.float32).reshape(height, width))
    band.SetNoDataValue(-9999)
    dataset.FlushCache()
    dataset = None
    return Path(path).read_bytes()


class _FakeResponse:
    def __init__(self, data: bytes):
        self._buf = io.BytesIO(data)

    def read(self, n=-1):
        return self._buf.read(n)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_convert_returns_geotiff_for_a_mocked_source_url(synthetic_netcdf_bytes, tmp_path, monkeypatch):
    monkeypatch.setenv("NETCDF_CACHE_DIR", str(tmp_path / "cache"))
    from app.main import app  # imported after env var set, so CACHE_DIR picks it up

    client = TestClient(app)

    with patch("app.main.urllib.request.urlopen", return_value=_FakeResponse(synthetic_netcdf_bytes)):
        res = client.get(
            "/convert",
            params={
                "sourceUrl": "https://example.com/fake.nc",
                "variableName": "Band1",
                "bandIndex": 1,
                "bbox": "-5,0,5,10",
            },
        )

    assert res.status_code == 200
    assert res.headers["content-type"] == "image/tiff"
    assert res.content[:4] in (b"II*\x00", b"MM\x00*")


def test_convert_returns_400_for_malformed_bbox():
    from app.main import app

    client = TestClient(app)
    res = client.get("/convert", params={"sourceUrl": "https://example.com/fake.nc", "variableName": "x", "bbox": "not-a-bbox"})
    assert res.status_code == 400


def test_convert_returns_502_when_download_fails(monkeypatch, tmp_path):
    monkeypatch.setenv("NETCDF_CACHE_DIR", str(tmp_path / "cache2"))
    from app.main import app

    client = TestClient(app)

    def _boom(*a, **kw):
        raise OSError("network unreachable")

    with patch("app.main.urllib.request.urlopen", side_effect=_boom):
        res = client.get(
            "/convert",
            params={"sourceUrl": "https://example.com/unreachable.nc", "variableName": "x", "bbox": "-5,0,5,10"},
        )
    assert res.status_code == 502
