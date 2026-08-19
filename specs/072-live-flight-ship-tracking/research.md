# Phase 0 Research: Live Flight & Ship Tracking

## 1. Flight data source

**Decision**: OpenSky Network REST API, `GET /states/all`, anonymous (unauthenticated) tier, proxied through a new Supabase Edge Function that caches the upstream response server-side.

**Rationale**:
- Free, no account/API key required for basic anonymous access — no cost/credential blocker for the user.
- Returns real, currently-in-flight aircraft state vectors globally (icao24, callsign, origin country, lat/lng, altitude, velocity, heading, vertical rate) — satisfies FR-001/FR-004 (real data only).
- Supports bounding-box filtering (`lamin`/`lomin`/`lamax`/`lomax`) if scope narrowing is ever needed later; not used initially since the app shows global traffic (spec Assumption).
- Anonymous tier limits: 400 daily request credits, ~10s position resolution. A naive "1 fetch per frontend client per minute" design would blow through this budget with more than a handful of concurrent users, since the credit budget belongs to the deployment's own upstream calls, not to each browser session.
- **Server-side caching is therefore required, not optional**: `fetch-live-flights` fetches OpenSky at most once every 10 minutes (144 upstream calls/day, safely under 400) and serves that cached snapshot to every frontend poll (frontend can poll the *edge function* every 60s per SC-002 — that only costs the edge function's own compute, not an OpenSky credit).
- Documentation shows curl-only examples, no CORS guidance → confirms server-side proxying (not direct browser fetch) is the intended integration shape, consistent with how every other external data source in this app (`chirpsFetch.ts`, `ghslFetch.ts`, etc.) is already proxied through `supabase/functions/*`.

**Alternatives considered**:
- **ADS-B Exchange** — richer data, but requires a paid RapidAPI subscription for reliable access; rejected to avoid a cost/credential blocker (matches the "flights now, ships later" decision — don't introduce the same blocker on the flight side).
- **FlightAware AeroAPI** — paid, rejected for the same reason.
- Direct browser-side fetch to OpenSky — rejected: no CORS guidance from OpenSky, and a shared per-deployment credit budget can't be safely managed from N independent browser sessions each fetching on their own timer.

## 2. Ship/AIS data source

**Decision**: Deferred. Not implemented in this increment.

**Rationale**: No free, anonymous, globally-scoped live vessel-tracking API exists equivalent to OpenSky's anonymous tier. Every commercial option surveyed (MarineTraffic, VesselFinder, Datalastic) requires a paid API key/account. AISHub offers free access but only in exchange for contributing your own physical AIS receiver's data — not usable for an arbitrary self-hosted deployment. Per the project's real-data-only rule, showing anything less than genuine live positions is not an option, so there is nothing to build here until the user supplies a credential for a paid/reciprocal provider. User confirmed (2026-08-19): proceed with flights only now; ships is a follow-up once a provider is chosen.

**Alternatives considered**: documented above; none viable without a cost/account decision only the user can make.

## 3. Rendering aircraft on the 3D globe

**Decision**: globe.gl's `.customLayerData()`/`objectsData()`-style 3D-object layer (three-globe's dedicated API for arbitrary 3D objects at lat/lng positions), kept fully separate from the existing `.pointsData()` layer used for disaster events.

**Rationale**: Reusing the disaster-events `pointsData` layer would conflate two unrelated data types (disaster severity markers vs. live traffic) under one accessor set (color, click-to-zoom, altitude-by-severity), risking regressions in existing disaster-marker behavior. three-globe ships a purpose-built custom-object layer precisely for "extra icons on the globe" use cases like this.

**Alternatives considered**: Merging into `pointsData` with a `kind` discriminator field — rejected as unnecessary coupling between two independently-toggleable, independently-styled layers (YAGNI/simplicity).

## 4. Top-left 2x2 quick-access grid — existing controls audit

**Finding**: The three existing controls the user referenced (`RadarScanBadge.vue`, the `downloadMap()` screenshot button, and the `showShelters` toggle) currently exist **only inside `MapView.vue` (2D view)** — none exist in `GlobeView.vue` (3D view), which is the app's default landing screen (`viewMode` starts at `'globe'`).

**Decision** (per user 2026-08-19): extract these three controls' *behavior* into one shared component so the 2x2 grid renders identically in both `MapView.vue` and `GlobeView.vue`, rather than duplicating markup/CSS in two places or leaving the grid 2D-only.

**Rationale**: A shared `QuickAccessGrid.vue` component (radar badge + screenshot button + shelters toggle + new flights toggle) parameterized by a `captureFn` prop (each parent passes its own canvas-capture function) avoids copy-paste drift between the two views and keeps a single source of truth for the grid's layout/CSS, consistent with this codebase's general pattern of shared components under `src/components/`.

**Screenshot capture on the 3D globe**: three-render-objects' `WebGLRenderer` is constructed without `preserveDrawingBuffer: true` by default, which is required for reliable `canvas.toBlob()` capture (otherwise the buffer may already be cleared by the time the async callback runs — this exact class of bug is why `MapView.vue`'s own `downloadMap()` needed its `map.once('render', …) + triggerRepaint()` workaround). globe.gl's `Globe({ rendererConfig: { preserveDrawingBuffer: true } })` constructor option is confirmed to pass straight through to the underlying `THREE.WebGLRenderer`, so `GlobeView.vue`'s `initGlobe()` sets this at construction time and its capture function reads `globeInstance.renderer().domElement.toBlob(...)` directly (no render-race workaround needed, since the buffer is now preserved).

**Alternatives considered**: Leaving the grid MapView-only — rejected per user's explicit choice; duplicating markup in both files — rejected as needless drift risk for a project that already has i18n/theming consistency requirements (Constitution VI).
