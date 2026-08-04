# Implementation Plan: Shadcn UI Migration

**Branch**: `052-shadcn-ui-migration` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/052-shadcn-ui-migration/spec.md`

## Summary

Migrate the app's hand-written UI (buttons, dialogs, panels, form controls) to shadcn-vue
components one component at a time, atoms (buttons/icon-buttons) before composites
(dialogs/panels/forms), while every shadcn-vue design token stays aliased to the app's existing
`--color-*` palette in `src/assets/main.css` — so dark/light/high-contrast theming, RTL, and the
7-locale i18n system keep working per-component with zero separate migration work. Tailwind v4,
shadcn-vue (`components.json`), Reka UI, lucide-vue-next, and the first `Button` component are
already installed as of this plan.

## Technical Context

**Language/Version**: JavaScript (Vue 3.5 `<script setup>`, no TypeScript — `components.json` has `"typescript": false`)

**Primary Dependencies**: Vue 3.5, Pinia 4, vue-i18n 11, Vite 8 — plus newly added: Tailwind CSS v4 (`@tailwindcss/vite`), shadcn-vue 2.8 (CLI-driven, copy-paste components under `src/components/ui/`), Reka UI (headless primitives shadcn-vue wraps), `class-variance-authority` + `clsx` + `tailwind-merge` (via `src/lib/utils.js`'s `cn()`), `lucide-vue-next` (icon set), `tw-animate-css`

**Storage**: N/A (pure frontend styling/markup migration; no data model changes)

**Testing**: Vitest (existing `vitest.config.js`); no dedicated component test suite for this UI layer today — verification is manual per Success Criteria (build check + visual check across 3 themes + RTL)

**Target Platform**: Web (Vite build), same app shell shipped via Capacitor for mobile — migration must not break the Capacitor build

**Project Type**: Single-page web application (Vue 3 + Vite), frontend-only change — no `backend/`/`frontend/` split in this repo

**Performance Goals**: No regression vs. current bundle/build; Tailwind v4's JIT engine only emits CSS for classes actually used, so incremental component migration should add marginal CSS weight, not a large upfront cost

**Constraints**: Must preserve Principle VI (dark/light/high-contrast/colorblind/safe-mode, all 7 locales incl. Arabic RTL) for every migrated component; must not touch un-migrated components' files; every step must build clean (`vite build`) before moving to the next component

**Scale/Scope**: ~15 known hand-written components/patterns to eventually migrate (Sidebar buttons, SettingsPanel, ConfirmDialog, DashboardPlaceholder, AlertPanel, ImpactPanel, filter sliders, admin views, etc.); this plan covers the process and the first priority tier (buttons/icon-buttons), not a full one-shot migration of all of them

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — N/A. This feature touches only presentational components; no hazard/`DisasterEvent` logic is modified. **PASS**.
- **II. Scope Discipline** — N/A. No dissemination channels, identity, or CAP code paths touched. **PASS**.
- **III. CAP v1.2 Compliance** — N/A, no CAP authoring/export code touched. **PASS**.
- **IV. Data Quality & Normalization** — N/A, no data ingestion touched. **PASS**.
- **V. Access Control & Auditability** — N/A, no RBAC/audit-log code touched. **PASS**.
- **VI. Accessibility & Internationalization** — Directly load-bearing for this feature. Gate: every migrated component MUST be checked in dark/light/high-contrast and RTL before being marked "migrated" (spec FR-004, FR-005, SC-001). Design approach satisfies this by aliasing shadcn tokens to the app's existing theme-reactive `--color-*` variables rather than a static palette, so theme correctness is structural, not per-component manual work. **PASS, with the per-component verification step as the actual enforcement mechanism** (see quickstart.md).
- **VII. Performance & Resilience by Design** — N/A, no polling/offline/rendering-scale logic touched (this migration excludes the map/globe canvas layers entirely). **PASS**.
- **VIII. Simplicity & YAGNI** — This feature *does* add new frontend tooling (Tailwind v4, shadcn-vue, Reka UI) not on the constitution's stack list. Per Scope Constraints, this requires explicit flagging — done in spec.md's Assumptions ("Stack deviation flag"), approved interactively by the project owner. Recorded below in Complexity Tracking as required by Governance. **PASS (with justified, documented deviation)**.

## Project Structure

### Documentation (this feature)

```text
specs/052-shadcn-ui-migration/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature has no external API/interface surface (pure internal UI
component migration), so contract generation is skipped per the Phase 1 rule allowing this for
purely internal changes.

### Source Code (repository root)

```text
src/
├── assets/
│   └── main.css              # Tailwind v4 entry + shadcn token aliasing (already updated)
├── lib/
│   └── utils.js               # shadcn-vue's cn() helper (already added)
├── components/
│   ├── ui/                    # shadcn-vue components land here, one subfolder per component
│   │   └── button/             # already migrated (reference implementation)
│   ├── SidebarPanel.vue        # NEXT: icon-button + labeled-button migration target
│   ├── DashboardPlaceholder.vue # partially migrated (close button done; shell still legacy)
│   ├── SettingsPanel.vue       # future: dialog/panel-tier migration target
│   ├── ConfirmDialog.vue       # future: dialog-tier migration target
│   ├── AlertPanel.vue          # future: panel-tier migration target
│   └── impact/                 # future: panel-tier migration target
components.json                # shadcn-vue config (base: reka, style: new-york, rtl: true)
vite.config.js                 # @tailwindcss/vite plugin registered (already updated)
```

**Structure Decision**: No new top-level directories. shadcn-vue's own convention
(`src/components/ui/<component>/`) is adopted as-is since it matches this repo's existing
`src/components/` layout; migrated components are edited in place, not moved.

## Complexity Tracking

> Required because Constitution Check flagged a Principle VIII deviation (new tooling)

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| New dependencies: Tailwind CSS v4, shadcn-vue, Reka UI, lucide-vue-next, tw-animate-css, class-variance-authority, clsx, tailwind-merge | Hand-written CSS per component was producing visual inconsistency ("dağınık" / scattered look) across a growing component count; a token-driven, copy-paste-owned component system (not a black-box npm UI kit) fixes this while keeping full code ownership, which the project owner explicitly wants for a client-facing product | Continuing hand-written CSS indefinitely was rejected by the project owner (source of the inconsistency); a heavier pre-built component *library* (e.g. Vuetify, PrimeVue) was rejected because those aren't copy-paste-owned and would fail the same "want to hand-tune every component" requirement that ruled out just using someone else's finished UI |
