# Feature Specification: Forecast Map Display

**Feature Branch**: `056-forecast-map-display`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Forecast Map Display: surface the 15-day GFS forecast data (spec 055's
forecast_snapshots, 14 variables) on the live map itself, not just the dashboard panel. Add a
'Forecast' row to the existing map layer control panel, letting an admin pick a forecast variable
and a day (1-15), rendered as a raster overlay on the map — reusing the same
select-a-day/remove-old-layer/add-new-layer pattern already used by the existing pressure-level
(Height) selector, and the same index-based slider pattern already used elsewhere in the product
for stepping through a range of values. Display only, no animated particle rendering for
wind/wave forecast variables in this scope. Must not change existing current-conditions layer
behavior when no forecast day is selected."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Step through a forecast variable's next 15 days on the map (Priority: P1)

An admin viewing the live map wants to see how a hazard-relevant condition (e.g. precipitation,
CAPE, wind speed) is expected to change over the next 15 days, directly on the map they already
use for current conditions — not by switching to a separate dashboard screen.

**Why this priority**: This is the entire point of the feature — without it, forecast data stays
locked in the dashboard and never informs the map-based situational picture the rest of the
product is built around.

**Independent Test**: Can be fully tested by opening the map's layer control, selecting a
forecast variable, moving the day selector, and confirming the rendered overlay visibly changes
to match each day's data.

**Acceptance Scenarios**:

1. **Given** the map's layer control panel is open, **When** the admin selects a forecast
   variable (e.g. "Forecast: Precipitation"), **Then** a day selector appears showing the
   available days (Day 1 through Day 15) and the map renders that variable's first available
   day by default.
2. **Given** a forecast variable and day are selected, **When** the admin moves the day selector
   to a different day, **Then** the map's rendered overlay updates to that day's data, replacing
   the previous day's overlay (not stacking both).
3. **Given** a forecast overlay is being shown, **When** the admin switches the selected variable
   to a different forecast variable, **Then** the map shows the new variable at the previously
   selected day index (or the nearest available day), not a blank map.
4. **Given** a forecast overlay is being shown, **When** the admin turns off the Forecast
   selection (e.g. selects "None" or switches to a current-conditions overlay), **Then** the
   forecast overlay is removed from the map and normal current-conditions behavior is unaffected.

### Edge Cases

- What happens when the selected (variable, day) has no data yet (e.g. ingestion hasn't run for
  that variable, or — matching spec 055's UV Index limitation — the variable has no data beyond a
  certain day)? The day selector MUST still let the admin move to that day, but the map MUST show
  a clear "no forecast data for this day" state rather than a blank tile, stale data, or an error.
- What happens if the admin has both a current-conditions layer and a forecast overlay active at
  the same time? The two MUST be visually distinguishable (e.g. the forecast selection has its own
  clearly labeled control state) so the admin never mistakes forecast data for current conditions.
- What happens when switching days rapidly (e.g. dragging the slider)? The map MUST always end up
  showing the last-selected day's data, not an intermediate day left behind by an in-flight
  request that resolves after a later one.
- What happens on a fresh page load with no prior selection? No forecast overlay is shown by
  default — forecast display is an opt-in selection, matching how every other optional map layer
  in this product already behaves.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The map's layer control MUST offer a way to select a 15-day forecast variable,
  scoped to the set of variables spec 055 actually ingests.
- **FR-002**: When a forecast variable is selected, the control MUST present a day selector
  covering every day for which that variable has ingested data (per spec 055, not necessarily a
  full 1-15 range for every variable — e.g. UV Index only has data through day 5).
- **FR-003**: Selecting a day MUST render that day's data as a map overlay, replacing any
  previously shown forecast overlay (never stacking multiple forecast days at once).
- **FR-004**: The forecast overlay MUST be visually labeled or otherwise distinguishable from
  current-conditions layers, so it is never mistaken for real-time data.
- **FR-005**: If the selected (variable, day) combination has no available data, the map MUST
  show an explicit "no data for this day" state instead of a blank, stale, or erroring overlay.
- **FR-006**: Switching the selected day or variable MUST fully replace the prior forecast
  overlay — no stale or duplicate overlay may remain visible.
- **FR-007**: Turning off the forecast selection MUST remove the forecast overlay and MUST NOT
  alter the behavior or state of current-conditions (nowcast) layers.
- **FR-008**: This feature MUST NOT change how existing current-conditions layers behave, render,
  or are selected when no forecast day is active.
- **FR-009**: Forecast variables that render vector/motion data in current-conditions mode (wind
  speed, wind power density, significant wave height) MUST render as a static raster overlay in
  forecast mode, not as an animated particle layer, for this spec's scope.
- **FR-010**: The day selector MUST show which day is currently selected in a human-readable way
  (e.g. "Day 3" and/or the corresponding calendar date), not just a raw step count.

### Key Entities *(include if feature involves data)*

- **Forecast Map Selection**: The admin's current choice of forecast variable + day (or "off"),
  scoped to the map view — conceptually similar to the existing current-conditions layer/height
  selection already tracked for the map.
- **Forecast Day Overlay**: The rendered representation of one (variable, day) pair's data on the
  map — reuses the same underlying forecast data spec 055 already ingests; no new data is
  introduced by this spec.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can go from opening the map's layer control to seeing a chosen forecast
  variable's chosen day rendered on the map in under 10 seconds.
- **SC-002**: 100% of day-selector moves result in the map showing the newly selected day's data
  (or an explicit no-data state) within a few seconds — never a leftover previous day's data.
- **SC-003**: Admins can visually tell, without prior training, whether the map is currently
  showing forecast data or current-conditions data (validated via usability review: 90%+ of
  reviewers correctly identify which is which on first view).
- **SC-004**: Existing current-conditions layer selection and rendering behavior shows zero
  regressions after this feature ships (verified via the existing map layer test/QA pass).

## Assumptions

- This spec's "map layer control" refers to the existing on-map control panel that already lets
  an admin choose current-conditions layers/overlays and a pressure level — this feature adds to
  that control, it does not introduce a separate new control surface.
- The day selector reuses the same interaction pattern (a step-through slider) already used
  elsewhere in the product for moving through a range of discrete values, for UI consistency.
- Wind/wave forecast variables are shown as static raster overlays in this scope; an animated
  forecast particle view (matching current-conditions "Animate" layers) is explicitly out of
  scope and left for a future spec if desired.
- No new backend data or ingestion is required — this spec is a display layer on top of spec
  055's already-ingested `forecast_snapshots` data.
- Access to the forecast map selection follows the same permissions already governing access to
  the map's other layer controls; no new permission tier is introduced.
