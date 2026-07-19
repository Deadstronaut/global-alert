# Implementation Plan: Sidebar Hazard-View Layout Rework + Manual Hexagon Resolution Control

**Branch**: `045-hexagon-resolution-panel` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/045-hexagon-resolution-panel/spec.md`

## Summary

Two changes, both scoped to `src/components/SidebarPanel.vue`, `src/components/MapView.vue`, and
`src/stores/ui.js` — no backend/database changes (spec.md FR-008).

1. **Layout rework**: split `SidebarPanel.vue`'s existing 3-button `.map-mode-selector`
   (durum/petek/ısı) into a 2-button durum/ısı toggle, and add a new full-width "Petek" panel
   directly above the existing "🌋 Afet Ansiklopedisi" nav-link button, matching its width. The
   underlying `uiStore.mapMode` mutual-exclusion behavior (already fixed this session) is
   untouched — both the 2-button toggle and the new petek panel just read/write the same
   `uiStore.mapMode` value they always did, only rearranged.
2. **Manual hex resolution**: a new `uiStore.manualHexResolution` state (`null` = automatic,
   otherwise an integer H3 resolution), set via a slider inside the new petek panel.
   `MapView.vue`'s country-hex-grid regeneration paths (`refreshCountryHexGridFromSelection()` and
   the zoom-triggered `watch(currentHexRes, ...)`) prefer this value over the automatic
   zoom-derived one whenever it is set, and a new watcher regenerates the grid live when the
   slider moves. The world/viewport background hex mesh and exposure-layer hexagons are
   unaffected (spec.md Assumptions) — only the selected country's own grid respects the override.

## Technical Context

**Language/Version**: Vue 3 / Pinia / JavaScript (frontend only) — matching this project's
existing stack exactly, no new dependency.

**Primary Dependencies**: None new. Reuses the existing hex worker (`hexWorker.js`, `h3-js`'s
`polygonToCells`), the existing `uiStore` (Pinia), and this project's existing range-slider
pattern (`MapView.vue`'s `.map-layer-opacity` inputs, spec 042).

**Storage**: N/A — `manualHexResolution` is session-only UI state (Pinia store, not persisted to
the database), matching `uiStore.mapMode`'s own existing non-persisted pattern.

**Testing**: No new `deno test` coverage (frontend-only change, no backend pure functions
introduced) — verified via `eslint`/`npm run build` plus live browser testing during
implementation, specifically to settle FR-009's resolution-range decision (H3-H8 vs. H3-H6
fallback) against a real country's hex count (Turkey, this project's largest MVP demo country).

**Target Platform**: Web (Vue SPA), same as all existing map/sidebar features.

**Project Type**: Existing frontend (single project) — no new project type.

**Performance Goals**: The manual resolution's finer end (H7/H8) must not make the selected
country's hex grid impractically slow to compute (hex worker `polygonToCells`) or render
(MapLibre GL fill/stroke layers) for a country-scale selection — this is the live-tested gate
behind FR-009's H3-H8-vs-H3-H6 decision, not an assumed-safe default.

**Constraints**: No new backend service (Constitution Principle VIII) — purely a frontend
state/UI change. Must not alter the exposure-layer panel (prior-session fix) or any
world/viewport background hex mesh logic (spec.md Assumptions).

**Scale/Scope**: Applies uniformly to any selected country — no country-specific code. Live-tested
against Turkey (largest MVP demo country by area/hex count) to settle the resolution range.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. No hazard-type-specific logic touched.
- **II. Scope Discipline** — PASS. No dissemination/identity/CAP-ingestion surface touched.
- **III. CAP v1.2 Compliance** — N/A.
- **IV. Data Quality & Normalization** — N/A. No new data ingestion.
- **V. Access Control & Auditability** — N/A. No new access-control surface; session-only UI
  state, not written to any RLS-scoped table.
- **VI. Accessibility & Internationalization** — APPLIES. The new petek panel's label and any new
  slider affordance text MUST go through the existing i18n system across all 7 locales — tracked
  explicitly in tasks.md, not assumed unnecessary (the pre-existing durum/petek/ısı button labels
  in `SidebarPanel.vue` are currently hardcoded Turkish strings, a pre-existing gap this feature
  does not need to fix beyond its own new text, per Constitution Principle VIII/YAGNI — expanding
  that fix to the pre-existing labels is out of scope unless the user asks for it separately).
- **VII. Performance & Resilience by Design** — APPLIES directly. FR-009's live-tested
  resolution-range decision is exactly this principle in practice — a control is not shipped at a
  resolution level proven impractical for this project's actual country-scale data.
- **VIII. Simplicity & YAGNI** — APPLIES. `manualHexResolution` is one nullable ref in the existing
  `uiStore`, not a new store or persistence layer — mirrors `mapMode`'s own existing shape exactly.

**Initial gate result: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/045-hexagon-resolution-panel/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md               # Phase 2 output (/speckit-tasks)
```

No `contracts/` directory — no new API/RPC surface, purely frontend state and layout.

### Source Code (repository root)

```text
src/
├── components/
│   ├── SidebarPanel.vue           # MODIFIED: split map-mode-selector into durum/ısı pair; new
│   │                                #   full-width petek panel + resolution slider, above the
│   │                                #   Afet Ansiklopedisi nav-link
│   └── MapView.vue                 # MODIFIED: refreshCountryHexGridFromSelection() and the
│                                    #   currentHexRes watcher now prefer
│                                    #   uiStore.manualHexResolution when set; new watcher for
│                                    #   live slider-driven regeneration
└── stores/
    └── ui.js                       # MODIFIED (small): add `manualHexResolution` ref + setter
```

**Structure Decision**: No new files — a layout rework plus one new nullable field on the
already-existing `uiStore`, mirroring `mapMode`'s own shape. Kept intentionally small per
Constitution Principle VIII.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none taken on)* | — | — |
