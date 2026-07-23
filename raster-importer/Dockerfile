# Meta/HDX + GHSL population raster importer — Deno CLI container.
#
# Deno (not Node) on purpose: reuses supabase/functions/shared/*.ts
# unmodified (Edge Functions are Deno already), and rasterToHexagonFile.ts's
# disk-streaming `npm:geotiff` fromFile() source needs a real Deno CLI
# process with filesystem access — it cannot run inside Supabase's Edge
# Runtime (no local files there) or Node without a rewrite.
#
# Run modes (see docker-compose.yml):
#   docker compose run --rm meta-downloader        # download+extract Meta/HDX from HDX, one-shot
#   docker compose run --rm meta-ghsl-importer     # process manifest.json into Supabase, one-shot
#   docker compose run --rm ghsl-importer          # one-shot, exits when done
#   docker compose up -d meta-ghsl-importer-scheduled ghsl-importer-scheduled
#     # always-on, monthly Deno.cron trigger (cron.ts), matches aggregator's
#     # restart:unless-stopped pattern — meta-downloader deliberately has no
#     # scheduled equivalent, see its own header comment for why.
#
# Build context must be the repo root (see docker-compose.yml) so this can
# COPY supabase/functions/shared alongside this file's own scripts.
FROM denoland/deno:alpine-2.1.4

WORKDIR /app

# unzip (Info-ZIP, ZIP64-capable) — download-meta.ts shells out to it
# instead of this repo's in-memory unzipSingleEntry.ts, which explicitly
# does not support ZIP64 and Meta/HDX's archives need it (see
# download-meta.ts's header comment for the live-verified numbers).
RUN apk add --no-cache unzip

COPY supabase/functions/shared/ ./supabase/functions/shared/
COPY raster-importer/import.ts ./raster-importer/import.ts
COPY raster-importer/import-ghsl.ts ./raster-importer/import-ghsl.ts
COPY raster-importer/download-meta.ts ./raster-importer/download-meta.ts
COPY raster-importer/import-glofas.ts ./raster-importer/import-glofas.ts
COPY raster-importer/import-gdo-anomaly.ts ./raster-importer/import-gdo-anomaly.ts
COPY raster-importer/import-worldpop.ts ./raster-importer/import-worldpop.ts
COPY raster-importer/import-hydrobasins.ts ./raster-importer/import-hydrobasins.ts
COPY raster-importer/import-hydrorivers.ts ./raster-importer/import-hydrorivers.ts
COPY raster-importer/import-osm-buildings.ts ./raster-importer/import-osm-buildings.ts
COPY raster-importer/import-osm-roads.ts ./raster-importer/import-osm-roads.ts
COPY raster-importer/cron.ts ./raster-importer/cron.ts

# Pre-resolve npm:/esm.sh imports at build time so a run with no outbound
# access to those registries (only to Supabase, HDX, GHSL's own tile
# host, EWDS, GDO's WCS, Overpass, and netcdf-service) still works.
RUN deno cache raster-importer/import.ts raster-importer/import-ghsl.ts raster-importer/download-meta.ts raster-importer/import-glofas.ts raster-importer/import-gdo-anomaly.ts raster-importer/import-worldpop.ts raster-importer/import-hydrobasins.ts raster-importer/import-hydrorivers.ts raster-importer/import-osm-buildings.ts raster-importer/import-osm-roads.ts raster-importer/cron.ts

# --unstable-cron: Deno.cron() (cron.ts's scheduled mode) is not yet a
# stable API as of Deno 2.1 — live-verified 2026-07-22 that `Deno.cron` is
# `undefined` without this flag. Harmless to always pass it even for
# scripts that never call Deno.cron.
# --allow-run=unzip: download-meta.ts shells out to the system `unzip`
# binary only — no other subprocess execution needed or granted.
ENTRYPOINT ["deno", "run", "--allow-read", "--allow-write=/rasters,/manifest.json", "--allow-net", "--allow-env", "--allow-run=unzip", "--unstable-cron"]
# Default: the manifest-driven Meta/HDX one-shot importer.
# docker-compose.yml overrides this CMD for the other run modes.
CMD ["raster-importer/import.ts"]
