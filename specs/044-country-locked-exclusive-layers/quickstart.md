# Quickstart: Country-Locked Map View

## Prerequisites

- Migration `20260719160000_country_boundaries_default_zoom.sql` applied.
- A test account whose `profiles.country_code` is set to `tr` (or `mg`) and whose `role` is not
  `super_admin` — the "country-locked" test user (User Stories 1-2).
- The existing anon/global browsing path available for regression comparison (User Story 1
  Acceptance Scenario 3).

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

## 3. Hazard view and exposure layers stay independent (FR-007)

1. As any user, select a country and switch between the left-side hazard view modes (status /
   hexagon / heat).
2. Toggle on an exposure-layer dataset (e.g. WorldPop population) from the panel — confirm the
   currently-active hazard view mode does NOT change or disappear.
3. Switch the hazard view mode again (e.g. status → heat) — confirm the exposure layer(s) toggled
   on in step 2 remain visible, unaffected.
4. Toggle a second exposure-layer dataset (e.g. roads) on while the first is still on — confirm
   both remain visible together (existing spec 042 multi-select behavior, untouched).

## 4. Regression check

1. Confirm existing anon/global map navigation (single-click select, double-click fly-to-country)
   is unchanged for non-locked sessions (FR-006).
2. Confirm exposure-layer datasets still fetch/render identically to specs 040/041/043's existing
   behavior — this feature touches only the camera/navigation path, not layer visibility or data
   fetching (FR-007).
