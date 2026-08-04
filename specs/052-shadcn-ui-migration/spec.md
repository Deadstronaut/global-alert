# Feature Specification: Shadcn UI Migration

**Feature Branch**: `052-shadcn-ui-migration`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Gradual shadcn-vue UI migration: migrate the app's hand-written UI components to shadcn-vue (Tailwind v4 + Reka UI), one component at a time, starting from the newly added Dashboard panel and Settings/Sidebar buttons, while keeping the existing dark/light/high-contrast theming (data-theme attribute) intact via the CSS variable aliasing already set up in src/assets/main.css. Tailwind, shadcn-vue init, and the first Button component are already installed/added — this spec should define the migration scope, component priority order, and acceptance criteria for calling a component 'migrated' (visual parity across all 3 themes + RTL)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent visual language across the app (Priority: P1)

As the product owner preparing this app for client-facing deployments, I want every interactive UI element (buttons, dialogs, panels, inputs) to share one consistent design system, so the app no longer looks like a collection of individually hand-styled pieces and instead reads as a single, cohesive product.

**Why this priority**: This is the core motivation for the migration — the current hand-written components work individually but lack a shared visual language ("dağınık duruyor" / looks scattered). This is the value the whole effort exists to deliver.

**Independent Test**: Can be tested by opening the app in each of the three themes (dark, light, high-contrast) and confirming that migrated components (starting with buttons) share consistent spacing, radius, color, and hover/focus states with each other and with the still-unmigrated components around them.

**Acceptance Scenarios**:

1. **Given** a component has been migrated to shadcn-vue, **When** it is viewed next to un-migrated legacy components on the same screen, **Then** it must not look visually out of place (same corner radius family, same color tokens, same spacing rhythm).
2. **Given** the user switches between dark, light, and high-contrast themes, **When** a migrated component is on screen, **Then** its colors update automatically to match the active theme without any code change per-theme.

---

### User Story 2 - Safe, incremental migration with no regressions (Priority: P1)

As the developer doing the migration personally (not delegating UI ownership to a black-box library), I want to migrate one component at a time, verify it, and keep a rollback path, so a partial migration never leaves the production app in a broken or visually inconsistent state.

**Why this priority**: The user explicitly rejected a "big bang" rewrite in favor of a component-by-component approach with backups — this is a hard constraint on how the work must be sequenced, not just a preference.

**Independent Test**: Can be tested by migrating a single component, running the existing build/test suite, and visually confirming the rest of the app is unaffected — before moving to the next component.

**Acceptance Scenarios**:

1. **Given** a component is queued for migration, **When** the migration is performed, **Then** only that component's files (and its direct call sites) change — no unrelated components are modified.
2. **Given** a component has been migrated, **When** the app is built, **Then** the production build succeeds with no new errors or warnings introduced by the change.
3. **Given** a migration turns out to be wrong or incomplete, **When** the change is reverted, **Then** the previous hand-written version is restorable without affecting any other already-migrated component.

---

### User Story 3 - Right-to-left (RTL) layout stays correct (Priority: P2)

As a user of the Arabic locale, I want migrated components to lay out correctly right-to-left, so the app remains fully usable regardless of which components have been migrated yet.

**Why this priority**: The app already ships an Arabic locale with RTL support; breaking it for a subset of users is not acceptable, but it's secondary to the core migration mechanics (P1s) since most components' RTL behavior is inherited from the framework-level RTL setup already enabled during initialization.

**Independent Test**: Can be tested by switching the app locale to Arabic and confirming a migrated component (e.g. a dialog's close button, a panel's icon/label order) mirrors correctly.

**Acceptance Scenarios**:

1. **Given** the active locale is Arabic (RTL), **When** a migrated component is displayed, **Then** its internal layout (icon/label order, alignment, directional icons) mirrors correctly, matching the surrounding legacy RTL layout.

---

### User Story 4 - Dashboard becomes the first fully-migrated surface (Priority: P3)

As the developer, I want the new Dashboard panel (currently an empty placeholder dialog) to be built from shadcn-vue components from day one, so it serves as the reference implementation / style guide for migrating the rest of the app afterward.

**Why this priority**: Useful for establishing a concrete pattern to copy, but the Dashboard's actual chart/content design is a separate, not-yet-scoped effort — only its shell (dialog, close control, layout primitives) is in scope here.

**Independent Test**: Can be tested by confirming the Dashboard dialog shell (backdrop, container, header, close button) uses only shadcn-vue components/tokens, with no remaining hand-written `.btn`/`.glass-panel`-style CSS in that file.

**Acceptance Scenarios**:

1. **Given** the Dashboard dialog is open, **When** inspected, **Then** its shell (backdrop, dialog container, header, close button) is built from shadcn-vue primitives rather than the legacy `.glass-panel`/`.btn` utility classes.

---

### Edge Cases

- What happens when a component exists in both a "collapsed sidebar" icon-only variant and an "expanded sidebar" labeled variant (e.g. the Settings/Dashboard buttons)? Both variants must be migrated together so the two states stay visually consistent with each other.
- How does the system handle a migrated component whose legacy version had bespoke behavior beyond styling (e.g. a flip-card animation shared between Settings and the Impact panel dock)? The migration must preserve that behavior, not just the visual appearance.
- What happens to a screen where some components are migrated and others are not (the expected state for most of this effort's duration)? The mixed state must remain visually acceptable, not broken or jarring, since migration spans many incremental releases.
- How does the system handle the high-contrast accessibility theme, which is not a standard "light/dark" pair? Migrated components must respect it via the same token aliasing already established, without a separate high-contrast code path per component.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a working shadcn-vue + Tailwind v4 toolchain in the project (already satisfied: Tailwind, `components.json`, and the first `Button` component are installed).
- **FR-002**: Every shadcn-vue design token used by a migrated component (background, foreground, border, primary, destructive, chart colors, etc.) MUST resolve through the existing app color variables (`--color-bg`, `--color-accent`, `--glass-border`, etc.) rather than introducing a second, independent color palette.
- **FR-003**: Migrating a component MUST NOT change its existing keyboard/click behavior, event handlers, or the Pinia store state it reads/writes.
- **FR-004**: Migrated components MUST render correctly (no visual regression) under all three existing themes: dark (default), light, and high-contrast.
- **FR-005**: Migrated components MUST render correctly under RTL (Arabic locale) layout.
- **FR-006**: The migration MUST proceed component-by-component; each migration step MUST be independently revertible without requiring changes to already-migrated or not-yet-migrated components.
- **FR-007**: The system MUST define and follow an explicit component migration priority order, starting with atomic/leaf components (buttons, icon buttons) before composite components (dialogs, panels, forms), since composites are built from atoms.
- **FR-008**: The Dashboard panel shell (added as a temporary placeholder) MUST be the first composite component fully migrated to shadcn-vue, serving as the reference pattern for subsequent panel/dialog migrations.
- **FR-009**: Each migrated component MUST be verified against a definition-of-done checklist (see Success Criteria) before being marked complete, including a production build check.
- **FR-010**: The system MUST track migration progress per component (which are migrated vs. still legacy) so partial-migration state is visible and resumable across sessions.

### Key Entities

- **UI Component**: A single hand-written Vue component or a repeated UI pattern (e.g. "icon button", "settings-style dialog") that can be migrated to shadcn-vue independently. Tracked with a migration status: not started / in progress / migrated / verified.
- **Design Token Mapping**: The alias table connecting shadcn-vue's semantic CSS variables (`--background`, `--primary`, `--border`, `--chart-1..5`, etc.) to this app's existing palette variables (`--color-bg`, `--color-accent`, `--glass-border`, hazard colors, etc.). Already established in `src/assets/main.css`; must be extended, not duplicated, as new tokens are needed.
- **Theme Variant**: One of the three existing app themes (dark, light, high-contrast), each identified by the `data-theme` attribute on `<html>`. Every migrated component must be checked against all three.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A component is considered "migrated" only when it passes visual parity checks in all 3 themes (dark, light, high-contrast) and in both LTR and RTL layout — zero exceptions.
- **SC-002**: After each individual component migration, the production build completes with no new errors or warnings attributable to that change.
- **SC-003**: At least 90% of the app's interactive buttons/icon-buttons are migrated to the shadcn-vue `Button` component before composite components (dialogs, cards, forms) migration begins, establishing the atomic layer first.
- **SC-004**: Zero functional regressions are introduced by the migration — every migrated component's click/keyboard behavior and store interactions remain identical to the pre-migration version, verified manually per component.
- **SC-005**: A person unfamiliar with which components have been migrated cannot visually distinguish a migrated component from a not-yet-migrated one when they sit on the same screen (consistent spacing/radius/color rhythm across the whole app, migrated or not).

## Assumptions

- Migration proceeds opportunistically across future sessions ("adım adım" / step by step) rather than on a fixed deadline; no target completion date is set by this spec.
- The existing hand-written CSS (`.glass-panel`, `.btn`, `.btn-icon`, etc.) remains in place and functional throughout the migration — it is only removed from a file once every element in that file has been migrated, never partially stripped.
- No new shadcn-vue color palette is introduced; all theming continues to flow from the app's existing `--color-*` variables, as already wired up in `src/assets/main.css`.
- Chart/data-visualization work for the Dashboard's actual content is explicitly out of scope for this spec — only the Dashboard's shell/dialog chrome is covered here; the dashboard's content and charting library choice is a separate, later effort.
- RTL support is already enabled at the shadcn-vue configuration level (`components.json` → `rtl: true`); this spec covers verifying it per-component, not building it from scratch.
- Component migration priority order (suggested, adjustable as work proceeds): (1) buttons/icon-buttons across Sidebar and Dashboard, (2) dialogs/modals (Dashboard shell, Settings panel, Confirm dialog), (3) form controls (range sliders, toggles, selects used in filters/settings), (4) panels/cards (Sidebar sections, Alert panel, Impact panel).
- **Stack deviation flag** (per project constitution's Scope Constraints — any tech outside Vue 3/Pinia/Vite/Leaflet/globe.gl/h3-js/Supabase/Capacitor/vue-i18n requires explicit approval before planning): this feature introduces **Tailwind CSS v4**, **shadcn-vue**, and its **Reka UI** primitive dependency as new frontend/styling tooling. This was explicitly requested and approved by the project owner in the conversation that produced this spec, and Tailwind/shadcn-vue/Reka UI/lucide-vue-next are already installed and in use (see `package.json`, `components.json`) — approval is retroactively documented here per process, not pending.
