---

description: "Task list for Main Layout Shell (Nested Routing)"
---

# Tasks: Main Layout Shell (Nested Routing)

**Input**: Design documents from `/specs/069-main-layout-nesting/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: A small set of contract-driven tests is included (router regression risk is the
main hazard of this feature — see `contracts/router-contract.md`); full UI test automation is
NOT included, manual verification via `quickstart.md` covers the rest.

**Organization**: Tasks are grouped by user story (US1, US2, US3 from spec.md) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single Vue SPA project — `src/`, `tests/` at repository root, per plan.md's Structure Decision.

---

## Phase 1: Setup

**Purpose**: Scaffold the new folders this feature introduces

- [X] T001 [P] Create `src/layouts/` folder (new — first layout the app has)
- [X] T002 [P] Create `src/components/layout/` folder for the composed shell pieces

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The router restructuring and empty layout shell that every user story mounts into.
No user story is independently testable until this phase is done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create minimal `MainLayout.vue` skeleton with a single `<router-view/>` (no header/
      footer content yet) in `src/layouts/MainLayout.vue`
- [X] T004 Restructure `src/router/index.js` per `contracts/router-contract.md`: wrap `home`,
      `map`, `country`, `country-map`, `cap`, `incidents`, `shelters`, `hazards`, `admin`,
      `account-security` as `children` (relative paths, `props: true` and `meta.roles`
      preserved exactly) of a new parent route `{ path: '/', component: () =>
      import('@/layouts/MainLayout.vue') }`; leave `login`, `public-portal`, `report-hazard`,
      `mfa-challenge` as top-level route objects exactly as today; do not modify `authGuard`'s
      logic (depends on T003)
- [X] T005 [P] Add a router contract test asserting every row of
      `contracts/router-contract.md`'s table (route name → path → nesting parent) in
      `tests/unit/router/mainLayoutRoutes.test.js` (depends on T004) — note: named `.test.js`,
      not `.spec.js`, to match `vitest.config.js`'s `include` pattern (`tests/unit/**/*.test.js`)

**Checkpoint**: App still boots, every existing route still resolves to the same name/path/
component, `authGuard` behavior unchanged, `MainLayout` renders an empty shell around the
authenticated routes.

---

## Phase 3: User Story 1 - Consistent shell across authenticated pages (Priority: P1) 🎯 MVP

**Goal**: Header (language + account dropdown) and footer (date scrubber) persist identically
across every authenticated route, only the central content swaps.

**Independent Test**: Log in, visit `/`, `/alerts/cap`, `/shelters`, `/hazards`, `/admin`,
`/account-security` in sequence per `quickstart.md` §2 — header/footer stay mounted and
identical in position; only content changes.

### Implementation for User Story 1

- [X] T006 [P] [US1] Create `AppHeader.vue` with a language dropdown and an account dropdown
      (account menu at the far edge, language selector immediately beside it per FR-002) in
      `src/components/layout/AppHeader.vue`
- [X] T007 [P] [US1] Create `DateScrubberFooter.vue` as a presentational, horizontally
      scrollable date control with local `selectedDate`/`visibleRangeStart` state (per
      data-model.md; no external data wiring in this feature) in
      `src/components/layout/DateScrubberFooter.vue`
- [X] T008 [US1] Wire `AppHeader` and `DateScrubberFooter` into `MainLayout.vue` around the
      existing `<router-view/>` (header above, footer below) (depends on T006, T007)
- [X] T009 [US1] Wire `AppHeader`'s account dropdown to `useAuthStore().signOut()` and a link to
      the existing `account-security` named route (no new store methods) (depends on T006)
- [X] T010 [US1] Wire `AppHeader`'s language dropdown to the app's existing `vue-i18n` locale
      ref (same mechanism `HomeView.vue` already uses), covering all 7 existing locale codes
      (depends on T006)
- [X] T011 [US1] Add i18n keys for every new header/footer string (language selector label,
      account menu items, footer control labels) to all 7 locale files in
      `src/i18n/locales/{tr,en,es,fr,ru,ar,zh}.json` — no hard-coded UI text (depends on T006,
      T007)
- [ ] T012 [US1] Manual verification per `quickstart.md` §2 (shell persistence + language switch
      + account dropdown actions across all authenticated routes) (depends on T008, T009, T010,
      T011) — **BLOCKED**: needs a real login session to reach these routes; no test credentials
      available in this environment. Everything reachable without login (routing/rendering up to
      the auth redirect) is verified — see T019/T020.

**Checkpoint**: User Story 1 fully functional and independently testable — the shared shell
works across every authenticated page.

---

## Phase 4: User Story 2 - Hazard-type row reveals a contextual sub-menu (Priority: P2)

**Goal**: Clicking a hazard type in the second row reveals a third-row sub-menu of contextual
actions for that hazard type; switching hazard type swaps the sub-menu's contents.

**Independent Test**: On any authenticated page, click a hazard type; verify the sub-menu row
appears with that hazard's options; click a different hazard type; verify contents change
(`quickstart.md` §3).

### Implementation for User Story 2

- [X] T013 [P] [US2] Create `HazardTypeNav.vue` rendering hazard-type buttons sourced from
      `useHazardTypesStore()` (existing store, read-only — no hard-coded hazard list, per
      Constitution Principle I) with a `selected`/`update:selected` v-model contract in
      `src/components/layout/HazardTypeNav.vue`
- [X] T014 [P] [US2] Create `HazardSubMenu.vue` accepting a required `hazardTypeId` prop and
      rendering that hazard type's contextual actions/links in
      `src/components/layout/HazardSubMenu.vue`
- [X] T015 [US2] Add `selectedHazardTypeId` local state to `MainLayout.vue` and wire
      `<HazardTypeNav v-model:selected="selectedHazardTypeId" />` plus
      `<HazardSubMenu v-if="selectedHazardTypeId" :hazard-type-id="selectedHazardTypeId" />`
      between the header and the `<router-view/>` (depends on T013, T014, T008)
- [X] T016 [US2] Add i18n keys for hazard-type labels and sub-menu action labels to all 7 locale
      files in `src/i18n/locales/{tr,en,es,fr,ru,ar,zh}.json` (depends on T013, T014)
- [ ] T017 [US2] Manual verification per `quickstart.md` §3 (sub-menu appears/replaces/hides
      correctly, no layout jump when nothing is selected) (depends on T015, T016) —
      **BLOCKED**: same reason as T012, needs a real login session.

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Public/unauthenticated pages remain unaffected (Priority: P1)

**Goal**: `/login`, `/portal`, `/report` (and `/mfa-challenge`) keep rendering exactly as before
— no shell, no behavior change.

**Independent Test**: Without logging in, visit `/login`, `/portal`, `/report` directly by URL;
confirm no shell appears and each page behaves identically to before this feature
(`quickstart.md` §1).

### Implementation for User Story 3

- [X] T018 [P] [US3] Add a unit test asserting `login`, `public-portal`, `report-hazard`, and
      `mfa-challenge` remain top-level routes (not children of the `MainLayout` parent) in
      `tests/unit/router/publicRoutesUnaffected.test.js` (depends on T004)
- [X] T019 [US3] Manual verification per `quickstart.md` §1 (visual/behavioral parity check on
      all four routes, logged out) (depends on T004) — satisfied by running the existing
      `tests/e2e/auth-public-smoke.spec.js` against a live dev server (real Chromium via
      Playwright): login/portal/report render correctly and all 8 protected routes redirect
      anonymous users to `/login`, zero console errors on any of the 4 public-facing URLs

**Checkpoint**: All three user stories independently functional; public routes verified
unaffected by the router restructuring done in Phase 2.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression safety net across all stories before calling this feature done

- [X] T020 [P] Run the full existing auth-guard test suite (login redirect, `/admin` role
      gating, MFA challenge/enrollment redirects) and confirm zero regressions per
      `quickstart.md` §4 — `tests/unit/router.test.js` (12/12) plus the full suite
      (`npx vitest run`: 35 files, 291/291 tests) pass unchanged
- [X] T021 Run `npm run test:unit -- router` and fix any failures surfaced by T005/T018 — all 28
      router-related tests pass (`router.test.js` + the two new contract test files)
- [ ] T022 Full end-to-end pass of `quickstart.md` (§1–§5) on a clean checkout — §1 (public
      routes) and part of §4 (auth guard) verified via automated e2e/unit tests above; §2, §3,
      and the rest of §4/§5 require a real authenticated session (no test credentials available
      in this environment) — **needs a manual pass by someone with a login** before calling this
      feature fully done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (router restructuring
  and empty `MainLayout` must exist first)
- **User Stories (Phase 3–5)**: All depend on Foundational (Phase 2) completion
  - US1 and US3 are both P1; US1 builds the shell content, US3 verifies the restructuring didn't
    leak into public routes — both can proceed in parallel once Phase 2 is done
  - US2 (P2) can start in parallel with US1/US3 once Phase 2 is done, but T015 also depends on
    T008 (US1's header/footer wiring into `MainLayout.vue`) to avoid both stories editing
    `MainLayout.vue`'s template at the same time — sequence T008 before T015 if one person is
    doing both
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- Components before wiring them into `MainLayout.vue`
- i18n keys added alongside (not after) the component that introduces the strings
- Manual verification task last, after all wiring for that story is done

### Parallel Opportunities

- T001, T002 in parallel (Setup)
- T005 can run once T004 lands (contract test)
- T006, T007 in parallel (different files); T013, T014 in parallel (different files)
- T018 in parallel with Phase 3/4 work (different file, only depends on T004)

---

## Parallel Example: Phase 2 → Phase 3/4/5 fan-out

```bash
# After T003+T004+T005 (Foundational) complete:
Task: "Create AppHeader.vue in src/components/layout/AppHeader.vue"                 # US1, T006
Task: "Create DateScrubberFooter.vue in src/components/layout/DateScrubberFooter.vue" # US1, T007
Task: "Create HazardTypeNav.vue in src/components/layout/HazardTypeNav.vue"         # US2, T013
Task: "Create HazardSubMenu.vue in src/components/layout/HazardSubMenu.vue"         # US2, T014
Task: "Add publicRoutesUnaffected.spec.js in tests/unit/router/"                    # US3, T018
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (router restructuring — the risky part, get it right once)
3. Complete Phase 3: User Story 1 (header + footer shell)
4. **STOP and VALIDATE**: `quickstart.md` §2 + §4 (shell works, auth guard unregressed)
5. This alone is a shippable improvement — hazard sub-menu (US2) can follow later

### Incremental Delivery

1. Setup + Foundational → router restructured, empty shell in place, zero visible change to
   users yet (validates the "no behavior change" premise before adding new UI)
2. Add US1 → header/footer shell live → validate → this is the MVP the user asked to "get right
   first" before layering more on top
3. Add US2 → hazard sub-menu → validate independently
4. Add US3's explicit regression test → confirms Phase 2 didn't leak into public routes (can
   also be pulled earlier, right after Phase 2, since it only needs T004)

---

## Notes

- [P] tasks = different files, no dependencies
- Router restructuring (T004) is the single highest-risk task — `contracts/router-contract.md`
  is the acceptance contract for it; do not consider T004 done until every row of that table is
  verified.
- No page component (`HomeView.vue`, `CapView.vue`, etc.) is touched by any task in this list —
  if a task seems to require editing one of them, stop and revisit the plan (FR-008).
- Commit after each task or logical group, per repository convention.

---

## Phase 7: Convergence

**Purpose**: `spec.md`/`plan.md`/`contracts/` were revised (Revision 2 — sidebar migration) after
Phase 1–6 already shipped Revision 1's shell. These tasks close the gap between the revised spec
and the code as it stands today. See the Convergence Findings table (F1–F8) for the evidence
behind each task below.

- [X] T023 [HIGH] [US4] Add brand/logo (moved from `SidebarPanel.vue`'s `sidebar-brand`), a
      "Panel" button (`uiStore.toggleDashboardPanel()`), a "Konum" popover (alert-radius
      `Slider` + "only my region" toggle, moved from the sidebar's `location` section), and the
      3D/2D world-shape toggle (moved from the sidebar's `switch-3d-cyan`) to
      `src/components/layout/AppHeader.vue`, positioned per FR-002 (brand far left; Panel/Konum/
      world-shape right, before language/account) per F1 (missing)
- [X] T024 [US4] Add i18n keys for the header's new Panel/Konum/world-shape labels to all 7
      locale files per F8 (missing) (depends on T023)
- [X] T025 [HIGH] [US2] Rewrite `src/components/layout/HazardTypeNav.vue` to read the fixed
      `disasterTypes` list `SidebarPanel.vue` defines (not `useHazardTypesStore()`) and toggle
      `disasterStore.toggleLayer(code)`/read `disasterStore.isLayerActive(code)` per chip click,
      replacing the `update:selected` sub-menu-trigger contract with `update:focused` per
      `contracts/component-contract.md` per F2 (contradicts)
- [X] T026 [HIGH] [US2] Create `src/components/layout/HazardFocusRow.vue` (replaces
      `HazardSubMenu.vue`): renders the focused hazard's active count + top severity (reusing
      `SidebarPanel.vue`'s `severityBreakdown` aggregation logic, scoped to one type) + a
      per-severity breakdown + quick-access links (forecast/trend integration deferred —
      `ForecastPanel.vue`'s API is region/horizon-scoped, not a 1:1 per-hazard-type relocation,
      see research.md §8) per F3 (contradicts) (depends on T025)
- [X] T027 [US2] Delete `src/components/layout/HazardSubMenu.vue` and its i18n keys
      (`mainLayout.hazardSubMenu.*`) once `HazardFocusRow.vue` (T026) is wired in per F3
      (contradicts) (depends on T026, T028)
- [X] T028 [US2] Update `MainLayout.vue`: rename `selectedHazardTypeId` to `focusedHazardCode`,
      wire `<HazardTypeNav v-model:focused="focusedHazardCode" />` and
      `<HazardFocusRow v-if="focusedHazardCode" :hazard-code="focusedHazardCode" />` per
      data-model.md per F2/F3 (depends on T025, T026)
- [X] T029 [US2] Add i18n keys for the focus row's new labels (count/severity/forecast/
      quick-access-link labels) to all 7 locale files per F8 (missing) (depends on T026)
- [X] T030 [HIGH] [US5] Create `src/components/layout/FooterStatusRow.vue`: move the
      Normal/Hexagon/Heatmap `ToggleGroup` + hex-resolution `Slider` (disabled unless
      `mapMode === 'hexagon'`) from `SidebarPanel.vue`'s `viewMode` section, and the severity
      legend (`toggleSeverity`/`isSeverityActive`) from its `severityLegend` section, verbatim
      per research.md §9 per F4 (missing)
- [X] T031 [US5] Wire `<FooterStatusRow />` into `MainLayout.vue` above `<DateScrubberFooter />`
      per F4 (missing) (depends on T030)
- [X] T032 [US5] Add i18n keys for the status row's labels to all 7 locale files per F8
      (missing) (depends on T030)
- [X] T033 [HIGH] [US1] Extend `src/components/layout/DateScrubberFooter.vue` with the
      magnitude/depth/duration sliders and the calendar start/end date-range picker moved
      verbatim from `SidebarPanel.vue`'s `magnitudeDepth` section, including its
      `dateFilterMode` mutual-exclusivity ref and `applyDateRange`/`clearCalendarRange`/
      `handleTimeSliderInput` functions, laid out per `contracts/component-contract.md`
      (filters left, date scrubber center, date-range right) per F5 (partial)
- [X] T034 [US1] Add i18n keys for any new footer filter labels not already covered by the
      sidebar's existing `sidebar.*` keys to all 7 locale files per F8 (missing) (depends on
      T033)
- [X] T035 [HIGH] [US6] Remove the `disasterFilters`, `severityLegend`, `magnitudeDepth`, and
      `viewMode` accordion sections (including their `toggleSection` buttons) from
      `SidebarPanel.vue` now that T025/T030/T033 give them a shell home per F6 (missing)
      (depends on T025, T030, T033)
- [X] T036 [US6] Remove the `location` section and the standalone Panel button
      (`sidebar-panel-entry`) from `SidebarPanel.vue` now that T023 gives them a header home
      per F6 (missing) (depends on T023)
- [X] T037 [US6] Remove the `sidebar-brand` header block from `SidebarPanel.vue` now that T023
      gives it a header home per F6 (missing) (depends on T023)
- [X] T038 [US6] Relocate the country banner into `AppHeader.vue`'s brand area (shown only when
      a country is selected) per F7 (missing) (depends on T037)
- [X] T039 [US6] Relocate the last-updated timestamp + source-health count into
      `FooterStatusRow.vue` as a small badge per F7 (missing) (depends on T030)
- [X] T040 [US6] After T035–T039, verify `SidebarPanel.vue` still renders without runtime errors
      for whatever remains (or remove the component/its `HomeView.vue` usage entirely if nothing
      remains — confirm with the user before deleting the file itself, since that's a bigger
      structural call than removing sections) per F6 (missing) (depends on T035, T036, T037,
      T038, T039) — **decision**: `SidebarPanel.vue` is NOT deleted; `MapView.vue` positions its
      own legend/top-controls off `uiStore.sidebarCollapsed` (fixed-width column math), which is
      page-content logic out of this shell feature's scope (FR-008-adjacent) to touch. The
      component was trimmed to just its collapse toggle (`isCollapsed`/`uiStore.toggleSidebar()`)
      — script shrunk from ~314 lines to ~24, all 5 duplicated content sections + brand + Panel
      button + country banner + last-updated/logout removed from its template. `npm run build`
      and the full `vitest` suite both pass after the trim; dead CSS for the removed sections
      was left in place (not hunted down rule-by-rule) as an explicit, disclosed follow-up.
- [X] T041 [US1/US2/US5] Run the full unit test suite (`npx vitest run`) and fix any regressions
      surfaced by T023–T040's changes to `MainLayout.vue`, `AppHeader.vue`, `HazardTypeNav.vue`,
      and the removed `SidebarPanel.vue` sections per SC-004/SC-006 (depends on T023–T040)
- [ ] T042 Manual verification per `quickstart.md` §3, §3a, §3b, §3c (hazard filter/focus, header
      controls, footer status row, sidebar cleanup) — same credential blocker noted on T012/T017/
      T022 applies here too (depends on T041). Partially covered: production build (`npm run
      build`) succeeds with all new components bundled, and a live Chromium check (Playwright)
      against the dev server shows zero console errors on `/login`, `/portal`, `/report`, and the
      `/` → `/login` redirect — confirms the new component tree is import/syntax-clean end to
      end, but not that the authenticated shell renders/behaves correctly on screen.

---

## Phase 8: Post-Revision-2 follow-ups (user-directed, same session)

**Purpose**: Two direct follow-up requests after Revision 2 shipped — the date scrubber must
track an applied calendar date range, and the (already-trimmed) sidebar shell gets deleted
outright now that the user confirmed the `MapView.vue` positioning breakage is acceptable and
wanted fixed, not just disclosed.

- [X] T043 [US1] Make the bottom-footer date scrubber's visible day list track the applied
      calendar date range: when `dateFilterMode === 'calendar'`, `dates` in
      `DateScrubberFooter.vue` generates from `rangeStartDate` to `rangeEndDate` (capped at 400
      rendered entries, stepping if the span is wider) instead of the default ±15-day window
      around today; `selectedDate` is kept inside whatever window is current via a `watch`;
      `shiftWindow`/`visibleRangeStart` (window-index arithmetic) replaced by a template-ref
      `scrollScrubber(direction)` that scrolls the real rendered track, so left/right navigation
      is naturally bounded by the range's actual start/end — matches the user's description
      ("sağa sola gittiğimizde o slider bölümünde kalmalı")
- [X] T044 [US6] Supersedes T040's earlier "kept, trimmed" decision: `SidebarPanel.vue` is now
      deleted outright (not just trimmed) — `HomeView.vue`'s `<SidebarPanel />` usage and its
      now-orphaned mobile "☰" toggle button/CSS removed; `main.css`'s `--sidebar-width`/
      `--sidebar-collapsed` root tokens zeroed (`280px`/`56px` → `0px`) so `MapView.vue`'s
      `calc(var(--sidebar-width, 280px) + 12px)`-style offsets collapse to a plain left-edge
      margin without editing `MapView.vue` itself — user explicitly confirmed accepting this
      known viewport consequence ("biliyorum sayfa viewport'unu bozuyor... ama kaldıracağız").
      Does NOT touch shadcn's own `--sidebar-width` token (`SidebarProvider.vue` always sets it
      locally via inline style where used, e.g. the Dashboard's `AppSidebar.vue`, so the zeroed
      root default never reaches it).
- [X] T045 Regression check after T043/T044: `npm run build` succeeds, full `npx vitest run`
      (35 files / 291 tests) passes, live Chromium check shows zero console errors on `/login`,
      `/portal`, `/report`, `/`, and `tests/e2e/auth-public-smoke.spec.js` (4/4) passes against a
      running dev server.
- [X] T046 Fixed after the user's screenshot (T046's own trigger): two root-cause bugs in
      `MapView.vue` inconsistent with its own conventions elsewhere in the same file —
      (a) `.map-view-wrapper`/`.map-leaflet` used `height: 100vh` (the raw browser window)
      instead of `height: 100%` of their actual container (unlike `.impact-panel-dock`, which
      already correctly used `height: 100%`), causing the map canvas to render taller than its
      now-smaller visible area (header/hazard rows above, footer rows below) and overflow/
      misalign; (b) `.map-legend-group` (the "ŞİDDET" severity legend) used
      `position: fixed; bottom: 38px` — anchored to the true viewport bottom regardless of the
      footer rows now docked there, landing behind/under them — changed to `position: absolute`
      (unlike `.country-badge`, which already correctly used `absolute`), so `bottom: 38px` is
      now relative to the correctly-sized wrapper and sits just above the footer.
- [X] T047 Regression check after T046: `npm run build` succeeds, full `npx vitest run` (35
      files / 291 tests) passes, live Chromium check shows zero console errors on `/login`,
      `/portal`, `/report`, `/`. Visual confirmation of the on-screen result (legend position,
      map fill, search-bar row) still needs the user's own login session — not verifiable here.
- [X] T048 T046's `position: absolute` fix was not sufficient in the user's live session — a
      DevTools screenshot showed the MapLibre canvas's own JS-set inline `style="height: ...px"`
      stale/mismatched against the actual container box (a known MapLibre gotcha the codebase's
      own `containerResizeObserver` comment already documents for canvas *sizing*, evidently
      also affecting sibling absolutely-positioned overlays' effective containing-block height
      in practice). Replaced `.map-legend-group`/`.basemap-picker`/`.radar-trigger-anchor`'s
      `position: absolute` (relative to the unreliable `.map-view-wrapper` box) with
      `position: fixed` + a real measured clearance: `MainLayout.vue` now uses a `ResizeObserver`
      on its footer chrome wrapper to set `--shell-footer-height` on `:root`, and these three
      MapView.vue rules use `bottom: calc(var(--shell-footer-height, 90px) + Npx)` — a plain
      pixel measurement that can't drift out of sync with the map's own (possibly stale)
      internal sizing, since `position: fixed` positions relative to the viewport regardless.
- [X] T049 Regression check after T048: `npm run build` succeeds, full `npx vitest run` (35/291)
      passes, live Chromium console-clean on all 4 public-facing checks. Still needs the user's
      own login session to visually confirm the legend/basemap-picker/radar button now clear the
      footer correctly.
- [X] T050 User confirmed T048's fix worked live (DevTools screenshot: legend/radar/basemap
      picker now correctly clear the footer). Applied the same technique symmetrically to the
      TOP of the shell: `MainLayout.vue`'s header-chrome wrapper (AppHeader + HazardTypeNav +
      HazardFocusRow) is now also measured via `ResizeObserver`, exposed as
      `--shell-header-height` on `:root`. `.top-controls-row` (the geocoding search bar row) and
      `.map-download-btn--top-left` switched from `position: absolute; top: 56px/16px` to
      `position: fixed; top: calc(var(--shell-header-height, 110px) + 56px/16px)` — same 56px/
      16px clearance values preserved (the 40px gap between them, needed so the search row
      doesn't overlap the download button, is unchanged), just measured from a reliable fixed
      baseline instead of the map wrapper's chain.
- [X] T051 Regression check after T050: `npm run build` succeeds, full `npx vitest run` (35/291)
      passes, live Chromium console-clean on all 4 public-facing checks.
