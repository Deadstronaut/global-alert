# Phase 0 Research: Flow Visualization Modes & Overlays

## 1. Waves data source: NOAA WAVEWATCH III vs alternatives

**Decision**: NOAA WAVEWATCH III (global, `glo_30m` grid), via the same NOMADS filter API family already used for Wind (`filter_wave_multi.pl`), fetching significant wave height (`HTSGW`) and primary wave direction (`DIRPW`).

**Rationale**: Same free/public/no-auth/6-hour-cycle profile that made GFS the right call for Wind in spec 053 — WAVEWATCH III is NCEP's own operational wave model, published on the same NOMADS infrastructure `fetch_gfs.py` already talks to, at the same 00/06/12/18 UTC cadence. No new authentication system, no new network host class to reason about (unlike CMEMS, which spec 053 needed for Currents because NOAA's own RTOFS ocean-current product turned out to be GDAL-incompatible — WAVEWATCH III has no equivalent format problem: it's GRIB2, same as GFS).

**Alternatives considered**: CMEMS wave products (rejected — introduces a second CMEMS dependency for a source that already has a working free NOAA equivalent; only worth it if WAVEWATCH III's live GRIB2 fetch turns out not to actually work during implementation, mirroring how Currents only moved to CMEMS after RTOFS concretely failed).

## 2. Waves rendering: reuse the vector-flow texture format, don't build a new layer type

**Decision**: Convert wave height + direction into the exact same synthetic "U/V" texture format `grib_to_texture.py`/`SimpleWindLayer` already consume — `u = height × sin(direction)`, `v = height × cos(direction)` — so Waves becomes a third `layer_type` value in the existing `flow_snapshots` table and renders through the existing `SimpleWindLayer`/particle-trail code with zero new rendering code.

**Rationale**: Wave state (height + direction) is mathematically a vector, same shape as wind/current U/V — the only difference is what the vector's magnitude means (height in meters vs. speed in m/s). Reusing the established texture format and renderer is the direct Principle VIII (Simplicity/YAGNI) reading: spec 053 already solved "animate a vector field on the map," and this is the same problem with a different source. The only new code is a `fetch_waves.py`/direction-to-vector conversion step in `wind-importer`, not a new pipeline or a new layer class.

**Alternatives considered**: A dedicated wave-specific shader with directional arrow sprites instead of flow particles (rejected — genuinely nicer for waves specifically, but a new rendering technique for one of three animated layers violates Simplicity without a concrete requirement driving it; FR-002 only asks for "the same visual/performance conventions" as Wind/Currents).

## 3. Air-quality Overlay data source: CAMS vs alternatives

**Decision**: CAMS (Copernicus Atmosphere Monitoring Service) global near-real-time forecast, PM2.5 surface concentration, accessed the same way as CMEMS — via the free, registration-required Copernicus Atmosphere Data Store (ADS) API, using an `ads`/`cdsapi`-family Python client analogous to `copernicusmarine` (spec 053 §Currents).

**Rationale**: CAMS is the source the user repeatedly pointed at from the reference tool, has a genuinely free tier (registration, not payment), and — like CMEMS — is a Copernicus service, so this app already has one Copernicus credential-handling pattern (`COPERNICUS_MARINE_USERNAME`/`PASSWORD` in `server/.env`, read directly by the importer container) to extend rather than invent a second one from scratch.

**Alternatives considered**: NOAA's own air-quality products (rejected — NOAA's global aerosol coverage is materially thinner than CAMS's, which is purpose-built as a global atmospheric composition service); a from-scratch aerosol-optical-depth product (rejected — no viable free source identified beyond CAMS/GEOS-5, and GEOS-5 was already ruled out in spec 053 §1 for its research-only license).

## 4. Overlay rendering: a new raster layer type, not the particle-flow layer

**Decision**: The air-quality Overlay is a color-graded **raster** layer (MapLibre `raster` source pointing at a server-rendered PNG, colored server-side using the same quantile-ramp technique `exposureLayerColor.js` already uses for gridded metrics like rainfall/drought), not an extension of `SimpleWindLayer`.

**Rationale**: Unlike Wind/Currents/Waves, air quality has no meaningful "flow" — it's a scalar concentration field, the same shape as this app's existing gridded-metric exposure layers (CHIRPS rainfall, GDO drought/soil-moisture), just sourced globally-and-periodically instead of per-country-on-upload. Reusing the established color-ramp/legend convention (`gridMetricFillExpression`/`gridMetricLegendStops` in `exposureLayerColor.js`) for the *visual* language, while sourcing the underlying raster from a new `overlay_snapshots` table (see data-model.md) parallel to `flow_snapshots`, avoids inventing a second color/legend system for what is conceptually the same "value → color" problem this codebase already solved. It also avoids forcing a scalar field through the vector-flow particle layer, which has no sensible interpretation of "a PM2.5 reading" as a moving particle.

**Alternatives considered**: Extending `exposure_datasets`/`exposure_features` (the existing per-country, admin-uploaded vector-polygon exposure pipeline) — rejected: that pipeline is built around one-time/periodic admin uploads of country-scoped vector data (population, building footprints), with its own RLS/ownership model (`org_id`, `created_by`, country-scoped admin policies). A globally-sourced, automatically-refreshed raster snapshot doesn't fit that shape or its access-control assumptions without distorting both; `flow_snapshots`' shape (global bounds, periodic system-refreshed snapshot, public read) is the closer match, evidenced by CAMS covering the same worldwide, un-owned, always-current nature Wind/Currents/Waves already have.

## 5. Space (aurora/OVATION) and Bio modes: confirmed out of scope

**Decision**: No data pipeline work in this spec for Space or Bio modes — both remain visible-but-disabled entries in the Mode list (spec.md FR-007), matching the reference tool's fuller menu without implying they're functional.

**Rationale**: OVATION (space weather/aurora) is a NOAA SWPC product aimed at short-term geomagnetic/auroral forecasting — no motivating use case for a disaster/hazard early-warning platform was identified (aurora visibility isn't a hazard), and building a pipeline for it would be adding a data source with no requirement behind it, the exact thing Principle VIII/YAGNI warns against. "Bio" mode has no defined meaning in the reference tool's own public documentation beyond the menu label itself, and no candidate data source was found. Both are one-line menu additions today (label + disabled state) and can become real specs later if a concrete need emerges — consistent with how Currents itself started as a disabled placeholder before spec 053 gave it real data.
