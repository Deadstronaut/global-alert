# Quickstart: Country-Locked Map View with Mutually Exclusive Hexagon Layers

## Prerequisites

- Migration `<timestamp>_country_boundaries_default_zoom.sql` applied.
- A test account whose `profiles.country_code` is set to `tr` (or `mg`) and whose `role` is not
  `super_admin` — the "country-locked" test user (User Stories 1-2).
- The existing anon/global browsing path available for regression comparison (User Story 1
  Acceptance Scenario 3, User Story 3 baseline).

## 1. Country-locked camera on open (US1)

1. Log in as the `tr`-scoped test account, open the map.
2. Confirm the initial camera is already fitted to Turkey's bounds — no manual pan/zoom needed.
3. If `country_boundaries.default_zoom` is set for `tr`, confirm the zoom level matches that
   configured value; if unset, confirm the fit-to-bounds fallback behaves like the existing
   `zoomToCountry()` path (FR-003).
4. Repeat for the `mg`-scoped account — confirm the same generic behavior, no country-specific
   code path (FR-002).
5. Log out / use an anon session — confirm the existing global/world view is unchanged (FR-006).

## 2. No cross-country navigation for a locked user (US2)

1. As the `tr`-scoped test account, double-click on a country other than Turkey.
2. Confirm the camera does not fly there and no other country's data is selected (FR-004).
3. Confirm normal zoom in/out and panning still work freely within the session (FR-005).

## 3. Hazard hex vs. exposure layer mutual exclusion (US3)

1. As any user, select a country (hazard hex grid appears — `uiStore.mapMode === 'hexagon'`).
2. Toggle on an exposure-layer dataset (e.g. WorldPop population) from the layer panel.
3. Confirm the hazard hex grid disappears and the exposure layer becomes visible (FR-008).
4. Toggle on a second exposure-layer dataset (e.g. roads) while the first is still on.
5. Confirm both exposure layers remain visible together (FR-010 — multi-select within exposure
   state is unaffected).
6. Re-select the country (or otherwise re-trigger hazard mode).
7. Confirm all currently-visible exposure layers are hidden and the hazard hex grid reappears
   (FR-009).

## 4. Regression check

1. Confirm existing anon/global map navigation (single-click select, double-click fly-to-country)
   is unchanged for non-locked sessions (FR-006).
2. Confirm exposure-layer datasets still fetch/render identically to specs 040/041/043's existing
   behavior — this feature touches visibility coordination only, not data fetching (FR-011).
