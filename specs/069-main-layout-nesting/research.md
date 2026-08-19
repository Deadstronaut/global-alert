# Phase 0 Research: Main Layout Shell (Nested Routing)

## 1. Nested route restructuring in vue-router 5

**Decision**: Wrap authenticated routes as `children` of one new parent route
(`path: '/'`, `component: () => import('@/layouts/MainLayout.vue')`), keep public routes
(`/login`, `/portal`, `/report`, `/mfa-challenge`) as separate top-level route objects outside
that parent, exactly as they are today.

**Rationale**: vue-router resolves nested `children` by rendering the parent's `<router-view/>`
with the matched child component — this is the framework's built-in layout mechanism, requires
no additional library, and is what the existing route array already structurally supports
(children paths become relative, e.g. `'alerts/cap'` instead of `'/alerts/cap'`). The single
existing `router.beforeEach(authGuard)` global guard keeps firing for every navigation
regardless of nesting depth, so FR-007 (auth guard unchanged) holds without touching
`authGuard`'s implementation at all.

**Alternatives considered**:
- *Per-route `meta.layout` flag read by `App.vue` to conditionally wrap a component*: rejected —
  requires `App.vue` to branch on every route's meta and manually mount a wrapper, duplicating
  what vue-router's native nested-route rendering already does for free, and is harder to test
  (route matching vs. ad-hoc conditional rendering).
- *Duplicate header/footer markup inside each view component*: rejected outright by the spec's
  own premise (P1 story) and by Constitution Principle VIII (Simplicity/YAGNI) — violates DRY.

## 2. Where MainLayout mounts relative to existing loading/AI-widget logic

**Decision**: `App.vue` keeps `<RouterView v-if="!isLoading"/>` unchanged. Because `MainLayout`
is just the `component` of the new parent route, `RouterView` renders `MainLayout`, and
`MainLayout` renders its own nested `<RouterView/>` for the actual page. `AiAssistantWidget` and
`LoadingScreen` stay at the `App.vue` level (outside `MainLayout`), since they're already global
overlays unrelated to per-page chrome — no change needed there.

**Rationale**: Keeps the blast radius to `router/index.js` + one new file tree; `App.vue`'s
`onMounted` store-warming (`disasterStore.startWebSocket()`, `hazardTypesStore.fetchHazardTypes()`,
etc.) already runs before any route renders, so `MainLayout`'s `HazardTypeNav` can safely assume
`hazardTypesStore` data is being fetched/warmed by the time it mounts.

**Alternatives considered**: Moving the store-warming `onMounted` calls into `MainLayout` —
rejected, since public routes (`/login`, `/portal`, `/report`) don't need hazard/SOP/map-layer
data and moving warming into MainLayout would delay it until after auth, changing today's boot
timing (out of scope per FR-008).

## 3. Language dropdown — wiring to existing i18n

**Decision**: `AppHeader.vue`'s language dropdown calls the same locale-switch mechanism already
used elsewhere (`locale.value = <code>` against the app's shared `i18n` instance from
`vue-i18n`'s `useI18n()`/global composer), covering all 7 existing locale codes (tr, en, es, fr,
ru, ar, zh) sourced from `src/i18n/locales/*.json`'s existing key set — no new locale added.

**Rationale**: `HomeView.vue` already does `locale.value = config.defaultLocale` on init, proving
the app's locale switch point is a plain reactive `locale` ref from `vue-i18n`; reusing it avoids
inventing a second i18n mechanism (Constitution Principle VI + VIII).

**Alternatives considered**: A new `useLocale()` store — rejected as unnecessary indirection for
a single reactive value already exposed by `vue-i18n`'s composer (YAGNI).

## 4. Account dropdown — no existing header UI to reuse, but existing store actions to wire to

**Decision**: `AppHeader.vue`'s account dropdown is new UI (no prior header/account-menu
component exists in the codebase today), but its actions call existing `useAuthStore()` methods
— confirmed `auth.js` already exposes `signOut()` — plus a link to the existing
`/account-security` route (already a named route, FR-006 requires no route changes).

**Rationale**: Grepped the codebase for `signOut`/`logout`/account-menu markup; `signOut` exists
only in the store, with no current dropdown consumer — so this dropdown is new presentation
wired to pre-existing store/route surface, not a duplicate of something already built elsewhere.

**Alternatives considered**: None — this is a straightforward "build the missing UI, wire to
existing store method" case.

## 5. Hazard type row + contextual sub-menu data source

**Decision**: `HazardTypeNav.vue` reads hazard types from the existing `useHazardTypesStore()`
(already warmed at boot in `App.vue`, already the taxonomy source for 6+ other selectors per
existing code comments). `HazardSubMenu.vue` receives the currently-selected hazard type as a
prop/local ref from `MainLayout` and renders a small, static set of contextual links per hazard
category (e.g. active alerts / historical data / map layer — see spec User Story 2); no new
per-hazard-type backend data is required for v1 per the spec's Assumptions section.

**Rationale**: Satisfies Constitution Principle I (hazard-agnostic, model-driven) — the nav reads
the taxonomy from data, not a hard-coded hazard list, so adding a new hazard type via the
existing `hazardTypes` store automatically appears in this row with no code change here.

**Alternatives considered**: Hard-coding the 5 hazard categories shown in the earlier UI mockup
directly in `HazardTypeNav.vue` — rejected, violates Principle I and would require a code change
every time an admin adds a hazard type via the existing taxonomy admin UI.

## 6. Footer date scrubber

**Decision**: `DateScrubberFooter.vue` is a presentational, horizontally-scrollable date-list
control (local component state for the visible date range + "selected date"), with no data
wiring to map/content filtering in this feature (per spec Assumptions — wiring is explicitly
out of scope unless already implied by existing `HomeView` behavior, which it is not).

**Rationale**: Keeps this feature's scope to structure/shell (spec's own framing), avoids
speculative coupling to `HomeView`'s map-filtering logic before that's actually specified.

**Alternatives considered**: Wiring it immediately to `disasterStore`/map date filtering —
rejected as scope creep beyond what spec.md's FR list actually requires (FR-004 only requires
the control to exist and be present).

## Revision 2 research (sidebar migration)

## 7. Hazard row's data source: fixed disaster list, not the admin taxonomy store

**Decision**: `HazardTypeNav.vue` switches from `useHazardTypesStore().activeHazardTypes` to the
same fixed `disasterTypes` array `SidebarPanel.vue` already defines (9 entries: earthquake,
wildfire, flood, drought, food_security, tsunami, cyclone, volcano, epidemic — each with an
icon/css-class/i18n label key), and toggling a chip calls `disasterStore.toggleLayer(code)` /
reads `disasterStore.isLayerActive(code)`, exactly as the sidebar's disaster accordion buttons
already do.

**Rationale**: User correction mid-session — the header row must act as the same disaster-type
*filter* the sidebar has today ("katmanlar değil, afetler" / "it must work like the sidebar
filter"), not a generic taxonomy browser. The two lists happen to share the same codes
(`FALLBACK_HAZARD_TYPES` in `hazardTypes.js` matches `disasterTypes` in `SidebarPanel.vue`
1:1), but the *behavior* users asked for — toggle-on/off, count-based sort, icon set — belongs
to the sidebar's fixed list, not the admin-configurable taxonomy (which can contain org-specific
codes/thresholds irrelevant to a quick filter row).

**Alternatives considered**: Keep reading from `hazardTypesStore` but add toggle semantics on
top — rejected: would diverge from the sidebar's exact behavior (sort-by-count-then-active,
specific icon/css per type) that's being migrated, and the taxonomy store doesn't carry an
icon/css-class field the fixed list already has.

## 8. Focus row replaces the sub-menu: reuses existing severity data; forecast integration deferred

**Decision**: `HazardFocusRow.vue` (renamed from the earlier `HazardSubMenu.vue` concept)
computes its count/severity-breakdown from `disasterStore`'s existing per-type event getters
(the same `storeRefs` map `SidebarPanel.vue`'s `severityBreakdown` computed already uses),
scoped to the one focused type. It does **not** integrate the dashboard's `ForecastPanel.vue`
API (`fetchForecastOutlook(horizon, regionCode, variable)`) — that panel is region/horizon-scoped
and keyed by forecast *variable*, not by all 9 disaster-type codes 1:1, so wiring it into a
compact header-adjacent strip is a separate, non-trivial integration rather than a relocation.
FR-003a was revised to describe the severity breakdown actually built, with the richer forecast
indicator noted as a deferred follow-up rather than claimed as delivered.

**Rationale**: SC-005 (Revision 2) requires reuse over reimplementation, not "reuse or invent
something forecast-shaped." `severityBreakdown` in `SidebarPanel.vue` already does exactly the
count/severity aggregation this row needs — moving that logic, scoped to one type, is genuine
reuse. Claiming a forecast integration without actually building the region/horizon plumbing it
needs would violate the "internally consistent" bar the user set for this spec.

**Alternatives considered**: Build a real per-hazard-type forecast summary now — rejected for
this pass as scope creep beyond a shell/layout migration; flagged as a legitimate future
enhancement instead of silently dropped or faked.

## 9. Footer status row: Durum/hex/legend move verbatim from the sidebar's "View Mode" section

**Decision**: `FooterStatusRow.vue` hosts the exact controls currently inside
`SidebarPanel.vue`'s `viewMode`-section `hex-panel` block (the `Normal/Hexagon/Heatmap`
`ToggleGroup` bound to `uiStore.mapMode`/`uiStore.toggleMapMode`, and the hex-resolution
`Slider` bound to `uiStore.manualHexResolution`, disabled unless `mapMode === 'hexagon'`) plus
the `severityLegend` section's severity-dot buttons (`disasterStore.toggleSeverity`/
`isSeverityActive`) — moved, not recreated.

**Rationale**: Same reuse principle (SC-005) — this logic already has a documented bug-fix
history in its own code comments (spec 045's "persistent affordance" note on the resolution
slider); rewriting it risks losing that fix.

**Alternatives considered**: None — this is a straightforward relocation, no design decision
needed beyond "move the existing markup/bindings to the new component."

## 10. Header's Panel/Konum/world-shape: relocate existing triggers, not new state

**Decision**: The header's "Panel" button calls the same `uiStore.toggleDashboardPanel()` the
sidebar's `sidebar-action-btn` called. "Konum" opens a `Popover` (matching the app's existing
`Popover`/`PopoverTrigger`/`PopoverContent` usage elsewhere, e.g. the sidebar's own date-picker
popovers) containing the sidebar's existing alert-radius `Slider` (`geoStore.alertRadius`/
`setAlertRadius`) and "only my region" toggle — not a full re-implementation of the location
section's locate-me button (that stays reachable via the same popover). The world-shape toggle
calls the same `handleViewModeSwitch`-equivalent logic (`uiStore.transitionToGlobe()` /
`uiStore.transitionToMap(...)`) the sidebar's `switch-3d-cyan` checkbox already used.

**Rationale**: User explicitly asked for a popover/tooltip-style reveal for the radius slider
("bu basınca yarı çap slider... tooltip ile çıksın"); reusing `uiStore`/`geolocationStore`
methods directly (not new header-local state) keeps FR-004b's "no new backend or state logic"
constraint satisfied.

**Alternatives considered**: A full location panel/route — rejected, over-scoped for what's
just an alert-radius slider + one toggle button; a popover matches the existing UI vocabulary.

## 11. SidebarPanel.vue: delete migrated sections outright, relocate the rest

**Decision**: Once each migrated section is confirmed working in its new home, the corresponding
`v-if="openSections.X"` block (and its `toggleSection('X')` button) is deleted from
`SidebarPanel.vue` — not hidden behind a flag, not kept as dead code. `country-banner`,
`sidebar-footer`'s last-updated/source-health block, and the logout button (already covered by
`AppHeader.vue`'s account dropdown per Revision 1) are relocated: country banner joins the
header's brand area (shown only when a country is selected), last-updated/source-health becomes
a small badge in `FooterStatusRow.vue`'s far right.

**Rationale**: Matches the user's explicit choice ("sidebar'ı tamamen kaldır") — a single source
of truth per control, no dead code left as a maintenance trap, per Constitution Principle VIII.

**Alternatives considered**: Feature-flag/hide instead of delete — explicitly rejected by the
user's own choice among the options presented (kept the option comparison in this file's git
history / the conversation, not duplicated here).

## Outcome

All unknowns resolved, including Revision 2's. No `NEEDS CLARIFICATION` markers remain in the
Technical Context.
