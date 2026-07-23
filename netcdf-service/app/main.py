"""
FastAPI app implementing spec 047's contract, revised 2026-07-22 after two
pivots (see NEW_GAME_PLAN.md §4.5/§4.5b/§4.2):

1. GDO Soil Moisture Anomaly + FAPAR Anomaly turned out NOT to need this
   service at all — both are servable as ready-made GeoTIFF via the same
   WCS endpoint GDO SPI already uses (gdoAnomalyFetch.ts). This service's
   only remaining real target is GloFAS's GRIB2/NetCDF forecast output
   (fetched via EWDS — supabase/functions/shared/ewdsClient.ts).

2. GloFAS's EWDS jobs each produce a fresh, one-off asset URL per request
   (submit -> poll -> a signed/direct download href) — there is no fixed
   "archive_url" to pre-register like the original DATASET_REGISTRY
   design assumed. So /convert now takes the source URL and variable
   directly (ad-hoc mode) instead of a dataset id looked up in a fixed
   table. Still content-addressed-cached by URL (see _ensure_downloaded)
   so re-converting the same job's asset twice doesn't re-download it.

GET /convert?sourceUrl=<url>&variableName=<var>&bandIndex=<n>&bbox=<w,s,e,n>
returns a GeoTIFF body (200) or {"detail": str} (4xx/5xx).
"""
import hashlib
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
import urllib.request

from .gdal_convert import netcdf_variable_to_geotiff

app = FastAPI(title="netcdf-service")

CACHE_DIR = Path(os.environ.get("NETCDF_CACHE_DIR", "/cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def _cached_archive_path(url: str) -> Path:
    # Content-addressed by URL, not overwritten per-request — worth
    # caching across requests for the same EWDS job asset (e.g. a caller
    # converting multiple variables/bands out of the same downloaded
    # file) rather than re-downloading it each time.
    digest = hashlib.sha256(url.encode()).hexdigest()[:16]
    return CACHE_DIR / f"{digest}.src"


def _ensure_downloaded(url: str) -> Path:
    path = _cached_archive_path(url)
    if path.exists():
        return path
    tmp_path = path.with_suffix(".part")
    try:
        with urllib.request.urlopen(url, timeout=120) as response, open(tmp_path, "wb") as f:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        raise RuntimeError(f"failed to download {url}: {e}") from e
    tmp_path.rename(path)
    return path


@app.get("/convert")
def convert(
    sourceUrl: str = Query(..., description="Direct download URL for the NetCDF4/HDF5/GRIB2 source file"),
    variableName: str = Query(..., description="GDAL subdataset variable name, e.g. 'river_discharge_in_the_last_24_hours'"),
    bandIndex: int = Query(1, description="1-based GDAL band index within the variable (e.g. which time step)"),
    bbox: str = Query(..., description="west,south,east,north"),
) -> Response:
    try:
        parts = [float(p) for p in bbox.split(",")]
        if len(parts) != 4:
            raise ValueError
        west, south, east, north = parts
    except ValueError:
        raise HTTPException(status_code=400, detail="bbox must be 'west,south,east,north' (4 comma-separated numbers)")

    try:
        source_path = _ensure_downloaded(sourceUrl)
        tif_bytes = netcdf_variable_to_geotiff(str(source_path), variableName, bandIndex, (west, south, east, north))
    except Exception as e:
        # Mirrors this repo's Edge Function convention (recordFetchOutcome
        # 'failure', never a bare 500 with no message) — the caller needs
        # the reason, not just "it broke", per spec 047 FR-006.
        raise HTTPException(status_code=502, detail=str(e))

    return Response(content=tif_bytes, media_type="image/tiff")
