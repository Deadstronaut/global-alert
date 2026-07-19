# Implementation Plan: Country-Locked Map View with Mutually Exclusive Hexagon Layers

**Branch**: `044-country-locked-exclusive-layers` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/044-country-locked-exclusive-layers/spec.md`

## Summary

Two coordinated frontend/map-interaction changes, both scoped to `src/components/MapView.vue` and
its supporting stores — no changes to any backend fetch/aggregation pipeline (spec.md FR-011).

1. **Country-locked camera**: on mount, if `authStore.countryCode` is set and the user is not a
   `super_admin` (this project's existing "locked vs. sees-all" distinction — `super_admin` is the
   sees-all role, analogous to anon), fit the camera to that country's boundary at a per-country
   default zoom (new `default_zoom` column on `country_boundaries`, falling back to the existing
   `zoomToCountry()` fit-to-bounds behavior if unset), and skip registering the double-click
   "fly to a different country" handler for that session.
2. **Mutually exclusive hexagon layers**: this project already has a single mutually-exclusive
   `uiStore.mapMode` string (`'normal' | 'hexagon' | 'heatmap'`) driving the hazard-event hex
   grid's visibility — a generalizable "layer/mode" concept already exists, it just doesn't yet
   know about the exposure-layer panel. Two small coordination hooks close that gap: turning on
   any exposure-layer dataset (`toggleExposureLayer()`) hides the hazard hex grid if
   `mapMode === 'hexagon'`; selecting a country / entering hazard mode (`selectCountry()`) hides
   any currently-visible exposure-layer datasets. Exposure datasets keep their existing
   multi-select-amongst-themselves behavior (spec.md FR-010) — only the hazard-vs-exposure switch
   is exclusive.

## Technical Context

**Language/Version**: Vue 3 / Pinia / JavaScript (frontend only) — matching this project's
existing stack exactly, no new dependency.

**Primary Dependencies**: None new. Reuses `maplibre-gl`'s existing `cameraForBounds`/`fitBounds`
(already used by `zoomToCountry()`), the existing `useAuthStore`/`useUiStore` Pinia stores, and
the existing `layerVisibility` ref already driving the exposure-layer panel's checkboxes.

**Storage**: One additive migration — a nullable `default_zoom numeric` column on
`country_boundaries` (already the project's established per-country, RLS-scoped config table —
`country_admin` can set their own country's row, `super_admin` any row, matching the table's
existing write-policy shape). No new table.

**Testing**: This feature is almost entirely Vue component interaction logic
(`src/components/MapView.vue`) — the project's existing convention (spec 038 T009, specs
040/041/043) reserves `deno test` unit coverage for backend pure functions and leaves
frontend/UI interaction to manual/live verification, since there is no existing Vue component
test harness in this project to extend. The one genuinely pure, easily-unit-testable piece this
feature introduces — "is this user country-locked, and what's their zoom fallback" — is small
enough to verify by direct inspection/manual test rather than justifying a new test framework
(Constitution Principle VIII).

**Target Platform**: Web (Vue SPA), same as all existing map features.

**Project Type**: Existing frontend (single project) — no new project type.

**Performance Goals**: N/A beyond existing map performance characteristics — this feature adds a
handful of conditional branches to already-executing code paths (mount, click handlers, toggle
handlers), not a new rendering workload.

**Constraints**: No new backend service (Constitution Principle VIII) — this is purely a frontend
coordination change plus one nullable column. The country-locked camera restriction is
map-interaction-layer UX only, not a substitute for server-side/RLS access control, which already
exists independently (spec.md Assumptions — explicitly not a security boundary).

**Scale/Scope**: Applies to every served country uniformly (FR-002's data-driven requirement) —
no country-specific code branches. Manually verified for Turkey and Madagascar (this project's
established MVP demo countries), consistent with specs 040/041/043's verification scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. No hazard-type-specific logic touched; this
  feature only coordinates *which* hexagon-shaped layer category is visible, not how any
  individual hazard type or exposure source itself is modeled/rendered.
- **II. Scope Discipline** — PASS. No dissemination/identity/CAP-ingestion surface touched. This
  feature reads (not writes) `authStore`'s existing `role`/`countryCode` fields — it does not add
  a new identity/authorization mechanism (Principle II's local-auth-only boundary is unaffected,
  since this reuses the already-existing local auth session shape).
- **III. CAP v1.2 Compliance** — N/A.
- **IV. Data Quality & Normalization** — N/A (no new data ingestion; the new `default_zoom` column
  is admin-configured, not externally-sourced data requiring validation/dedup).
- **V. Access Control & Auditability** — PASS, with an explicit boundary noted (spec.md
  Assumptions): the country-locked camera/navigation restriction is a UX convenience, not a
  security control — the actual data-access boundary remains RLS-enforced server-side exactly as
  today, unchanged by this feature. `default_zoom` writes go through `country_boundaries`'s
  existing RLS policies (`country_admin` own-row, `super_admin` any-row) — no new policy needed.
- **VI. Accessibility & Internationalization** — APPLIES, lightly. No new user-facing strings are
  strictly required (mode-switching is behavioral, not textual) — if any new UI affordance is
  added (e.g. a visual indicator of which hexagon view is active), it MUST go through the existing
  i18n system per this principle; tracked as a tasks.md item, not assumed unnecessary.
- **VII. Performance & Resilience by Design** — N/A beyond existing map performance
  characteristics (see Performance Goals above).
- **VIII. Simplicity & YAGNI** — APPLIES. Deliberately reuses the existing `uiStore.mapMode`
  concept and existing `layerVisibility` ref rather than introducing a new parallel state
  management system for "active hexagon view" — see Complexity Tracking for the alternative
  considered and rejected.

**Initial gate result: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/044-country-locked-exclusive-layers/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md               # Phase 2 output (/speckit-tasks)
```

No `contracts/` directory — this feature introduces no new API/RPC surface (the one new DB column,
`default_zoom`, is read/written through the existing generic `country_boundaries` REST access
already used by every other per-country config value; no new endpoint or function is added).

### Source Code (repository root)

```text
src/
├── components/
│   └── MapView.vue                # MODIFIED: mount-time country-locked camera fit; conditional
│                                    #   double-click handler registration; hazard<->exposure
│                                    #   visibility coordination in selectCountry()/
│                                    #   toggleExposureLayer()
├── stores/
│   ├── auth.js                    # MODIFIED (small): add `isCountryLocked` computed
│   │                                #   (countryCode set && role !== 'super_admin')
│   └── ui.js                      # UNCHANGED — existing mapMode reused as-is
supabase/
└── migrations/
    └── <timestamp>_country_boundaries_default_zoom.sql   # NEW: nullable default_zoom column
```

**Structure Decision**: No new files beyond one migration — this is intentionally a small,
coordination-only change layered onto three already-existing pieces (`authStore`, `uiStore.mapMode`,
`layerVisibility`), not a new subsystem. Keeping the change this contained is itself a direct
application of Constitution Principle VIII to a feature that could otherwise have sprawled into a
new "layer manager" store.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none taken on)* | — | — |

**Considered and deferred:**

| Option | Why Deferred |
|--------|--------------|
| A new unified `activeHexagonView` Pinia store/state (a formal `'hazard' \| 'exposure' \| null` enum, as spec.md's Key Entities section describes conceptually) replacing both `uiStore.mapMode` and `layerVisibility`'s ad hoc exposure-layer tracking | Spec.md's FR-007 describes the *behavior* (mutual exclusion), not a mandate for a specific state-shape; `uiStore.mapMode` already provides an equivalent single-source-of-truth for the hazard side, and `layerVisibility` already provides a working multi-select for the exposure side (which FR-010 requires to remain multi-select) — introducing a third, unifying state object would mean keeping three things in sync instead of two, for no behavioral gain at this feature's scope. Revisit only if a third mutually-exclusive-with-the-others view category is ever added (not currently planned). |
| Enforcing the country-lock restriction via `maxBounds`-clamping the camera so it's physically impossible to pan to another country | More "locked-down" feeling, but spec.md's User Story 2 acceptance scenario 2 explicitly requires normal zoom/pan to keep working — a hard `maxBounds` clamp would make it easy to accidentally over-restrict legitimate zoom-out/pan-around-your-own-country-and-its-immediate-coastline usage; the simpler fix (just don't wire the double-click-to-a-different-country handler) satisfies FR-004/FR-005 exactly without touching camera physics. |
