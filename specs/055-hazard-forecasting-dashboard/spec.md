# Feature Specification: Multi-Horizon Hazard Forecasting Dashboard

**Feature Branch**: `055-hazard-forecasting-dashboard`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Multi-horizon hazard forecasting feature: extend the current nowcast-only wind/weather pipeline into three distinct forecast horizons (short-range ~15 days deterministic, medium-range ~1 month sub-seasonal anomaly/probability, long-range ~3 months seasonal probabilistic outlook), displayed as a new Forecast panel on the existing dashboard next to current analytics/graphs, letting an admin pick a horizon and region. Must work per-deployment in the country-scoped federated architecture (each country self-hosts its own Supabase+Docker instance)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Short-range operational forecast (Priority: P1)

An admin monitoring a region wants to see how wind, precipitation, and temperature are expected to evolve over the next 15 days, so they can anticipate hazard conditions before they occur rather than only reacting to present conditions.

**Why this priority**: This is the closest extension of the existing nowcast pipeline (same underlying model family, just additional timesteps) and delivers the most immediate, actionable value for day-to-day operational planning (e.g., staging response resources ahead of an approaching storm).

**Independent Test**: Can be fully tested by selecting a region and the "15 days" horizon on the dashboard and confirming a day-by-day (or similar step) forecast of wind/precipitation/temperature is displayed, distinct from the current-conditions view.

**Acceptance Scenarios**:

1. **Given** an admin viewing the dashboard, **When** they open the Forecast panel and select the 15-day horizon for a region, **Then** they see a forecast broken out by day (or comparable step) showing expected wind, precipitation, and temperature for that region.
2. **Given** a selected 15-day forecast, **When** the admin moves through the available days, **Then** values update to reflect that specific day's forecast, and the data is clearly labeled as a forecast (not current conditions).
3. **Given** the underlying forecast data has not been refreshed within its expected cycle, **When** the admin opens the panel, **Then** the panel indicates the forecast's data timestamp/age rather than silently showing stale data as current.

---

### User Story 2 - Monthly outlook for near-term planning (Priority: P2)

An admin or planner wants a roughly 1-month outlook expressed as a likelihood/anomaly (e.g., "wetter than normal", "drier than normal") for a region, to inform near-term preparedness decisions (staffing, stock levels) that a 15-day forecast is too short to support.

**Why this priority**: Extends the feature's value horizon beyond short-range operations into preparedness planning, but depends on a different data product than User Story 1 and is less time-critical than the 15-day view.

**Independent Test**: Can be fully tested by selecting the "1 month" horizon for a region and confirming an anomaly/probability-style outlook (not a false-precision daily forecast) is displayed with a clear explanation of what the values mean.

**Acceptance Scenarios**:

1. **Given** an admin viewing the Forecast panel, **When** they select the 1-month horizon, **Then** they see a probabilistic/anomaly summary (e.g., above/near/below normal precipitation and temperature) for the selected region, visually distinguished from the deterministic 15-day view.
2. **Given** a 1-month outlook is displayed, **When** the admin hovers/taps for detail, **Then** they see an explanation that this is a probabilistic outlook, not a day-by-day forecast, to avoid misinterpretation.

---

### User Story 3 - Seasonal outlook for resource pre-positioning (Priority: P3)

A planner wants a ~3-month seasonal outlook (e.g., elevated drought or flood likelihood) for a region, to support longer-horizon resource pre-positioning and budget/preparedness decisions.

**Why this priority**: Highest value for strategic planning but lowest urgency and highest uncertainty; it is the smallest incremental addition once the medium-range (P2) probabilistic display pattern already exists, since it reuses the same anomaly/likelihood presentation style at a longer horizon.

**Independent Test**: Can be fully tested by selecting the "3 months" horizon for a region and confirming a seasonal likelihood classification (e.g., drought/flood risk relative to normal) is displayed with appropriate caveats about long-range uncertainty.

**Acceptance Scenarios**:

1. **Given** an admin viewing the Forecast panel, **When** they select the 3-month horizon, **Then** they see a seasonal likelihood classification for relevant hazards (e.g., precipitation deficit/surplus) for the selected region.
2. **Given** a 3-month outlook is displayed, **When** the admin views it, **Then** the panel clearly states the outlook is probabilistic guidance for planning purposes, not a prediction of specific events.

### Edge Cases

- What happens when the forecast data source for a horizon is unavailable or has not been ingested for the admin's country/deployment? The panel MUST show a clear "forecast unavailable" state per horizon rather than an empty or misleading chart.
- How does the system handle a region for which no forecast grid cell/coverage exists (e.g., outside the source model's domain)? The panel MUST state that the region is unsupported rather than showing zero/default values.
- What happens when an admin switches horizons mid-view (15 days → 1 month → 3 months)? Each horizon's data, loading state, and "as of" timestamp must be independent and not bleed into another horizon's display.
- How does the system behave for a federated deployment that has not configured/enabled a given horizon's data source? That horizon MUST be clearly marked as not configured for this deployment rather than erroring or silently omitting itself.
- What happens when forecast data exists but is older than its expected refresh cycle (e.g., a GFS cycle missed)? The system MUST surface the data's age/timestamp so admins can judge trust, rather than presenting stale data as current.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST provide a Forecast panel, positioned alongside existing analytics/graphs, that is distinct from the existing current-conditions (nowcast) map layers.
- **FR-002**: The Forecast panel MUST let an admin choose one of three horizons: ~15 days (short-range), ~1 month (medium-range), ~3 months (long-range).
- **FR-003**: The Forecast panel MUST let an admin choose a region to view the forecast for, consistent with how region selection works elsewhere in the product.
- **FR-004**: For the 15-day horizon, the system MUST display deterministic forecast values (wind, precipitation, temperature) broken out by forecast step (e.g., per day), clearly labeled as forecast data.
- **FR-005**: For the 1-month horizon, the system MUST display a probabilistic/anomaly-style outlook (e.g., above/near/below normal) rather than a false-precision deterministic value.
- **FR-006**: For the 3-month horizon, the system MUST display a seasonal probabilistic outlook (e.g., elevated/normal/reduced likelihood of hazard-relevant conditions such as drought or excess precipitation) for the selected region.
- **FR-007**: Each horizon's display MUST show the "as of" / data timestamp of the underlying forecast so admins can judge data freshness.
- **FR-008**: The system MUST clearly and visually distinguish deterministic short-range data from probabilistic medium/long-range outlooks, so admins do not mistake a probability for a precise prediction.
- **FR-009**: The system MUST allow each country-scoped/federated deployment to independently configure (enable, disable, or supply credentials for) each forecast horizon's data source, without requiring changes to a shared/central deployment.
- **FR-010**: When a forecast horizon is not configured or not available for a given deployment or region, the system MUST show an explicit "unavailable"/"not configured" state rather than an empty, zeroed, or misleading display.
- **FR-011**: The Forecast panel's underlying data and access layer MUST be structured so that a future surface (e.g., a main-map-screen summary) can reuse the same forecast data without re-implementing ingestion or region-matching logic. A formal, frozen API/interface contract is not required in this spec; reasonably factored, non-duplicated code is sufficient, with a dedicated interface designed later if/when the carousel spec needs it.
- **FR-012**: The system MUST retain historical forecast snapshots for 90 days per horizon, after which older snapshots may be purged; this supports later forecast-verification/accuracy analysis without unbounded storage growth.

### Key Entities *(include if feature involves data)*

- **Forecast Horizon**: One of the three supported time ranges (short/~15 days, medium/~1 month, long/~3 months); has its own data source, refresh cadence, and presentation style (deterministic vs. probabilistic).
- **Forecast Snapshot**: A single ingested pull of forecast data for a given horizon, region coverage, and "as of" timestamp; distinct from the existing nowcast/current-conditions data.
- **Forecast Value**: A hazard-relevant data point (wind, precipitation, temperature, or a probabilistic/anomaly classification such as drought or excess-precipitation likelihood) tied to a horizon, region, and forecast step.
- **Deployment Forecast Configuration**: Per-country/per-deployment settings indicating which horizons are enabled and how their data sources are configured, consistent with the federated deployment model.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can go from opening the dashboard to viewing a forecast for a chosen region and horizon in under 30 seconds.
- **SC-002**: 100% of forecast displays show a visible data "as of" timestamp, so staleness is always determinable without extra clicks.
- **SC-003**: When a horizon is unavailable for a deployment or region, admins see an explicit unavailable state in 100% of such cases (never a blank or misleadingly-populated panel).
- **SC-004**: Admins can distinguish, without prior training, whether a displayed forecast is a specific deterministic value or a probability/likelihood range (validated via usability review: 90%+ of reviewers correctly identify which is which on first view).
- **SC-005**: Each of the three horizons can be enabled independently per federated deployment with zero changes required to shared/central code or configuration.

## Assumptions

- The existing region-selection UX/data model (used elsewhere in the product, e.g., alert dispatch and current-conditions layers) is reused for forecast region selection rather than introducing a new region concept.
- "Dashboard" refers to the existing analytics/graphs screen already in the product; this spec adds a new panel there and does not redesign the rest of that screen.
- Main-map-screen (slide/carousel) display of forecast summaries is explicitly out of scope for this spec and will be addressed in a separate, later spec; this spec's data/API layer should not preclude that reuse.
- Short-range (15-day) forecasts reuse a deterministic single-model source consistent with the existing nowcast pipeline's model family; medium- and long-range forecasts use a separate, coarser-resolution probabilistic product line, which is an accepted industry pattern (short-range NWP vs. sub-seasonal/seasonal outlook products).
- Forecast horizons are refreshed on a cadence appropriate to their source product (e.g., short-range multiple times daily, medium/long-range less frequently); exact cadences are a planning-phase detail, not a scoping decision.
- Access to the Forecast panel follows the same admin/role permissions already governing dashboard access; no new permission tier is introduced by this spec.
- Where a free/open forecast data source exists for a horizon (e.g., NOAA/NWS GFS, CFSv2), it is preferred over paid alternatives; any paid or API-key-gated data source is treated as a later, per-deployment opt-in decision, not a requirement for this spec's baseline delivery.
