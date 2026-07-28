# Phase 0 Research: Hazard Impact Halo Visualization

## 1. How to draw a "km-radius circle centered on a lat/lng" in MapLibre

**Decision**: Hand-write a small `circlePolygon(lat, lng, radiusKm, points=64)` helper (degrees-per-km approximation, same style already used by `demSlopeAggregate.ts`'s `METERS_PER_DEG_LAT`/longitude-at-latitude conversion) that returns a GeoJSON `Polygon`, fed into a MapLibre `geojson` source + `fill`/`line` layer pair.

**Alternatives considered**:
- Pull in `@turf/turf`'s `circle()` — rejected. This project has actively *removed* `@turf/boolean-point-in-polygon` before specifically to reduce bundle/memory footprint (see `rasterToHexagon.ts`'s header comment on the GHSL Edge Function memory ceiling); adding a new turf dependency for one circle function when a ~15-line hand-rolled version already matches this codebase's existing degrees-per-km math elsewhere is inconsistent with that prior decision and with Constitution Principle VIII (Simplicity/YAGNI).
- MapLibre's built-in `circle` layer type (paint-only, screen-space pixel radius) — rejected for the halo itself: a `circle` layer's radius is in **screen pixels**, not real-world km, so it would visually shrink/grow with zoom instead of representing a fixed geographic radius. (It remains the right tool for the individual critical-infrastructure *points* in US2, which is a separate, already-decided rendering choice.)

## 2. Distance-to-severity color mapping (US2)

**Decision**: For each critical-infrastructure point within the halo radius, compute `t = distance_km / halo_radius_km` (0 = at the epicenter, 1 = at the halo's edge), then linearly interpolate along a fixed 3-5 stop red→yellow ramp (reusing this project's existing `GRID_METRIC_RAMPS` pattern in `exposureLayerColor.js`, just a new ramp entry, not new infrastructure). Computed client-side in `MapView.vue` from data already fetched for the map — no new RPC.

**Alternatives considered**:
- A server-side RPC (like `evaluate_cascade_rules`'s distance computation) — rejected for now: the critical-infrastructure points are already loaded client-side for map rendering, and a `ST_Distance` computation against at most a few hundred points is trivial client-side math; adding a round-trip would only reintroduce the exact class of statement-timeout risk this session has spent considerable effort fixing elsewhere, for zero benefit.

## 3. Where to get real building-footprint data (US3)

**Decision (research only — US3 itself is out of scope for this pass)**: **Microsoft's "Global ML Building Footprints"** dataset. Verified live and reachable with no authentication:

- Index: `https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv`
- Per-country tile counts (quadkey-tiled, same tiling *concept* as GHSL's 10-degree grid or DEM-slope's 1-degree grid, just a different tiling scheme): **Turkey 266 tiles, Madagascar 140 tiles, Malaysia 98 tiles**.
- Format: gzip-compressed CSV, one building polygon (as WKT/GeoJSON geometry column) per row.

**Alternatives considered**:
- **Overpass API** (`overpass-api.de`, already used by `osmBuildingsFetch.ts`/`osmRoadsFetch.ts`) queried unscoped for `building=*` — rejected. This codebase's own existing comment on `osmBuildingsFetch.ts` documents that even the current, deliberately narrow critical-infrastructure-only query was sized specifically to avoid blowing past resource limits; an unscoped country-wide building query would be 1-2 orders of magnitude larger, and Overpass's public instance has its own soft rate-limiting on top of this project's own `[timeout:180]` — not a reliable source for a one-time bulk country-scale pull.
- **Google Open Buildings** — investigated but not chosen as primary: strongest coverage is Africa/South/Southeast Asia (would likely serve Madagascar/Malaysia well) but has weaker/no coverage for Turkey, so a single source (Microsoft) covering all three served countries consistently is preferable to mixing two providers with different schemas.

**External verification aids (no integration needed)**: **Overpass Turbo** (overpass-turbo.eu) for previewing what an Overpass query would return before running it for real; **QGIS** (free desktop GIS) for opening a downloaded Microsoft tile (GeoJSON/CSV) to sanity-check it visually before the first real import run. Both are one-time, external, human-in-the-loop verification steps — not code this app depends on.
