# Phase 0 Research: Forecast Map Display

## 1. Forecast vs. nowcast Overlay exclusivity

**Decision**: Selecting a forecast variable and selecting a nowcast Overlay key are mutually
exclusive in the same visual map slot — selecting one clears the other in the Pinia store.
Implemented as: `setSelectedForecastVariable(variable)` sets `activeOverlayKey` to `null` (via
`uiStore.toggleOverlay`'s existing null-setting path or a direct assignment), and conversely
`toggleOverlay(key)` sets `selectedForecastVariable` to `null`.

**Rationale**: `activeOverlayKey` is already a single-select radio for exactly this reason (only
one pre-colored raster Overlay makes sense on the map at once — nullschool's own Overlay row is
`role="radiogroup"`, per `FlowControlPanel.vue`'s own comment). Showing a forecast overlay
simultaneously with a nowcast Overlay would directly undermine spec.md FR-004 ("never mistaken
for real-time data") — two overlapping color rasters with no distinguishing frame is worse for
distinguishability than either alone. Keeping them as two separate store fields (not merging
forecast keys into `activeOverlayKey` itself, e.g. `'forecast:temperature'`) keeps every existing
Overlay code path (the `OVERLAY_KIND` dict, `applyOverlayKey`, the existing
`watch(() => uiStore.activeOverlayKey, ...)`) completely untouched, satisfying FR-008.

**Alternatives considered**: Allowing both simultaneously (stacked) was rejected per FR-004 above.
Reusing `activeOverlayKey` itself for forecast keys (prefixed) was rejected because it would force
every existing `OVERLAY_KIND`/`overlayLayerIds` consumer to learn about a new key shape, violating
"must not change existing current-conditions layer behavior" more than the chosen approach.

## 2. Map layer id and rendering mechanism

**Decision**: One fixed layer id (`forecast-overlay`) and source id (`forecast-overlay-source`),
not a per-variable id table like `overlayLayerIds`. Rendered via a plain MapLibre `image` source +
`raster` layer — the exact same mechanism `setOverlayLayerEnabled` already uses (not
`SimpleWindLayer`/particle rendering), per spec.md FR-009 (wind/wave forecast variables are
static rasters in this scope, matching `forecast_snapshots`' own texture-per-day shape, which
has no animatable vector field the way `flow_snapshots` does).

**Rationale**: Only one forecast (variable, day) can ever be shown at once (research.md §1 —
single-select), so a per-variable id table (which exists for Overlay because, architecturally,
Overlay *could* support showing several different pre-colored layers, gated only by the radio
UX) would be unused complexity. A single fixed id is simpler and matches Simplicity/YAGNI.

**Alternatives considered**: Reusing `overlayLayerIds`' dict-per-variable shape was rejected as
premature generality for a feature that is single-select by design (research.md §1).

## 3. Fetching the day list per variable

**Decision**: A new `fetchForecastDayList(variable)` in `forecastLayerData.js` queries
`forecast_snapshots` for the selected variable's most recent `issued_at` cycle's distinct
`forecast_step_hours` values, ascending, and returns them alongside each step's `valid_at` (for
the human-readable day label, FR-010). The day Slider's `max` is `dayList.length - 1`.

**Rationale**: Spec 055 confirmed (live, 2026-08-06) that UV Index only has ~3 of the 8 possible
steps (its product's own 120h lead-time limit), and any variable can transiently have fewer rows
than usual if a scheduled ingestion run partially failed. Hardcoding "8 steps, day 1/3/5/7/9/11/
13/15" would silently misrepresent data that doesn't exist (violating Constitution Principle IV —
no fabricated values) whenever a variable's real availability differs. Fetching the real list
per variable is the only approach consistent with FR-002 ("covering every day for which that
variable has ingested data").

**Alternatives considered**: A single shared, hardcoded day list (assuming all variables always
have all 8 GFS steps) was rejected — it directly contradicts the live-verified UV Index gap and
would misrepresent data for any variable that isn't fully populated.

## 4. i18n key namespace

**Decision**: New keys under a `flowPanel.forecast.*` namespace (e.g.
`flowPanel.forecast.rowLabel`, `flowPanel.forecast.dayLabel`, `flowPanel.forecast.noData`),
scoped to `FlowControlPanel.vue`'s own existing key conventions, rather than reusing spec 055's
`dashboard.forecast.*` namespace.

**Rationale**: `dashboard.forecast.*` (spec 055) is scoped to the dashboard's `ForecastPanel.vue`
copy (e.g. "This is a probabilistic outlook..." — dashboard-specific wording for the 1mo/3mo
horizons this feature does not touch). `FlowControlPanel.vue` is a different UI surface with its
own terse, chip-label-style copy conventions (e.g. `ANIMATE_LABELS`, not full sentences) — reusing
the dashboard's key namespace would either force mismatched copy tone or create confusing
cross-references between two unrelated UI surfaces. A small amount of key duplication (e.g. both
namespaces having their own "Precipitation" label) is preferable to coupling two independent
components' copy through a shared namespace, matching this codebase's existing pattern of
per-component key scoping (`dashboard.charts.*` vs `sidebar.*` vs `contacts.*` are already
separate namespaces for the same underlying concepts elsewhere in this app).

**Alternatives considered**: Reusing `dashboard.forecast.variable*` keys directly was considered
and rejected for the reason above; it would also couple this feature's future copy changes to
spec 055's dashboard panel unintentionally.

## 5. Rapid slider-drag race condition (spec.md Edge Case)

**Decision**: The `fetchForecastSnapshot` call inside `MapView.vue`'s new watcher is guarded by a
simple "latest request wins" token (an incrementing request id compared after the `await`
resolves, discarding a stale response) — the same shape already informally handled by the
existing Height-selector watcher's remove-then-add sequencing, made explicit here because a day
slider is far more likely to be dragged quickly across many values than the Height selector's
discrete button clicks.

**Rationale**: Spec.md's edge case explicitly requires "the map MUST always end up showing the
last-selected day's data, not an intermediate day left behind by an in-flight request that
resolves after a later one" — a plain sequential remove/add without a race guard could show a
stale day if an earlier request's network round-trip happens to complete after a later one's.

**Alternatives considered**: Debouncing the slider's `@update:model-value` event was considered
as an alternative/complementary mitigation — kept as an implementation detail for tasks.md rather
than a research decision, since it reduces request volume but does not, by itself, guarantee
correctness the way a request-token guard does.
