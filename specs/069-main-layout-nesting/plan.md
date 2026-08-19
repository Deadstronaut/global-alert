# Implementation Plan: Main Layout Shell (Nested Routing)

**Branch**: `069-main-layout-nesting` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/069-main-layout-nesting/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Introduce a persistent `MainLayout.vue` shell and restructure `vue-router`'s currently-flat
route list into a nested route: authenticated routes become `children` of a parent route whose
`component` is `MainLayout`, rendered via a `<router-view/>` inside it. Public routes (`/login`,
`/portal`, `/report`, `/mfa-challenge`) stay outside the shell exactly as they render today. No
existing page component's internal markup/logic changes — only where it mounts changes. No new
routes, no renamed routes, no auth-guard changes.

**Revision 2** (same plan, extended scope): the shell absorbs `SidebarPanel.vue`'s controls
instead of leaving them duplicated. Header: brand/logo (left) + Panel/Konum/world-shape toggle
(right, before language/account). Hazard row: becomes the sidebar's existing multi-select
disaster-type filter (not a taxonomy-driven sub-menu); the most recently toggled type becomes
"focused" and drives a new focus row (count/severity/forecast/quick-links, replacing the
original "contextual sub-menu" concept). Footer gains a status row (Durum/hex-resolution/
severity legend) above the existing date-scrubber row. Once each piece works in its new home,
`SidebarPanel.vue`'s corresponding section is removed — this is a *migration*, not a *copy*: the
sidebar's existing computed properties/functions/state move with their logic intact rather than
being reimplemented.

## Technical Context

**Language/Version**: JavaScript (Vue 3.5 `<script setup>` SFCs), Node/Vite tooling already in repo

**Primary Dependencies**: vue-router 5.2 (nested routes + named views not required — single
default `<router-view/>` per level), pinia 4 (existing `auth`, `disaster`, `ui`, `geolocation`,
`sources` stores — `hazardTypes` no longer used by the hazard row, see Revision 2), vue-i18n 11
(existing i18n setup, all 7 locales)

**Storage**: N/A (no new persistence; layout is presentational, reuses existing stores)

**Testing**: vitest (unit, `tests/unit`), existing e2e suite (`tests/e2e`) — reuse, do not
introduce a new test runner

**Target Platform**: Browser SPA (existing web app), must keep working on the existing
responsive breakpoints

**Project Type**: Single-project web frontend (Vue SPA) with a Supabase backend — this feature
touches frontend only

**Performance Goals**: Hazard sub-menu reveal <100ms perceived (client-side state change, no
network call required per SC-003)

**Constraints**: Zero behavior change to auth guard (login redirect, role gating, MFA
challenge/enrollment redirects — FR-007); zero change to route names/paths/`:countryCode`
passthrough (FR-006); zero change to public routes (FR-005); zero change to existing page
component internals (FR-008)

**Scale/Scope**: ~10 existing authenticated routes move under the shell; 1 new layout component;
router restructuring only (no new backend endpoints, no schema changes). Revision 2 adds: 3
header controls (Panel/Konum/world-shape), a hazard-filter row rewrite, a new focus row, a new
footer status row, and the removal of ~6 sections from `SidebarPanel.vue`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: PASS, revised. The hazard row now
  mirrors `SidebarPanel.vue`'s own `disasterTypes` list — that list is itself a fixed UI
  enumeration (icons/labels/css classes per type), not a hard-coded *taxonomy* substitute; the
  underlying active/inactive state still flows through `disasterStore.activeLayers`
  (data-driven), and the list's codes match the hazard taxonomy's fallback set 1:1. No new
  hazard-specific branching is introduced — adding a hazard type still only requires adding one
  entry to that existing list plus a `disasterStore` layer key, matching how the sidebar already
  extends today.
- **Principle VI (Accessibility & i18n)**: PASS, with an explicit requirement — the language
  dropdown must drive the existing `vue-i18n` locale switch (all 7 locales), and every new
  string in the shell (menu labels, dropdown items, focus-row labels, footer status labels) must
  go through i18n keys added to all 7 locale files, not hard-coded text. Dark/light/
  high-contrast/reduced-motion must not regress — the shell must inherit existing theme tokens,
  not introduce a parallel styling system.
- **Principle VIII (Simplicity & YAGNI)**: PASS, reinforced by Revision 2's own success
  criterion (SC-005: reuse, don't reimplement). No new services/stores/frameworks introduced;
  reuses existing Pinia stores (`disasterStore`, `uiStore`, `geolocationStore`, `sourcesStore`),
  existing i18n setup, existing vue-router. Migrating `SidebarPanel.vue`'s existing computed
  properties/functions (magnitude/depth/duration sliders, calendar date-range apply/clear with
  its mutually-exclusive-mode logic, hex resolution, alert radius, severity toggle, source-health
  classing) verbatim into their new component homes is explicitly preferred over rewriting them
  — rewriting would risk silently dropping the several documented bug-fix comments already in
  that logic (e.g. the duration-vs-calendar race-condition fix).
- **Principle II (Scope Discipline)**: PASS / N/A. No dissemination channel, identity, or CAP
  ingestion work is touched by this change.

No violations requiring Complexity Tracking justification.

## Project Structure

### Documentation (this feature)

```text
specs/069-main-layout-nesting/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── layouts/
│   └── MainLayout.vue        # header + hazard row + focus row + footer status row + footer
│                              # filter/date row, wraps <router-view/>
├── components/
│   ├── layout/                 # small pieces MainLayout composes
│   │   ├── AppHeader.vue           # MODIFIED — brand/logo (left) + Panel/Konum/world-shape
│   │   │                           # (right, before language) + language + account dropdowns
│   │   ├── HazardTypeNav.vue       # MODIFIED — multi-select disaster-type filter (was: taxonomy
│   │   │                           # sub-menu trigger), sourced from the same fixed list
│   │   │                           # SidebarPanel.vue's disaster accordion used
│   │   ├── HazardFocusRow.vue      # NEW — replaces HazardSubMenu.vue: focused hazard's live
│   │   │                           # insight strip (count/severity/forecast/quick-links)
│   │   ├── FooterStatusRow.vue     # NEW — Durum (Normal/Hexagon/Heatmap) + hex-resolution
│   │   │                           # slider + severity/density legend
│   │   └── DateScrubberFooter.vue  # MODIFIED — now the bottom footer row: magnitude/depth/
│   │                               # duration sliders (left) + date scrubber (center) + calendar
│   │                               # date-range picker (right)
│   └── SidebarPanel.vue        # MODIFIED — disaster-filter accordion, severity legend,
│                                # magnitude/depth/duration section, view-mode section, location
│                                # section, standalone Panel button, and brand/logo header block
│                                # all REMOVED (migrated out, not duplicated); country banner,
│                                # last-updated, source-health status relocate to the shell
├── router/
│   └── index.js               # flat routes regrouped: public routes stay top-level,
│                               # authenticated routes become children of a MainLayout parent route
├── views/
│   └── (unchanged: HomeView.vue, CapView.vue, IncidentsView.vue, ShelterInfoView.vue,
│     HazardEncyclopediaView.vue, AdminView.vue, AccountSecurityView.vue, LoginView.vue,
│     PublicPortalView.vue, ReportHazardView.vue)
└── stores/
    └── (unchanged: disaster.js [activeLayers/toggleLayer/isLayerActive, minMagnitude, maxDepth,
      startDate/endDate], ui.js [viewMode, mapMode, manualHexResolution], geolocation.js
      [alertRadius], sources.js — all reused as-is, no new store logic)

tests/
└── unit/
    └── router/                # nested-route assertions (auth guard still fires on children,
                                # public routes still standalone, route names/paths unchanged)
```

**Structure Decision**: Single Vue SPA (existing `src/` layout). Add a `src/layouts/` folder
(new, first layout the app has) holding `MainLayout.vue` plus small composed pieces under
`src/components/layout/` so the layout file itself stays a thin composition, matching the
existing pattern of `src/components/<domain>/` subfolders (`admin/`, `ai/`, `dashboard/`, etc.).
`src/router/index.js` is restructured, not rewritten — public routes keep their current
top-level definitions; authenticated routes move under one parent route whose `component` is
`MainLayout` and whose `children` are the existing route objects with paths made relative.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally omitted.
