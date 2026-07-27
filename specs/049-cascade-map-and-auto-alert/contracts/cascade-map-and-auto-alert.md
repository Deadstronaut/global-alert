# Contracts: Cascade Map Integration & Opt-In Auto-Evaluation

## RPC: `save_country_cascade_setting(country_code, enabled)`

**Request**: `{ "p_country_code": "tr", "p_enabled": true }`

**Response**: the upserted `country_cascade_settings` row. RLS denies the call outright (not a
graceful "false" response) for any role/country combination other than super_admin or that country's own
country_admin — org_admin/viewer never reach this successfully.

## RPC: `acknowledge_cascade_assessment(assessment_id)`

**Request**: `{ "p_assessment_id": "..." }`

**Response**: the updated `cascading_risk_assessments` row (or the already-acknowledged row unchanged, if
called twice — idempotent, not an error).

## RPC: `evaluate_cascade_rules(...)` (existing, spec 048 — unchanged contract)

Same request/response shape as spec 048's `contracts/cascading-hazard-risk.md`. This feature adds no new
parameter to the public-facing contract — `p_triggered_automatically` is internal-only
(`_evaluate_cascade_rules_core`), never exposed to callers of the public `evaluate_cascade_rules` RPC.

## Frontend: `ImpactPanel.vue`'s new "Cascading Risks" section

Given the panel's existing `props.selectedEvent` (`{ type, lat, lng, magnitude, severity, ... }`) and
`effectiveCountryCode`, resolves `admin_boundary_code` via:

```js
const boundaries = await loadRegionBoundaries(effectiveCountryCode.value, 'province')
const boundaryCode = findRegion(selectedEvent.lat, selectedEvent.lng, boundaries, boundaries.nameProperty)
```

- If `boundaryCode` is null (location outside every loaded boundary), the section shows the "cannot
  determine area for this location" state (spec FR-002/US1 acceptance scenario 2) — `CascadingRiskPanel`
  is not mounted at all in this case, rather than mounting it with a guessed value.
- Otherwise mounts the existing `CascadingRiskPanel` with `source-type="real_event"` exactly as
  `RiskScoreDashboard.vue` already does (spec 048 T011), just with `admin-boundary-code` resolved from the
  map selection instead of a typed-in value.

## Frontend: unacknowledged-count indicator

A simple count query (`SELECT count(*) FROM cascading_risk_assessments WHERE triggered_automatically AND
acknowledged_at IS NULL`, scoped by existing RLS to the caller's own country/countries), refreshed the
same way this project's other admin-facing summary counts already refresh (poll on view/mount, no new
real-time channel). Each listed assessment has an "Acknowledge" action calling
`acknowledge_cascade_assessment`.
