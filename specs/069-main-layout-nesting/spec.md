# Feature Specification: Main Layout Shell (Nested Routing)

**Feature Branch**: `069-main-layout-nesting`

**Created**: 2026-08-16

**Status**: Draft (revised — see "Revision 2" note below; still the same feature/spec, scope grew after User Story 1's shell shipped)

**Input**: User description: "Ana ekran için MainLayout mimarisine geçiş: src/layouts/MainLayout.vue oluşturulacak (header: dil dropdown + kullanıcı dropdown menüsü; ikinci satır: afet tipi menüsü; üçüncü satır: seçili afete göre açılan alt menü; footer: kaydırmalı tarih şeridi). Router, mevcut flat route yapısından nested route yapısına geçecek: /login, /portal, /report gibi public sayfalar MainLayout dışında kalacak; /, /map, /:countryCode, /alerts/cap, /alerts/incidents, /shelters, /hazards, /admin, /account-security gibi authenticated sayfalar MainLayout'un children'ı olacak ve içerik <router-view/> ile MainLayout içinde render olacak. Mevcut davranışta (auth guard, route isimleri, url yapısı) hiçbir değişiklik olmayacak — sadece layout/nesting eklenecek, mevcut sayfa içerikleri (HomeView, CapView, vb.) değişmeyecek."

**Revision 2 input** (2026-08-16, same session — extends the spec above rather than replacing it): The left sidebar's controls (`SidebarPanel.vue`) get redistributed into the shell instead of duplicated:
- **Header**: brand/logo (moved from the sidebar's top), plus — on the right, before the language/account dropdowns — a "Panel" (dashboard) button, a "Konum" (location) control, and the 3D-globe/2D-map world-shape toggle.
- **Hazard row (row 2)**: no longer opens a generic contextual sub-menu. It becomes the same multi-select disaster-type filter the sidebar already has (toggle each type's map layer on/off). Whichever chip was most recently toggled also becomes "focused."
- **Focus row (row 3, replaces the old sub-menu concept)**: shows a live insight strip for the focused hazard type — active count, top severity, a forecast/trend indicator (reusing the app's existing forecast data), and quick-access links — and may enable that hazard's own interactive map layers.
- **Footer row 1 (new, above the date scrubber)**: the map "Durum" selector (Normal/Hexagon/Heatmap — Petek/Isı), the hex-resolution slider (enabled only in Hexagon mode), and the severity/density legend (click-to-filter behavior preserved from the sidebar).
- **Footer row 2 (bottom, unchanged from Revision 1)**: magnitude/depth/duration filter sliders on the left, the horizontal date scrubber in the center, the calendar start/end date-range picker on the right.
- Once migrated, the corresponding sections are **removed from `SidebarPanel.vue`** (not kept as a duplicate second control surface) — country banner, last-updated/source-health status, and anything not explicitly migrated above relocate into the header/footer as small badges rather than being lost.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent shell across authenticated pages (Priority: P1)

A logged-in user navigates between the map, CAP alerts, incidents, shelters, hazards, admin, and account-security pages. On every one of these pages they see the same persistent header (language switcher + account menu), the same hazard-type navigation row, and the same date scrubber at the bottom — only the content area in the middle changes.

**Why this priority**: This is the entire point of the change — a shared shell instead of each page reimplementing its own chrome. Without this, the feature has no value.

**Independent Test**: Log in, visit `/`, `/alerts/cap`, `/shelters`, `/hazards`, `/admin`, `/account-security` in sequence. Header, hazard-type row, and footer must remain mounted/visible and identical in position on every page; only the inner content changes.

**Acceptance Scenarios**:

1. **Given** a logged-in user on the home/map page, **When** they navigate to `/alerts/cap`, **Then** the header, hazard-type row, and footer remain visible and only the central content area swaps.
2. **Given** a logged-in user on any authenticated page, **When** they select a different language from the header dropdown, **Then** the whole app (including the currently displayed page content) re-renders in the new language without a full page reload.
3. **Given** a logged-in user, **When** they open the account dropdown menu, **Then** it shows the same account actions available today (e.g. profile/security, logout) regardless of which authenticated page they are on.

---

### User Story 2 - Hazard-type row filters the map and focuses one hazard's insight strip (Priority: P2) — supersedes the original "sub-menu" story

A user clicks a hazard type (e.g. "Flood") in the second header row. This does two things at once: it toggles that hazard type's map layer on/off (same multi-select behavior the sidebar's disaster filter already has — several types can be active simultaneously), and it makes the just-clicked type the "focused" one. A third row appears showing a live insight strip for the focused hazard type only — active event count, highest current severity, a forecast/trend indicator, and quick-access links — and may enable that hazard's own interactive map layers. Clicking a different hazard type re-focuses the strip on that type (without un-toggling the previous type's map layer); clicking the focused type's own chip again removes both its focus and its layer.

**Why this priority**: This is new interactive surface being introduced, but it is secondary to the structural shell existing at all (P1). It can be delivered right after the shell without depending on other stories.

**Independent Test**: On any authenticated page, click a hazard type in the row; verify its map layer toggles and the insight strip appears focused on it. Click a second, different hazard type without touching the first; verify the first type's layer stays active while the insight strip re-focuses on the second type.

**Acceptance Scenarios**:

1. **Given** no hazard type has ever been focused, **When** the page loads, **Then** the third-row insight strip is not shown and layout does not shift unexpectedly.
2. **Given** hazard type A is focused, **When** the user clicks hazard type B, **Then** the insight strip updates to show B's live data and A's map layer remains however it was left (still active if it was on).
3. **Given** hazard type A's chip is both active (layer on) and focused, **When** the user clicks A's chip again, **Then** A's map layer turns off and the insight strip clears (no hazard focused).
4. **Given** hazard type A is focused, **When** the underlying event/forecast data for A updates, **Then** the insight strip's count/severity/forecast reflect the new data without requiring the user to re-click the chip.

---

### User Story 4 - Header consolidates Panel, Location, and world-shape controls (Priority: P2)

A logged-in user finds the app's brand/logo at the header's left edge (moved from the old sidebar), and on the right — before the language and account dropdowns — three controls: a "Panel" button that opens the existing dashboard, a "Konum" (location) control that reveals the alert-radius slider and "only my region" toggle in a popover/tooltip when clicked, and a 3D-globe/2D-map world-shape toggle. These behave exactly as their sidebar equivalents did.

**Why this priority**: Consolidates navigation/view controls the sidebar removal (User Story 6) depends on having a new home for — must land before or alongside the sidebar cleanup.

**Independent Test**: Click "Panel" and verify the dashboard opens exactly as the old sidebar's Panel button did. Click "Konum" and verify the radius slider/region toggle appear in a popover without navigating away. Toggle the world-shape control and verify the globe/map view switches exactly as the sidebar's switch did.

**Acceptance Scenarios**:

1. **Given** a logged-in user, **When** they click the header's "Panel" button, **Then** the same dashboard panel the sidebar's button used to open appears.
2. **Given** a logged-in user, **When** they click "Konum", **Then** a popover opens showing the alert-radius slider and region toggle, and adjusting them has the same effect they had in the sidebar.
3. **Given** a logged-in user, **When** they click the world-shape toggle, **Then** the view switches between the 3D globe and 2D map exactly as the sidebar's switch did, with no change in transition behavior.

---

### User Story 5 - Footer status row exposes Durum/density controls (Priority: P2)

Above the date-scrubber footer, a new footer row shows the map's display mode selector (Normal / Hexagon-"Petek" / Heatmap-"Isı"), a hex-resolution slider that is only interactive when Hexagon mode is active, and the severity/density legend. Clicking a legend entry filters events by that severity, exactly as the sidebar's legend did.

**Why this priority**: Completes the sidebar-to-shell migration alongside User Story 4; independent of the hazard-focus row (US2) and the bottom filter row (US1).

**Independent Test**: Switch to Hexagon mode and verify the resolution slider becomes interactive; switch to Normal or Heatmap and verify it becomes disabled again. Click a severity legend entry and verify events of that severity are filtered exactly as the sidebar's legend used to.

**Acceptance Scenarios**:

1. **Given** the map is in Normal or Heatmap mode, **When** the user looks at the hex-resolution slider, **Then** it is visibly disabled/non-interactive.
2. **Given** the user switches to Hexagon mode, **When** they adjust the resolution slider, **Then** the map's hexagon aggregation resolution changes exactly as it did from the sidebar.
3. **Given** the severity legend is visible, **When** the user clicks a severity level, **Then** events of that severity are toggled out of view, matching the sidebar's existing toggle behavior.

---

### User Story 6 - Sidebar retires its migrated sections (Priority: P3)

Once Panel/Konum/world-shape (US4), Durum/hex/legend (US5), and hazard filter/focus (US2) all have a working home in the shell, `SidebarPanel.vue` no longer shows duplicate controls for the same state. Its migrated accordion sections (disaster filters, severity legend, magnitude/depth/duration filters, view-mode section, location section, the standalone Panel button, and the brand/logo header) are removed. Anything not explicitly migrated (country banner, last-updated timestamp, source-health count) relocates into a small badge in the header or footer rather than being dropped.

**Why this priority**: Cleanup/consistency work — depends on US1, US2, US4, and US5 all being functionally complete first, so it's last.

**Independent Test**: Open the app after US1/US2/US4/US5 are done; confirm the sidebar shows no controls that duplicate header/footer functionality, and confirm the country banner, last-updated time, and source-health count are still visible somewhere in the shell.

**Acceptance Scenarios**:

1. **Given** all of US1/US2/US4/US5 are implemented, **When** a user opens the sidebar (if it still exists as a UI element at all), **Then** it contains no control that duplicates a header/footer control's state.
2. **Given** the sidebar's migrated sections are removed, **When** a user looks at the shell, **Then** the country banner, last-updated timestamp, and source-health count are still visible and functioning somewhere in the header or footer.

---

### User Story 3 - Public/unauthenticated pages remain unaffected (Priority: P1)

A user who is not logged in visits `/login`, `/portal`, or `/report`. These pages continue to render exactly as before, without the new header/hazard-menu/footer shell, since that chrome assumes an authenticated session (account menu, hazard data).

**Why this priority**: Regressing the public-facing login, public portal, or anonymous hazard-report flow would break access for citizens and staff alike — equal priority to the shell itself existing correctly.

**Independent Test**: Without logging in, visit `/login`, `/portal`, and `/report` directly by URL; confirm each renders as it does today (no header/footer shell, no redirect changes, no console errors) and the anonymous hazard report can still be submitted.

---

### Edge Cases

- What happens when a user is mid-navigation (e.g. route transition) while the language dropdown changes — does the focused hazard type persist across route changes within the shell, or reset?
- How does the shell behave on routes that carry a `:countryCode` param — does the header need to reflect the selected country, or stay generic?
- What happens if a logged-in user's session expires while they're inside the shell (e.g. focus row open) — does the auth guard redirect still work the same as it does today from a bare page?
- How does the shell render on a very narrow (mobile) viewport where header, hazard row, focus row, footer status row, and footer filter row together may not all fit comfortably?
- What happens when the hex-resolution slider is adjusted while Hexagon mode is not active — is the underlying value still remembered for when the user switches back to Hexagon, matching the sidebar's "persistent affordance" behavior?
- What happens when a hazard type is toggled off (its layer removed) while it is also the currently focused type — does the focus row clear, or does it keep showing the now-inactive type's last-known data?
- What happens to the calendar date-range picker's mutually-exclusive relationship with the duration slider (today: moving one clears the other) once they live in different footer rows instead of the same sidebar section — does that exclusivity still need to hold?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST render a persistent shell (header + hazard-filter row + hazard-focus row + footer status row + footer filter/date row) around every route that today requires authentication, without altering which routes require authentication.
- **FR-002**: The shell's header MUST provide, from left to right: the app brand/logo, then (on the right side, before language/account) the Panel button, the Konum control, and the world-shape (3D/2D) toggle, then the language selector, then the account dropdown menu furthest to the edge — matching the app's current language-switch and account-menu behavior (same options, same effect).
- **FR-003**: The hazard row MUST behave as a multi-select filter — selecting a hazard type toggles that type's map layer on/off (same semantics as the sidebar's existing disaster-type toggle), independent of any other type's state.
- **FR-003a**: The most recently toggled hazard type MUST become "focused"; the focus row MUST show that type's live active-event count, highest current severity, a per-severity breakdown, and quick-access links, and MUST update reactively as the underlying data changes — no focus is shown before any type has ever been clicked. (A richer forecast/trend indicator sourced from the dashboard's existing Forecast panel is a plausible follow-up, deferred — that panel is region/horizon-scoped and integrating it cleanly for all 9 hazard types is a separate concern from this shell migration; see research.md §8.)
- **FR-004**: The shell MUST provide a footer containing, in this bottom row: magnitude/depth/duration filter sliders on the left, a horizontally scrollable date-scrubber control in the center, and the calendar start/end date-range picker on the right — present on every authenticated page that uses the shell.
- **FR-004a**: The shell MUST provide a footer status row above the date-scrubber row containing: the map display-mode selector (Normal/Hexagon/Heatmap), a hex-resolution slider that is only interactive while Hexagon mode is active, and the severity/density legend with the same click-to-filter-by-severity behavior the sidebar's legend has today.
- **FR-004b**: The header's Panel button, Konum control, and world-shape toggle MUST reuse the app's existing dashboard-open, geolocation/alert-radius, and globe/map-transition behavior respectively — no new backend or state logic, only relocation.
- **FR-005**: The system MUST continue to render `/login`, `/portal`, and `/report` (and any other route already marked public) without the new shell, exactly as they render today.
- **FR-006**: The system MUST preserve all existing route names, URL paths, and the `:countryCode` param pass-through exactly as they exist today — this change MUST NOT rename, move, or remove any route.
- **FR-007**: The system MUST preserve the existing authentication guard behavior (login redirect, role checks, MFA challenge redirect, MFA-enrollment redirect) unchanged for every route, whether or not it is nested under the shell.
- **FR-008**: The system MUST NOT change the internal content or logic of existing page components (e.g. HomeView, CapView, IncidentsView, ShelterInfoView, HazardEncyclopediaView, AdminView, AccountSecurityView) as part of this change — only where/how they are mounted changes.
- **FR-009**: Direct URL access (deep link / hard refresh) to any authenticated route MUST still work and MUST still render inside the shell after the auth guard passes, matching today's behavior of direct URL access working for every route.
- **FR-010**: Once a sidebar section's functionality is confirmed working in the shell (header or footer), the system MUST remove that section from `SidebarPanel.vue` rather than leave two controls editing the same state — specifically: the disaster-filter accordion, severity legend, magnitude/depth/duration filters, view-mode section (world-shape switch + Durum/hex), location section, the standalone Panel button, and the brand/logo header block.
- **FR-011**: Sidebar content not explicitly migrated to a header/footer control (country banner, last-updated timestamp, source-health count) MUST still be visible and functioning somewhere in the shell after FR-010's removal — it MUST relocate, not disappear.

### Key Entities

- **Hazard type**: A category shown in the shell's hazard row (e.g. flood, fire, storm, earthquake), sourced from the app's existing fixed disaster-type list (the same one `SidebarPanel.vue`'s disaster accordion already uses) — not the broader admin hazard taxonomy. Each has an independent active/inactive (layer) state.
- **Focused hazard type**: At most one hazard type at a time — the most recently toggled one. Drives the focus row's content (count/severity/forecast/quick-links) and may enable that type's interactive map layers. Independent of which types are currently active/layered.
- **Map display mode ("Durum")**: One of Normal / Hexagon ("Petek") / Heatmap ("Isı") — an existing `uiStore` concept (`mapMode`), not newly introduced.
- **Hex resolution**: An existing `uiStore` value, only meaningful/editable while display mode is Hexagon.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of currently authenticated routes (home, map, country, country-map, cap, incidents, shelters, hazards, admin, account-security) render inside the shared shell with zero change to their inner content or behavior, verified by existing route/navigation tests continuing to pass unmodified.
- **SC-002**: 100% of currently public routes (login, portal, report) render with zero visual or behavioral change from before this feature, verified by manual check of each URL both logged-out and logged-in.
- **SC-003**: Toggling a hazard type and re-focusing the focus row updates in under 100ms perceived delay (client-side state change, no network round-trip required to reveal it).
- **SC-004**: Zero regressions in the existing authentication/authorization test suite (login redirect, role-gated `/admin`, MFA challenge/enrollment redirects) after the routing restructure.
- **SC-005**: Every control migrated from the sidebar (Panel, Konum/radius, world-shape, Durum/hex, severity legend, magnitude/depth/duration, date range) produces the exact same underlying state change it did in the sidebar, verified by reusing/adapting the sidebar's own existing logic rather than reimplementing it — zero net-new filtering/view-mode behavior.
- **SC-006**: After sidebar cleanup (FR-010/FR-011), no control exists in two places at once — a user can find each piece of functionality in exactly one location in the shell.

## Assumptions

- The hazard types shown in the shell's hazard row come from the app's existing fixed disaster-type list (mirroring `SidebarPanel.vue`'s disaster accordion), not the broader admin-configurable hazard taxonomy store.
- The account dropdown menu reuses the app's existing account/session actions (e.g. profile/security, sign out) rather than introducing new ones.
- The footer's bottom-row date scrubber is presentational in this spec (as established for User Story 1) — the calendar date-range picker to its right is the control that actually drives `disasterStore.startDate`/`endDate`, matching the sidebar's existing mutually-exclusive duration-vs-calendar filter logic.
- The focus row's "forecast/trend indicator" reuses existing forecast/confidence data already computed elsewhere in the app (e.g. the dashboard's Forecast panel) rather than introducing a new forecasting computation.
- Visual design (colors, spacing, exact icon set) is intentionally left to implementation/design pass; this spec fixes structure and behavior, not pixel-level styling.
- Mobile/responsive behavior follows the app's existing responsive conventions; no new breakpoint strategy is introduced by this spec.
- This is treated as a refactor of app shell/routing, not a new user-facing capability — so no new backend/API work is implied.
- Migrating sidebar logic means moving/adapting the existing computed properties, functions, and state (magnitude/depth/duration sliders, calendar date-range apply/clear, view-mode switch, hex mode + resolution, geolocation/alert-radius, severity legend toggle, source-health status) into the new components — not rewriting their behavior from scratch.
