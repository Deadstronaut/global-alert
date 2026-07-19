# Implementation Plan: Country-Locked Map View

**Branch**: `044-country-locked-exclusive-layers` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/044-country-locked-exclusive-layers/spec.md`

**Note (2026-07-19)**: This plan originally covered a second component ("mutually exclusive
hexagon layers" — hiding the hazard-event hex grid whenever an exposure layer was toggled on, and
vice versa). That component was implemented, then explicitly reverted at the user's request after
live review: the desired behavior is the opposite — the hazard view and the exposure-layer panel
must coexist independently, never hiding each other. This plan has been rewritten to cover only
the surviving scope (country-locked camera). See spec.md's own Note for the same context.

## Summary

One frontend/map-interaction change, scoped to `src/components/MapView.vue` and `src/stores/
auth.js` — no changes to any backend fetch/aggregation pipeline (spec.md FR-007).

**Country-locked camera**: on mount, if `authStore.countryCode` is set and the user is not a
`super_admin` (this project's existing "locked vs. sees-all" distinction — `super_admin` is the
sees-all role, analogous to anon), fit the camera to that country's boundary at a per-country
default zoom (new `default_zoom` column on `country_boundaries`, falling back to the existing
`zoomToCountry()` fit-to-bounds behavior if unset), and skip registering the double-click "fly to
a different country" handler for that session. The hazard-event hex grid and the exposure-layer
panel (spec 042) are explicitly left uncoordinated — both remain independently visible at all
times, since a user needs to see a selected exposure layer (e.g. roads, rivers, WorldPop
population) overlaid against whichever hazard view mode (status/hexagon/heat) is currently active.

## Technical Context

**Language/Version**: Vue 3 / Pinia / JavaScript (frontend only) — matching this project's
existing stack exactly, no new dependency.

**Primary Dependencies**: None new. Reuses `maplibre-gl`'s existing `cameraForBounds`/`fitBounds`
(already used by `zoomToCountry()`) and the existing `useAuthStore` Pinia store.

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
handful of conditional branches to already-executing code paths (mount, click handlers), not a
new rendering workload.

**Constraints**: No new backend service (Constitution Principle VIII) — this is purely a frontend
change plus one nullable column. The country-locked camera restriction is map-interaction-layer
UX only, not a substitute for server-side/RLS access control, which already exists independently
(spec.md Assumptions — explicitly not a security boundary).

**Scale/Scope**: Applies to every served country uniformly (FR-002's data-driven requirement) —
no country-specific code branches. Manually verified for Turkey and Madagascar (this project's
established MVP demo countries), consistent with specs 040/041/043's verification scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. No hazard-type-specific logic touched.
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
- **VI. Accessibility & Internationalization** — N/A. No new user-facing strings.
- **VII. Performance & Resilience by Design** — N/A beyond existing map performance
  characteristics (see Performance Goals above).
- **VIII. Simplicity & YAGNI** — APPLIES. The camera-fit logic reuses existing
  `cameraForBounds`/`flyTo` patterns already proven by `zoomToCountry()` — no new abstraction.

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
│                                    #   double-click handler registration
├── stores/
│   └── auth.js                    # MODIFIED (small): add `isCountryLocked` computed
│                                    #   (countryCode set && role !== 'super_admin')
supabase/
└── migrations/
    └── 20260719160000_country_boundaries_default_zoom.sql   # nullable default_zoom column
```

**Structure Decision**: No new files beyond one migration — a small, self-contained change layered
onto one already-existing store (`authStore`), not a new subsystem.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none taken on)* | — | — |

**Considered and deferred:**

| Option | Why Deferred |
|--------|--------------|
| Enforcing the country-lock restriction via `maxBounds`-clamping the camera so it's physically impossible to pan to another country | More "locked-down" feeling, but spec.md's User Story 2 acceptance scenario 2 explicitly requires normal zoom/pan to keep working — a hard `maxBounds` clamp would make it easy to accidentally over-restrict legitimate zoom-out/pan-around-your-own-country-and-its-immediate-coastline usage; the simpler fix (just don't wire the double-click-to-a-different-country handler) satisfies FR-004/FR-005 exactly without touching camera physics. |

**Reverted (not a deferred option — was built, then explicitly undone):**

| What | Why reverted |
|------|--------------|
| A single shared `activeHexagonView`-style coordination (hiding the hazard hex grid when an exposure layer turned on, and vice versa) | Implemented per the original spec, then reviewed live by the user, who clarified the actual desired behavior is the opposite: the hazard view and exposure-layer panel must remain simultaneously visible so a selected exposure layer's correlation with the hazard status/hexagon/heat view can be seen. The corresponding code (`hideAllExposureLayers()`, `hideHazardHexGrid()`, and their call sites in `selectCountry()`/`toggleExposureLayer()`) was removed entirely rather than left dormant (YAGNI — dead code with no future use isn't kept "just in case"). |
