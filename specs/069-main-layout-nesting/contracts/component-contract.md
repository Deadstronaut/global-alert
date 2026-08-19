# Contract: MainLayout Component Composition

**Revision 2**: `HazardSubMenu.vue` is retired and replaced by `HazardFocusRow.vue`;
`HazardTypeNav.vue`'s behavior/data-source contract changed (filter, not taxonomy sub-menu
trigger); `FooterStatusRow.vue` and header controls (Panel/Konum/world-shape) are new;
`DateScrubberFooter.vue` gains sibling filter controls in the same bottom row.

## `MainLayout.vue`

**Props**: none (top-level layout, mounted directly by router as a route `component`).

**Renders**:
- `<AppHeader />`
- `<HazardTypeNav v-model:focused="focusedHazardCode" />`
- `<HazardFocusRow v-if="focusedHazardCode" :hazard-code="focusedHazardCode" />`
- `<router-view />` — the active child route's page component
- `<FooterStatusRow />`
- `<DateScrubberFooter />` — now also hosts the magnitude/depth/duration/date-range controls in
  the same bottom row (see below), not just the date scrubber

**Local state**: `focusedHazardCode` (see data-model.md; replaces Revision 1's
`selectedHazardTypeId`).

## `AppHeader.vue`

**Props**: none — reads `useAuthStore()`, `useUIStore()`, `useGeolocationStore()`, and
`vue-i18n`'s composer directly (all already app-wide singletons; no prop-drilling needed).

**Emits**: none.

**Contains, left to right**:
1. Brand/logo (moved from `SidebarPanel.vue`'s `sidebar-brand` — icon + "MHEWS" + subtitle)
2. *(spacer)*
3. Panel button — calls `uiStore.toggleDashboardPanel()`
4. Konum control — button that opens a `Popover` containing the alert-radius `Slider`
   (`geoStore.alertRadius`/`setAlertRadius`) and the "only my region" toggle
   (`disasterStore.showOnlyMyRegion`, only shown when `hasMyRegion` — mirrors the sidebar's own
   `v-if`)
5. World-shape toggle — same 3D/2D switch semantics as the sidebar's `switch-3d-cyan`
   (`uiStore.transitionToGlobe()` / `uiStore.transitionToMap(...)`)
6. Language dropdown
7. Account dropdown (rightmost edge)

Per spec FR-002/FR-004b.

## `HazardTypeNav.vue`

**Props**: `focused: string | null` (v-model).
**Emits**: `update:focused(code: string | null)`.
**Data source**: the same fixed `disasterTypes` list `SidebarPanel.vue` defines (NOT
`useHazardTypesStore()` — see research.md §7), rendered sorted the same way
(`visibleDisasterTypes` logic: active-with-data first, by count).
**Click behavior**: toggles `disasterStore.toggleLayer(code)` AND emits `update:focused(code)`
(or `null` if the just-clicked code was already both active and focused — spec US2 scenario 3).
**Active-state source**: `disasterStore.isLayerActive(code)` per chip (unrelated to which one is
focused).

## `HazardFocusRow.vue` (replaces `HazardSubMenu.vue`)

**Props**: `hazardCode: string` (required).
**Emits**: none (quick-access links navigate via existing router).
**Renders**: active count + top severity + full per-severity breakdown for `hazardCode` (from
`disasterStore`'s existing type-keyed event getters, same aggregation `SidebarPanel.vue`'s
`severityBreakdown` computed already does, scoped to one type) and quick-access links. No
forecast/trend indicator in this pass — deferred, see research.md §8.

## `FooterStatusRow.vue` (new)

**Props**: none — reads `useUIStore()`/`useDisasterStore()` directly.
**Emits**: none.
**Contains**: the `Normal/Hexagon/Heatmap` `ToggleGroup` (`uiStore.mapMode`/`toggleMapMode`) +
hex-resolution `Slider` (`uiStore.manualHexResolution`/`setManualHexResolution`, disabled unless
`mapMode === 'hexagon'`) + severity legend (`disasterStore.toggleSeverity`/`isSeverityActive`) +
a small last-updated/source-health badge (relocated from `SidebarPanel.vue`'s `sidebar-footer`).
All bindings moved verbatim from `SidebarPanel.vue`'s `viewMode`/`severityLegend` sections —
see research.md §9.

## `DateScrubberFooter.vue` (bottom footer row — extended)

**Props**: none — reads `useDisasterStore()` directly for the filter controls; date-scrubber
selection stays local/presentational (unchanged from Revision 1, research.md §6).
**Emits**: none.
**Contains, left to right**:
1. Magnitude/Depth/Duration sliders — bound to `disasterStore.minMagnitude`/`maxDepth`/
   `selectedTimeRange`, moved verbatim from `SidebarPanel.vue`'s `magnitudeDepth` section
   (including its `dateFilterMode` mutual-exclusivity behavior with the calendar picker below)
2. Horizontal date scrubber (Revision 1, unchanged, presentational)
3. Calendar start/end date-range picker — bound to `disasterStore.startDate`/`endDate` via the
   moved `applyDateRange`/`clearCalendarRange` functions, mutually exclusive with the duration
   slider in (1) via the moved `dateFilterMode` ref (see spec's Edge Cases: this exclusivity is
   explicitly preserved even though the two controls are no longer in the same accordion
   section)

## Backward-compatibility contract

None of `HomeView.vue`, `CapView.vue`, `IncidentsView.vue`, `ShelterInfoView.vue`,
`HazardEncyclopediaView.vue`, `AdminView.vue`, `AccountSecurityView.vue`, `LoginView.vue`,
`PublicPortalView.vue`, `ReportHazardView.vue` may have their template, script, or props
signature changed by this feature (FR-008). If any of the above appears to need a change to fit
under `MainLayout`, that is a signal the plan/tasks need revisiting, not a silent scope
expansion.

`SidebarPanel.vue` IS expected to change (FR-010/FR-011) — this is the one exception to the
"don't touch existing components" rule, since it's the migration source, not a page component.
