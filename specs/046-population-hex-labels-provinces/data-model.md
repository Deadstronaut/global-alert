# Data Model: Population Hexagon Labels + Province-Level Population View

No new database tables or columns (FR-009, Constitution Principle VIII). Both entities below are
transient, client-side, derived-at-render-time shapes.

## Population hexagon label (derived, not stored)

Computed when `addExposureLayer()` builds a population dataset's `FeatureCollection`
(`MapView.vue`), added as an extra GeoJSON property alongside the existing `__metricValue`:

| Field | Source | Notes |
|---|---|---|
| `__populationLabel` | `formatPopulationLabel(feature.properties.__metricValue)` | Abbreviated display string (e.g. `"482K"`), computed once at fetch time, not per-render. |

Rendered via a `symbol` MapLibre layer (`{sourceId}-label`) referencing `__populationLabel` as
`text-field`; visibility gated by zoom/resolution per research.md §2. Only added when
`isPopulationSource(dataset.source_name)` is true (research.md §3).

## Province population aggregate (derived, not stored)

Computed client-side when the user switches a population dataset's view to "by province":

| Field | Source | Notes |
|---|---|---|
| `provinceName` | `feature.properties[nameProperty]` from `loadRegionBoundaries()` | e.g. `"Aydın"`. |
| `geometry` | Same province feature's `geometry` | Used directly as the MapLibre fill-layer source — no re-projection/simplification needed (already used elsewhere in the app at this resolution). |
| `totalPopulation` | Sum of `__metricValue` for every population-hexagon whose centroid falls inside `geometry` | Computed once per view-toggle (research.md §4), not persisted. |

Assembled into a `FeatureCollection` in-memory (one feature per province with `totalPopulation`
injected as a property) and rendered through the same `populationFillExpression()` used for
hexagons (research.md §5), scaled to this collection's own min/max.

## State additions

| Location | Field | Shape | Notes |
|---|---|---|---|
| `MapView.vue` (component-local, not `uiStore`) | `populationViewMode` (per dataset id, or a single active-dataset-scoped ref) | `'hexagon' \| 'province'` | Session-only UI state, mirrors the existing `layerVisibility`/`layerOpacity` refs' pattern — not persisted, not shared via `uiStore` (this is exposure-layer-panel-local state, not global map-mode state like `uiStore.mapMode`). |

No changes to `exposure_datasets`, `exposure_features`, or any existing store's persisted shape.
