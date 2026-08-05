"""
Fetches the latest global ocean surface current (uo/vo) field from
Copernicus Marine (CMEMS) — spec 053 US4, unblocked 2026-08-05 after the
originally planned NOAA RTOFS source turned out to be GDAL-incompatible
(proprietary HYCOM .a/.b binary, no GRIB2/NetCDF mirror; see research.md
§5). CMEMS's GLOBAL_ANALYSISFORECAST_PHY_001_024 product publishes uo/vo
(eastward/northward sea water velocity) as NetCDF, which GDAL's NETCDF
driver reads natively via the `NETCDF:"path":variable` subdataset syntax
— same access pattern already used by netcdf-service/app/gdal_convert.py.

Unlike fetch_gfs.py's NOMADS source, CMEMS is NOT anonymous — it requires a
free Copernicus Marine account (registration is a manual step a human has
to do at https://data.marine.copernicus.eu/register, not something this
importer can do for itself). Credentials are read from
COPERNICUS_MARINE_USERNAME / COPERNICUS_MARINE_PASSWORD env vars and passed
directly to copernicusmarine.subset() so nothing needs to persist inside
the container (avoids the package's interactive `login` command, which
writes a credentials file to disk).

NOTE: this module is written against the Copernicus Marine Toolbox's
documented subset() API (dataset id, variable names, and the
username/password/output_directory/output_filename kwargs) but has NOT been
live-verified end to end the way fetch_gfs.py's NOMADS URL was — this repo
has no CMEMS credentials to test against. If dataset_id or the exact kwarg
names have drifted from what's used below, the first real run's error
message will point at exactly what needs adjusting.
"""
from __future__ import annotations

import datetime as dt
import os
import tempfile

import copernicusmarine

# Daily-mean surface currents subset of GLOBAL_ANALYSISFORECAST_PHY_001_024
# (0.083deg resolution, -80..90 lat, global lon) — see Copernicus Marine's
# MyOcean Viewer product page for the full dataset catalog if this ever
# needs to move to a different (e.g. hourly) variant of the same product.
DATASET_ID = "cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m"
# A *range* covering the shallowest depth level, not an exact value — live-
# verified 2026-08-05 that the dataset's real shallowest depth coordinate is
# 0.49402499198913574, not a round 0.49; a range comfortably wider than that
# rounding but still well short of the next depth level (a few meters down)
# survives across dataset version bumps without needing to hardcode the
# exact float.
MIN_DEPTH_M = 0.0
# Just above the first depth level (~0.494m) but below the second (~1.541m
# on this model's typical level spacing) — wide enough to survive the
# rounding seen above, narrow enough to still select exactly one level so
# netcdf_to_texture.py's "band 1 is the only band" assumption holds.
MAX_DEPTH_M = 1.0


def fetch_latest_currents_netcdf(timeout_s: int = 120) -> tuple[bytes, dt.datetime]:
    """
    Returns (netcdf_bytes, issued_at). CMEMS publishes a new daily-mean
    analysis once per day (P1D), not GFS's 6h cadence — issued_at is
    today's UTC date at midnight, matching the product's own granularity.
    """
    username = os.environ.get("COPERNICUS_MARINE_USERNAME")
    password = os.environ.get("COPERNICUS_MARINE_PASSWORD")
    if not username or not password:
        raise RuntimeError(
            "COPERNICUS_MARINE_USERNAME / COPERNICUS_MARINE_PASSWORD not set — "
            "register a free account at https://data.marine.copernicus.eu/register "
            "and add both to server/.env"
        )

    now = dt.datetime.now(dt.timezone.utc)
    issued_at = dt.datetime(now.year, now.month, now.day, tzinfo=dt.timezone.utc)

    with tempfile.TemporaryDirectory() as tmp_dir:
        filename = "currents.nc"
        copernicusmarine.subset(
            dataset_id=DATASET_ID,
            variables=["uo", "vo"],
            minimum_longitude=-180,
            maximum_longitude=180,
            minimum_latitude=-80,
            maximum_latitude=90,
            minimum_depth=MIN_DEPTH_M,
            maximum_depth=MAX_DEPTH_M,
            start_datetime=issued_at.isoformat(),
            end_datetime=issued_at.isoformat(),
            username=username,
            password=password,
            output_directory=tmp_dir,
            output_filename=filename,
            overwrite=True,
            disable_progress_bar=True,
        )
        out_path = os.path.join(tmp_dir, filename)
        with open(out_path, "rb") as f:
            return f.read(), issued_at
