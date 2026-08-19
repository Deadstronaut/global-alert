# Phase 1 Data Model: Main Layout Shell (Nested Routing)

This feature introduces no new persisted/backend entities. It composes existing Pinia store
state into new presentational components and adds a small amount of local UI state inside
`MainLayout.vue`. Documented here for completeness since the spec's Key Entities section names
"Hazard type."

## Existing entities reused (no schema change)

### Disaster type (from `useDisasterStore()`) — supersedes the original "Hazard Type" entity below
- **Represents**: One of the app's fixed 9 disaster categories (earthquake, wildfire, flood,
  drought, food_security, tsunami, cyclone, volcano, epidemic) — the same list
  `SidebarPanel.vue`'s disaster accordion already defines (icon + css class + i18n label key per
  type), not the admin-configurable hazard taxonomy.
- **Used by**: `HazardTypeNav.vue` (renders the filter chips, reads `disasterStore.isLayerActive`/
  calls `disasterStore.toggleLayer`), `HazardFocusRow.vue` (reads per-type event counts/severity
  off `disasterStore`'s existing type-keyed getters, e.g. `disasterStore.earthquakes`).
- **Relationship to this feature**: Read/toggle of existing `disasterStore.activeLayers` (a
  `Set<string>`). No new fields, no new store actions — `toggleLayer`/`isLayerActive` already
  exist.
- ~~Hazard Type (from `useHazardTypesStore()`)~~ — Revision 1 used the admin taxonomy store for
  this row; Revision 2 replaces it with the above per the research.md §7 correction. The
  taxonomy store is no longer read by any shell component.

### Focused disaster type (new, local UI state — see below)
- **Represents**: At most one disaster-type code — whichever chip was most recently toggled.
- **Used by**: `HazardFocusRow.vue` to decide what to render; may be read by map-layer-activation
  logic to enable that type's interactive layers (existing per-type layer toggle, not new).

### Map display mode / hex resolution (from `useUIStore()`)
- **Represents**: `uiStore.mapMode` (`'normal' | 'hexagon' | 'heatmap'`) and
  `uiStore.manualHexResolution` — both pre-existing.
- **Used by**: `FooterStatusRow.vue`'s Durum selector and resolution slider — moved verbatim from
  `SidebarPanel.vue`'s `hex-panel` block.
- **Relationship to this feature**: Read/write of existing store fields via existing actions
  (`uiStore.toggleMapMode`, `uiStore.setManualHexResolution`). No new fields.

### Severity (from `useDisasterStore()`)
- **Represents**: `critical | high | moderate | low | minimal`, with an existing
  `activeSeverities` toggle set.
- **Used by**: `FooterStatusRow.vue`'s legend, calling the existing `disasterStore.toggleSeverity`/
  `isSeverityActive` — moved verbatim from `SidebarPanel.vue`'s `severityLegend` section.

### Alert radius / geolocation (from `useGeolocationStore()`)
- **Represents**: `geoStore.alertRadius` (km) and tracking/location state, pre-existing.
- **Used by**: The header's "Konum" popover — moved verbatim from `SidebarPanel.vue`'s
  `location` section (`setAlertRadius`, `handleLocate`, `showOnlyMyRegion`).

### Session / Account (from `useAuthStore()`)
- **Represents**: The current authenticated user's session (role, identity), already used by
  `authGuard` for route gating.
- **Used by**: `AppHeader.vue`'s account dropdown (display + `logout()` action + link to the
  existing `/account-security` route). Note: the store's real method is `logout()`, not
  `signOut()` — the earlier draft of this doc named it wrong; the implementation already uses
  the correct name.
- **Relationship to this feature**: Read-only consumer + calls one existing action (`logout()`).
  No new fields.

### Locale (from `vue-i18n`'s global composer)
- **Represents**: The active UI language (`tr`, `en`, `es`, `fr`, `ru`, `ar`, `zh`).
- **Used by**: `AppHeader.vue`'s language dropdown, setting the same reactive `locale` ref other
  parts of the app already set (e.g. `HomeView.vue`'s `locale.value = config.defaultLocale`).
- **Relationship to this feature**: Read/write of an existing reactive value. No new locale
  codes, no new i18n mechanism.

## New local UI state (component-scoped, not persisted)

### `MainLayout.vue` local state
| Field | Type | Description |
|---|---|---|
| `focusedHazardCode` | `string \| null` | Which disaster type's insight strip (if any) is shown in the focus row. Set on every `HazardTypeNav` toggle click (to the clicked type) and cleared when that same type is toggled back off while focused (spec US2 scenario 3). Resets to `null` on route navigation, same as Revision 1's `selectedHazardTypeId` it replaces. |

### `DateScrubberFooter.vue` local state (bottom footer row — filters + date)
| Field | Type | Description |
|---|---|---|
| `selectedDate` | `Date \| string` | Currently highlighted date in the scrubber. Presentational only — not wired to data filtering (see research.md §6). |
| `visibleRangeStart` | `Date \| string` | Left edge of the currently-scrolled-into-view date window, for scroll-position bookkeeping. |

Magnitude/depth/duration sliders and the calendar date-range picker in this same row are NOT new
local state — they bind directly to `disasterStore.minMagnitude`/`maxDepth`/`selectedTimeRange`/
`startDate`/`endDate`, moved from `SidebarPanel.vue` along with its `dateFilterMode`
('duration' | 'calendar') mutual-exclusivity ref and its `applyDateRange`/`clearCalendarRange`/
`handleTimeSliderInput` functions.

### `FooterStatusRow.vue` local state
None new — every control binds to existing `uiStore`/`disasterStore` fields (see entities
above).

No validation rules beyond standard prop typing — this feature has no forms, no persisted
writes, and no new database/API contracts.
