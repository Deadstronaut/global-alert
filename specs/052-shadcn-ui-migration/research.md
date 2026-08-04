# Phase 0 Research: Shadcn UI Migration

No `[NEEDS CLARIFICATION]` markers remained in the Technical Context (Tailwind v4/shadcn-vue/Reka
UI are already installed and verified working via a production build in this same conversation),
so this phase documents the decisions already made and validated rather than open unknowns.

## Decision: Component library base — shadcn-vue on Reka UI

**Rationale**: The original shadcn/ui is React-only. shadcn-vue is the community-maintained,
API-compatible Vue port, built on Reka UI (formerly Radix Vue) for accessible headless
primitives + Tailwind for styling. Components are copied into the repo (`src/components/ui/`)
rather than installed as an opaque package — matching the project owner's requirement to retain
full code ownership for a client-facing product, while still getting design-token-driven
consistency.

**Alternatives considered**:
- **Vuetify / PrimeVue** (full pre-built component libraries): rejected — opaque dependency,
  can't be hand-tuned per-component the way the project owner wants, and their own theming
  systems would compete with the app's existing `--color-*` variables instead of building on them.
- **Headless UI for Vue alone (no shadcn)**: rejected — would require hand-building the
  Tailwind styling layer shadcn-vue already provides, reproducing the same "dağınık" /
  inconsistency problem this migration exists to solve.

## Decision: Theming — alias shadcn tokens to existing `--color-*` variables

**Rationale**: shadcn-vue's CLI generates a self-contained oklch light/dark palette by default
(`:root` + `.dark` class). This app already has a working, more elaborate theme system (dark
default, `[data-theme='light']`, `[data-theme='high-contrast']`, plus a `[data-colorblind='true']`
attribute variant) driven by `document.documentElement.setAttribute('data-theme', ...)` in
`stores/ui.js`, not a `.dark` class. Rather than running two parallel theme systems, every
shadcn semantic token (`--background`, `--primary`, `--border`, `--chart-1..5`, etc.) was
re-pointed with `var(--color-bg)`, `var(--color-accent)`, `var(--glass-border)`, etc. in
`src/assets/main.css`, and the CLI-generated `.dark { ... }` block was deleted as dead code (the
app never applies a `.dark` class to `<html>`).

**Alternatives considered**:
- **Keep shadcn's own oklch palette, add a bridge/override per theme**: rejected — would require
  hand-maintaining 3 near-duplicate palettes (shadcn defaults × 3 app themes) instead of one.
- **Migrate the app's own theme system to shadcn's `.dark` class convention**: rejected — much
  larger blast radius (every theme check in the codebase references `data-theme`), out of scope
  for a UI-component migration, and not requested.

**Validated by**: a production `vite build` completed clean after the alias change, and the
`Button` component (migrated into `DashboardPlaceholder.vue`) renders using only the aliased
tokens with no separate styling.

## Decision: RTL support

**Rationale**: `components.json` was initialized with `"rtl": true`, which is shadcn-vue's
built-in flag for generating RTL-aware component markup/classes at generation time (logical
Tailwind properties — `ms-*`/`me-*` instead of `ml-*`/`mr-*`, etc.) — this matches the app's
existing Arabic-locale RTL support (`document.documentElement.setAttribute('dir', ...)` in
`HomeView.vue`).

**Alternatives considered**:
- **Generate LTR-only components and hand-patch RTL later**: rejected — the CLI flag makes this
  free at generation time; hand-patching later is strictly more work for the same result.

## Decision: Migration granularity and sequencing

**Rationale**: Per spec FR-006/FR-007 and the project owner's explicit request ("component by
component... yedeğini alırım"), each migration is one component (or one tightly-coupled
component pair, e.g. the collapsed/expanded Sidebar button variants) per step, verified with a
build + visual check across all 3 themes + RTL before moving on. Atoms (buttons) first, since
composites (dialogs, panels, forms) are built from them — migrating a dialog before its buttons
are converted would mean redoing the buttons inside it later anyway.

**Alternatives considered**:
- **File-by-file migration regardless of atom/composite tier**: rejected — would migrate the
  same button styling logic multiple times as it's encountered in different files, instead of
  once in the shared `ui/button` component.
- **Big-bang full-app migration**: explicitly rejected by the project owner earlier in this
  conversation (risk of an extended broken/inconsistent state, no incremental rollback).
