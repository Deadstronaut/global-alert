# Research: Sidebar Hazard-View Layout Rework + Manual Hexagon Resolution Control

## §1. Layout: `.map-mode-selector` and the Afet Ansiklopedisi nav-link, confirmed live

**Decision**: `SidebarPanel.vue`'s `.map-mode-selector` (3 buttons, `mode-btn` class, flex row
with equal-width children) currently holds durum/petek/ısı side by side. Immediately below it
(`.nav-links`) is a full-width "🌋 Afet Ansiklopedisi" button (`sidebar-action-btn` class,
`width: 100%`). The new petek panel is inserted between these two — same `sidebar-action-btn`
full-width styling as the Afet Ansiklopedisi button (satisfying spec.md FR-002's "matching that
section's width"), with the durum/ısı pair remaining in `.map-mode-selector` (now 2 buttons
instead of 3).

**Note**: There is a second, separate collapsed-sidebar icon toolbar (`SidebarPanel.vue`'s
"collapsed" state, icon-only buttons) that also has 3 durum/petek/ısı icon buttons in a row. This
collapsed view has no room for a slider by nature (icon-only, narrow rail) — spec.md's layout
requirements (FR-001/FR-002) are written around the expanded sidebar; the collapsed view keeps its
existing 3-icon row unchanged (out of scope — a resolution slider cannot meaningfully exist in an
icon-only rail, and the user's description was specifically about the expanded panel).

## §2. Manual resolution state: new field on the existing `uiStore`, not a new store

**Decision**: Add `manualHexResolution` (`ref(null)`) to `useUIStore` (`ui.js`), alongside the
existing `mapMode` ref — same store, same non-persisted (session-only) shape. `null` means
"automatic" (today's zoom-based `hexResForZoom()` behavior, unchanged); a set integer overrides it.

**Why not a separate store**: `mapMode` already establishes the exact pattern needed (a small
piece of cross-component UI state read by both `SidebarPanel.vue` and `MapView.vue`) — a second,
parallel store for one more field would be pure duplication (Constitution Principle VIII).

## §3. Country-hex-grid regeneration paths that must respect the override — both found live

**Decision**: Two existing code paths regenerate the selected country's `country-hex-grid` via the
hex worker, and both must check `uiStore.manualHexResolution` before falling back to the automatic
zoom-derived value:

1. `refreshCountryHexGridFromSelection()` (added this session, spec 044's Phase 7 fix) — called on
   country selection and on returning to `'hexagon'` mode.
2. `watch(currentHexRes, ...)` (`MapView.vue`) — regenerates the grid whenever the map's zoom
   crosses a resolution-bucket threshold, **independently** of the above. This is the path FR-005
   ("manual choice persists across zoom changes") most directly targets — without guarding this
   watcher too, a manually-set resolution would silently revert the next time the user zoomed
   across a bucket boundary.

**Confirmed NOT to touch**: the world/viewport background hex mesh (`updateViewportGrid`,
`FILL_VIEWPORT`, `hexGridCache`) and exposure-layer hexagons (WorldPop/Kontur, spec 043) use
`currentHexRes` for entirely separate rendering paths with their own independent resolution
logic — spec.md's Assumptions explicitly scope the override to the country-selected grid only, and
neither of those two other paths is touched by this feature.

## §4. Resolution range: H3–H8 attempted first, live-tested against Turkey — **narrowed to H3–H6**

**Decision (final, post-live-test)**: `MIN_HEX_RES = 3, MAX_HEX_RES = 6` — the H3–H6 fallback,
matching today's existing automatic maximum exactly.

**Live test performed**: rather than a browser UI session, the exact algorithm the hex worker runs
(`hexWorker.js`'s `polygonToCells(polyCoords, resolution + 1, 2)` — note the worker itself adds
`+1` to whatever resolution is requested) was run directly in Node against Turkey's real boundary
geometry (the same `world-atlas/countries-10m.json` topojson `_allCountryFeatures` uses), across
the full proposed slider range:

| Slider value | Actual H3 resolution (`+1`) | Cell count | Compute time |
|---|---|---|---|
| 3 | 4 | 409 | 46ms |
| 4 | 5 | 2,859 | 79ms |
| 5 | 6 | 19,990 | 307ms |
| 6 | 7 | 139,884 | 1,787ms |
| 7 | 8 | 979,005 | 12,575ms |
| 8 | 9 | 6,853,085 | 87,494ms |

Slider values 7 and 8 are unusably slow (12.5s and 87s respectively just to *compute* the cells,
before any MapLibre GL render cost) and produce cell counts (~1M and ~6.85M) far beyond what a
client-side GeoJSON fill/stroke layer can render smoothly. Slider value 6 (actual resolution 7,
~140,000 cells, ~1.8s) matches today's existing automatic maximum already running in production
for Turkey at high zoom — confirmed safe by virtue of already being live.

**H3 resolution cell-size reference** (from spec 043 research.md §3, already established in this
project): resolution 7 ≈ 5.2 km² per cell, each step finer divides cell count by ~7 — the live-test
numbers above track this almost exactly (139,884 → 979,005 is a ~7× jump from resolution 7 to 8),
confirming the a priori estimate that motivated trying the narrower range first was directionally
correct, even though the actual live numbers (needed for the `+1` discovery and precise timing)
could only be obtained by running the real code, not estimated from cell-size alone.

## §5. Slider default position when no manual value is set

**Decision**: The slider's visual handle position, when `manualHexResolution` is `null`
("automatic," no manual choice made yet), is a one-time cosmetic default (not read from
`currentHexRes` live) — moving it is what sets `manualHexResolution` for the first time. This
means the *rendered grid* always matches the automatic default until the user actually interacts
with the slider (satisfying FR-007 exactly), while the *slider's starting handle position* is a
simple static value, not wired to `MapView.vue`'s live zoom-derived resolution.

**Why**: Wiring the slider's idle position to the live automatic value would require exposing
`currentHexRes` (a `MapView.vue`-local computed) through `uiStore` just for cosmetic purposes,
adding a second piece of cross-component coupling for a detail spec.md's Success Criteria don't
require (SC-003/SC-004 are about the *rendered grid* and *persistence*, not the slider's idle
handle position) — rejected as unnecessary complexity for a cosmetic-only concern (Constitution
Principle VIII).
