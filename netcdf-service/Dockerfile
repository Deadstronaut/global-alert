# NetCDF/GDAL raster conversion service — spec 047.
#
# Python + GDAL, not Deno/Node: this repo's raster pipeline
# (supabase/functions/shared/rasterToHexagon*.ts) is deliberately
# GDAL-free (Constitution Principle VIII, GeoTIFF via npm:geotiff only) —
# but GDO's Soil Moisture Anomaly/FAPAR anomaly are published ONLY as
# NetCDF4/HDF5 (live-verified via HDF5 magic bytes), and GloFAS (see
# NEW_GAME_PLAN.md §4.2) only as GRIB2/NetCDF — no mature Deno/Node
# library reads either format. GDAL reads both natively, so this service
# exists to do exactly one thing: NetCDF4/HDF5/GRIB2 -> GeoTIFF, cropped
# to a country bbox, handed back to callers that already know how to
# process a GeoTIFF (raster-importer's aggregateRasterToHexagonsFromFile,
# proven 2026-07-22 on Meta/HDX and GHSL).
#
# Uses the official OSGeo GDAL image (GDAL's Python bindings are
# preinstalled and version-matched to the C library — pip-installed
# rasterio/GDAL wheels frequently do NOT ship the NetCDF/HDF5 drivers,
# a known packaging gap, so this avoids that entirely rather than
# fighting driver availability after the fact).
#
# "ubuntu-full" (not "ubuntu-small"): live-verified 2026-07-22 that
# ubuntu-small's GDAL build has GRIB but NOT NetCDF/HDF5 — `gdalinfo
# --formats` inside that image simply omits them. Since this service's
# remaining real target is GloFAS (GRIB2 *or* NetCDF, caller's choice —
# see NEW_GAME_PLAN.md §4.2), not GDO Soil Moisture/FAPAR anymore (those
# turned out solvable via WCS GeoTIFF with no NetCDF parsing at all, see
# gdoAnomalyFetch.ts), NetCDF support needs to actually be present, not
# assumed.
#
# Internal-only service (see docker-compose.yml — no `ports:` mapping):
# reachable from other containers on the `mhews` network (raster-importer,
# aggregator) but not from the host or public internet, matching spec
# 047 FR-002's "network-level isolation is enough, no auth needed" design.
FROM ghcr.io/osgeo/gdal:ubuntu-full-3.9.3

WORKDIR /app

# Live-verified 2026-07-22: this base image ships an apache-arrow.sources
# apt repo whose signing key isn't available, which makes a plain
# `apt-get update` fail entirely (not signed / NO_PUBKEY) — this service
# needs none of Arrow's packages, so the repo is removed rather than
# fought with a real key.
RUN rm -f /etc/apt/sources.list.d/apache-arrow.sources \
    && apt-get update && apt-get install -y --no-install-recommends python3-pip && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY app/ ./app/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=5)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
