# Feature Specification: Sidebar Hazard-View Layout Rework + Manual Hexagon Resolution Control

**Feature Branch**: `045-hexagon-resolution-panel`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Sidebar hazard-view layout rework: durum (status) and ısı (heatmap)
become a paired two-option toggle, and petek (hexagon) moves out of that toggle entirely into its
own wide, standalone panel positioned directly above the existing Disaster Encyclopedia section,
matching that section's full width. The mutual-exclusion behavior just implemented (selecting
durum, petek, or ısı automatically hides whichever of the other two was active — driven by the
existing uiStore.mapMode state) MUST remain completely unchanged — this is a purely visual/layout
rearrangement of the same three options, not a behavior change; confirmed explicitly with the
user. The new standalone petek panel gets a new manual hexagon-resolution control: a slider
(matching the visual style of this project's other range-slider controls, e.g. the exposure-layer
opacity sliders) letting the user manually pick the H3 resolution level used for the selected
country's hex grid, replacing (or overriding) today's fully-automatic zoom-based resolution
selection (the existing hexResForZoom(zoom) function, which currently maps zoom ranges to H3
resolutions 3 through 6). Range to try first: H3 through H8 (finer/denser than today's automatic
max of H6, since a manual control implies a user might want to zoom into a much finer hex grid
than the automatic zoom-linked logic currently allows) — confirmed with the user as the first
attempt, with H3 through H6 (matching the current automatic range exactly) as an explicit fallback
if H3-H8 proves impractical (e.g. performance, or H7/H8 resolution producing an impractically
dense/slow-to-render grid for a country-scale selection) during implementation. This feature is
scoped to the sidebar layout and the country-selected hex grid's resolution control only — it does
not change the exposure-layer panel (already fixed in the prior session to filter by selected
country), does not change the underlying hex aggregation/rendering logic beyond accepting a
resolution parameter instead of only deriving it from zoom, and does not change any
backend/database logic."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Durum/ısı becomes a compact paired toggle, petek gets its own wide panel (Priority: P1) 🎯 MVP

A user looking at the sidebar sees "durum" and "ısı" presented together as a compact two-option
choice, while "petek" appears separately as its own wide, clearly-labeled panel positioned right
above the Disaster Encyclopedia section — visually signaling that petek is a richer, more
configurable view (it has its own resolution control) rather than a third option crammed into the
same small toggle as durum/ısı.

**Why this priority**: This is the layout change that makes room for the new resolution control
(User Story 2) to have a sensible, uncluttered home, and directly addresses the user's stated
preference after seeing the current cramped three-way toggle.

**Independent Test**: Open the sidebar, confirm durum and ısı appear as a two-option toggle in
one location, and confirm petek appears as a separate, full-width panel positioned directly above
the Disaster Encyclopedia section.

**Acceptance Scenarios**:

1. **Given** the sidebar is open, **When** a user looks at the hazard-view controls, **Then**
   durum and ısı are presented as a paired two-option toggle, and petek is a separate, wide panel
   above the Disaster Encyclopedia section — not part of the same toggle.
2. **Given** a user selects durum or ısı, **When** either becomes active, **Then** the
   already-existing mutual-exclusion behavior applies exactly as before this feature: petek (if
   active) is hidden, and the newly selected option's view appears — no behavior change, layout
   only.
3. **Given** a user selects petek from its new standalone panel, **When** it becomes active,
   **Then** the same existing mutual-exclusion behavior applies: durum/ısı (if active) is hidden —
   no behavior change, layout only.

---

### User Story 2 - Manual hexagon resolution control inside the petek panel (Priority: P1) 🎯 MVP

A user viewing the petek (hexagon) view for a selected country can manually choose how fine or
coarse the hexagon grid is, using a slider inside petek's own panel, instead of the grid's
granularity being decided automatically and only by the current map zoom level.

**Why this priority**: This is the concrete new capability the layout rework exists to make room
for — without it, User Story 1 alone would just be a cosmetic rearrangement.

**Independent Test**: With a country selected and petek active, move the resolution slider;
confirm the country's hex grid re-renders at the newly selected resolution level, independent of
the current map zoom level.

**Acceptance Scenarios**:

1. **Given** a country is selected and petek is active, **When** a user moves the resolution
   slider, **Then** the selected country's hex grid re-renders at the corresponding H3 resolution
   level.
2. **Given** a user has manually set a resolution level, **When** they zoom the map in or out,
   **Then** the hex grid's resolution does NOT automatically change back — the manual choice
   persists until the user changes it again (manual control overrides, rather than merely
   suggesting, the zoom-based automatic default).
3. **Given** no country is currently selected (petek has nothing to render), **When** a user views
   the petek panel, **Then** the resolution slider is present but has no visible effect until a
   country is selected — consistent with this project's general pattern of controls being inert
   rather than hidden when their target data doesn't exist yet.

### Edge Cases

- What happens if the user switches to durum or ısı while a custom resolution is set, then
  switches back to petek? → The previously chosen manual resolution level is remembered and
  re-applied — the user should not have to re-pick it every time they toggle back to petek.
- What happens if the finest resolution level in the slider's range proves impractically slow or
  dense to render for a large country (e.g. Turkey) during implementation? → Fall back to the
  narrower H3–H6 range (matching today's existing automatic range) rather than shipping a control
  that produces a broken/unusably slow experience — this determination is made during
  implementation via live testing, not assumed in advance.
- What happens on first load, before a user has ever touched the slider? → The resolution defaults
  to the same value today's automatic zoom-based logic would have chosen for the current zoom
  level, so the initial experience is unchanged until the user actively takes manual control.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The sidebar MUST present durum and ısı as a paired, two-option toggle, visually
  distinct from petek.
- **FR-002**: The sidebar MUST present petek as its own standalone panel, positioned directly
  above the Disaster Encyclopedia section and matching that section's full width.
- **FR-003**: The existing mutual-exclusion behavior between durum, petek, and ısı (exactly one
  active at a time) MUST remain functionally identical to its current behavior — this feature MUST
  NOT alter when/how one of the three hides the others, only their visual arrangement.
- **FR-004**: The petek panel MUST include a slider control allowing the user to manually select
  the H3 resolution level used for the currently selected country's hex grid.
- **FR-005**: Once a user manually selects a resolution level, the system MUST use that level for
  the hex grid regardless of subsequent map zoom changes, until the user changes the slider again.
- **FR-006**: The manually selected resolution level MUST persist across switching away from and
  back to petek (durum/ısı ↔ petek), for the duration of the session.
- **FR-007**: On first load (before any manual slider interaction), the resolution MUST default to
  the same value the existing automatic zoom-based logic would already select — no visible change
  for a user who never touches the slider.
- **FR-008**: This feature MUST NOT change the exposure-layer panel's behavior (already scoped to
  the selected country in a prior fix), and MUST NOT change any backend/database logic — it is
  confined to sidebar layout and the country-selected hex grid's resolution parameter.
- **FR-009**: The slider's resolution range MUST be determined during implementation via live
  testing: H3 through H8 is the first attempt; H3 through H6 (matching today's existing automatic
  range) is the explicit fallback if the finer end of that range proves impractical (performance,
  or an unusably dense grid) for a country-scale selection.

### Key Entities

- **Hazard-view mode**: The existing three-way mutually-exclusive state (durum / petek / ısı) —
  unchanged in behavior by this feature, only in its visual presentation.
- **Manual hex resolution selection**: A user-chosen H3 resolution level for the selected
  country's hex grid, overriding the automatic zoom-based default once set, persisted for the
  session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can visually distinguish the durum/ısı toggle from the petek panel at a
  glance, with petek clearly presented as a wider, more prominent section above the Disaster
  Encyclopedia.
- **SC-002**: Selecting any one of durum, petek, or ısı hides the other two, with zero regressions
  from the currently working mutual-exclusion behavior (0 cases where two are simultaneously
  visible).
- **SC-003**: A user can change the selected country's hex grid resolution via the slider and see
  the grid re-render at the new resolution within the same time it currently takes for a
  zoom-triggered grid refresh (no perceptible slowdown from today's automatic behavior).
- **SC-004**: A manually chosen resolution survives at least one full durum/ısı ↔ petek toggle
  cycle within the same session without needing to be re-selected.

## Assumptions

- "Durum," "petek," and "ısı" refer to this project's existing `uiStore.mapMode` values
  (`'normal'`, `'hexagon'`, `'heatmap'` respectively) and their existing mutual-exclusion behavior,
  confirmed working as of this session's prior fix — this feature explicitly must not touch that
  behavior, only its layout.
- "Disaster Encyclopedia" refers to the existing sidebar section by that name — the new petek
  panel's exact vertical position (directly above it) and width (matching it) are a UI-layout
  detail confirmed directly with the user, not left ambiguous.
- The manual resolution slider is scoped to the country-selected hex grid only (the same grid
  `hexResForZoom(zoom)` currently drives) — it does not affect the separate world/viewport
  background hex mesh or any exposure-layer hexagon rendering (WorldPop, Kontur), which are
  unrelated grids with their own independent resolution logic.
- The final slider range (H3–H8 vs. the H3–H6 fallback) is an implementation-phase decision to be
  settled via live testing against a real country's hex grid (e.g. Turkey, this project's largest
  MVP demo country by hex count) — both endpoints of that decision satisfy this spec's
  requirements equally; FR-009 documents the decision process, not a fixed outcome.
