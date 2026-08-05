# Wind + ocean-current flow-texture importer — spec 053.
#
# Python + GDAL, same foundation as netcdf-service/Dockerfile (see that
# file's header for why: GDAL reads GRIB2 natively, no mature Deno/Node
# library does). NOT netcdf-service itself, and not raster-importer's Deno
# container — see specs/053-wind-flow-visualization/research.md §4 and
# plan.md's Complexity Tracking for why this needed its own container:
# netcdf-service's GDAL open call is hardcoded to NetCDF's
# `NETCDF:"path":variable` subdataset syntax (gdal_convert.py), which
# doesn't fit GRIB2's direct-open/band-indexed model, and this job is a
# scheduled batch producing a combined two-band (U+V) PNG texture, not an
# on-demand single-band GeoTIFF conversion answering another service's
# per-request calls.
#
# "ubuntu-full" (not "ubuntu-small"): matches netcdf-service's own
# live-verified finding that ubuntu-small's GDAL build omits some format
# drivers — full is the safe choice here too.
FROM ghcr.io/osgeo/gdal:ubuntu-full-3.9.3

WORKDIR /app

RUN rm -f /etc/apt/sources.list.d/apache-arrow.sources \
    && apt-get update && apt-get install -y --no-install-recommends python3-pip && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# --ignore-installed: the GDAL base image ships numpy as a debian
# (apt) package with no pip RECORD file, so pip's normal
# uninstall-then-reinstall upgrade path fails outright ("Cannot uninstall
# numpy... RECORD file not found") — live-verified 2026-08-05 building this
# image. --ignore-installed shadows the debian copy with the pinned
# version instead of trying to remove it first, the standard workaround
# for this exact GDAL/pip packaging conflict.
RUN pip3 install --no-cache-dir --break-system-packages --ignore-installed -r requirements.txt

COPY *.py ./

# No HEALTHCHECK/EXPOSE: unlike netcdf-service, this is not an HTTP
# service — it's a run-to-completion (--once) or self-scheduling
# (default) batch job, matching raster-importer's manual/*-scheduled
# service-pair convention (see docker-compose.yml).
ENTRYPOINT ["python3", "main.py"]
