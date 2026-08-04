# Feature Specification: Animated Wind Flow Visualization

**Feature Branch**: `053-wind-flow-visualization`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Add a NASA GEOS-5/earth.nullschool.net-style animated wind visualization layer to the 2D map — flowing, moving wind-streamline particles (like earth.nullschool.net's signature animation) with a simultaneous color-graded overlay (e.g. a heat/intensity gradient) rendered underneath the flow. Reference: a screenshot of NASA's own GEOS-5/GMAO visualization tool, whose control bar exposes Data/Date/Source/Scale/Control/Mode (Air/Ocean/Chem/Particulates/Space/Bio)/Animate (Wind/Currents/Waves)/Overlay (DUex/PM1/PM2.5/PM10/OMaot/SO4ex, etc.)/Projection (multiple). User wants the 2D map prioritized (the app also has a separate 3D globe view, out of scope for v1) and is open to expanding scope later, but wants v1 properly bounded rather than attempting the full reference tool's breadth (every Mode, every Overlay, every Projection) at once."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See global wind flow at a glance (Priority: P1)

A user viewing the world (no country selected) wants to understand current wind patterns globally, the way they would on a weather-focused visualization site — not as a table of numbers, but as a living, moving picture of the atmosphere.

**Why this priority**: This is the core value proposition described by the user ("hareketli, akan çizgiler" — flowing, moving lines) — without the animated flow itself, the feature doesn't deliver what was asked for.

**Independent Test**: Toggle the wind layer on from the map's layer controls while zoomed out to a world view; observe continuously animating streamline particles following current wind direction, without needing any other part of this feature to exist.

**Acceptance Scenarios**:

1. **Given** the 2D map is showing the world view, **When** the user enables the wind flow layer, **Then** animated particles begin moving across the visible map area, their paths curving to follow the underlying wind direction.
2. **Given** the wind flow layer is enabled, **When** the user pans or zooms the map, **Then** the particle animation continues smoothly and remains aligned with the map's current view (no visible lag, tearing, or particles frozen in a stale position).
3. **Given** the wind flow layer is enabled, **When** the user disables it, **Then** the animation stops and the map returns to its prior appearance with no residual artifacts.

---

### User Story 2 - Read wind intensity, not just direction (Priority: P2)

A user watching the animated flow wants to also see *how strong* the wind is in a given area — not just which way it's blowing — the way the reference tool colors its flow lines/background by speed.

**Why this priority**: Direction alone (P1) is the signature visual, but speed is the other half of "wind" as a hazard-relevant signal (e.g. for cyclone/wildfire-spread context this app already tracks) — this is what makes the layer analytically useful, not just decorative.

**Independent Test**: With the wind layer active, compare a visibly calm region against a visibly stormy one (e.g. near an active cyclone in the app's own event data) and confirm the layer visibly communicates the difference (color intensity and/or particle speed/density).

**Acceptance Scenarios**:

1. **Given** the wind flow layer is active, **When** wind speed varies across the visible area, **Then** the layer visually communicates that variation (e.g. color gradient and/or particle speed) with a legend explaining the scale.
2. **Given** the wind layer's legend is visible, **When** the user reads it, **Then** it clearly states the unit (e.g. km/h or m/s) and the color-to-speed mapping.

---

### User Story 3 - Trust that the data is current (Priority: P3)

A user relying on this layer for situational awareness wants to know when the displayed wind data was last updated, so they don't mistake a stale snapshot for the present moment.

**Why this priority**: Lower priority than the visualization itself, but necessary for the layer to be trustworthy for hazard-monitoring use rather than purely decorative — matches this app's existing convention of showing data recency for its other hazard layers.

**Independent Test**: With the wind layer active, confirm a visible timestamp/label states when the underlying data was issued, independent of whether animation or the speed overlay (P1/P2) are also present.

**Acceptance Scenarios**:

1. **Given** the wind flow layer is active, **When** the user looks at the layer's control panel, **Then** they see when the current wind data was issued (e.g. "as of [date/time]").
2. **Given** the underlying wind data has not refreshed in longer than its normal update cycle, **When** the user views the layer, **Then** the app indicates the data may be stale rather than silently presenting it as current.

---

### User Story 4 - See ocean current flow alongside wind (Priority: P2)

A user looking at a coastal or maritime hazard (e.g. a tsunami, flood, or cyclone event near open water) wants to see ocean current flow animated the same way wind is, since currents matter for the same kind of situational awareness (e.g. how a spill, debris field, or storm surge might move).

**Why this priority**: Confirmed in-scope for v1 (not deferred) — equal priority to wind speed (User Story 2) since both are needed for the v1 "Air + Ocean" scope to feel complete, but after the core animated-flow mechanic (User Story 1) proves out for wind first.

**Independent Test**: Toggle an ocean-currents layer on independently of the wind layer; observe animated flow over ocean areas following current direction, with its own speed legend and data-recency indicator — testable on its own even if the wind layer is later disabled.

**Acceptance Scenarios**:

1. **Given** the 2D map is showing an ocean area, **When** the user enables the ocean currents layer, **Then** animated particles move across ocean areas following current direction, with no particles rendered over land.
2. **Given** both the wind layer and the ocean currents layer are enabled at once, **When** the user views a coastal area, **Then** both animations render together without becoming visually indistinguishable from each other (e.g. distinct color treatment) or degrading performance below the standard set for wind alone (SC-003/SC-004).
3. **Given** the ocean currents layer is active, **When** the user reads its legend, **Then** it states speed unit and current-to-visual mapping, and shows when the underlying current data was issued — same recency guarantee as wind (User Story 3).

---

### Edge Cases

- What happens when the wind data source is temporarily unreachable or returns no data for the current time window? (Layer should fail gracefully — e.g. show a "data unavailable" state — not blank the rest of the map or error the whole page.)
- How does the layer behave over the map's few very high-latitude/polar regions where wind-vector data can be sparse or projection distortion is greatest?
- What happens if the user enables the wind layer together with an existing exposure/hazard layer (e.g. hex population grid) — do they visually compete, and does performance stay acceptable with both active?
- What happens on a low-end device/slow connection — does the animation degrade (e.g. fewer particles) rather than freeze the map interaction?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The 2D map MUST offer a toggleable wind layer, off by default, consistent with how this app's other optional map layers (heatmap, hexbins, exposure layers) are toggled.
- **FR-002**: When enabled, the wind layer MUST render continuously animated particles whose movement direction follows the underlying wind-direction data for the particle's current map position.
- **FR-003**: The wind layer MUST visually communicate wind speed (not direction alone), with an on-screen legend explaining the speed-to-visual mapping and its unit.
- **FR-004**: The wind layer MUST display when its underlying data was last issued/updated.
- **FR-005**: The wind layer MUST scope its visible detail to the current map viewport/zoom rather than always rendering full-world detail regardless of view, consistent with this app's existing performance conventions for other dense map layers.
- **FR-006**: The wind layer MUST degrade gracefully (a clear "unavailable" state, not a broken page) when its data source cannot be reached or returns no data.
- **FR-007**: Wind and ocean-current data MUST be refreshed via a periodic import pipeline (mirroring this app's existing Edge Function / raster-importer pattern for other hazard/exposure sources), not a live third-party API call made directly from the browser. Import cadence is every 6 hours, matching the underlying model's own publish cycle.
- **FR-008**: v1's wind and ocean-current data source SHOULD be NASA GEOS-5/GMAO (matching the reference tool exactly) where a technically feasible, documented public data feed exists; if GEOS-5/GMAO access proves impractical (no usable public endpoint, prohibitive format/licensing, etc. — to be confirmed during technical planning/research), the implementation MUST fall back to NOAA GFS (surface/10m wind, and an equivalent ocean-current product) as the v1 source instead. Either source must be clearly attributed in the UI (matching the reference tool's own "Source" label).
- **FR-009**: v1's scope covers two Animate modes: **Wind** (Air) and **Ocean Currents** — both ship together in v1, each independently toggleable per User Story 1 and User Story 4. Waves, and every non-flow Overlay/Mode from the reference tool (Chem/Particulates/Space/Bio, aerosol/PM/ozone overlays), remain out of scope for this spec and are candidates for later, separate features.
- **FR-010**: The wind and ocean-current layers MUST render on the existing 2D MapLibre map; the 3D globe view is out of scope for this feature.
- **FR-011**: The wind/current layers' projection MUST match the 2D map's existing projection (no new/alternate map projections introduced by this feature) — the reference tool's multiple selectable projections (Orthographic, Winkel Tripel, etc.) are out of scope for v1.
- **FR-012**: The two layers MUST be independently toggleable (a user can enable wind without currents, currents without wind, or both at once per User Story 4's acceptance scenario 2).

### Key Entities *(include if feature involves data)*

- **Wind Snapshot**: One point-in-time global wind field (direction + speed at each grid point, e.g. a lat/lng grid at a fixed resolution), tagged with when it was issued by the source and when it was imported.
- **Ocean Current Snapshot**: Same shape as a Wind Snapshot but for surface ocean current direction + speed, and restricted to ocean areas (no data over land) — both snapshot types mirror how this app's other periodic raster imports (e.g. rainfall, soil moisture) are already modeled, so the same dataset/versioning conventions apply to both.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can tell current wind direction for any visible part of the world map within 2 seconds of enabling the layer, without reading any numeric table.
- **SC-002**: A user can distinguish a high-wind area from a calm area at a glance, correctly matching the legend, in a usability check with representative users.
- **SC-003**: The animated layer maintains smooth motion (no visible stutter under normal use) on the app's standard supported devices/browsers while panning and zooming.
- **SC-004**: Enabling the wind layer does not measurably slow down the rest of the map's existing interactions (panning, clicking hex/markers) — perceived responsiveness stays the same as with the layer off.
- **SC-005**: The displayed "data as of" timestamp is never more than one full refresh cycle out of date under normal operation.

## Assumptions

- v1 targets the 2D MapLibre map only; the 3D globe view is explicitly out of scope and may be considered in a future spec.
- v1 covers Wind and Ocean Currents (direction + speed) only — Waves, and every non-flow Overlay/Mode from the reference tool (aerosols, chemistry, particulates, space, biosphere), are out of scope and are candidates for later, separate features.
- Wind/current data is treated like this app's other hazard-adjacent raster sources: imported periodically (every 6 hours) into Supabase by a backend pipeline, not fetched live from a third-party API on every page load.
- NASA GEOS-5/GMAO is the preferred v1 data source (matching the reference tool); NOAA GFS is the confirmed fallback if GEOS-5/GMAO integration proves impractical — the technical feasibility check happens during planning, not this spec.
- The feature reuses the 2D map's existing single projection; no new projection options are introduced.
- Existing map-layer UI conventions (toggle panel, legend styling, layer opacity control) are followed rather than introducing a new control paradigm just for this layer.
