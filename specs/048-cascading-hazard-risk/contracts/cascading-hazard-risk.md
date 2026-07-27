# Contracts: Cascading Hazard Risk

## RPC: `save_cascade_rule(id?, country_code, trigger_hazard_type, min_magnitude?, proximity_exposure_source_name?, proximity_distance_km?, min_vulnerability_score?, secondary_risk_category, recommendation_template, is_active)`

Validates: at least one of `min_magnitude` / `proximity_exposure_source_name`+`proximity_distance_km` /
`min_vulnerability_score` is provided (FR-001's "condition" requirement) — rejects with a clear message
naming which condition fields are missing, not a raw CHECK-constraint error. `id` omitted = create;
`id` provided = update in place (does not affect any `cascading_risk_assessments` rows already produced
by the prior version of this rule, FR-010).

## RPC: `evaluate_cascade_rules(country_code, hazard_type, admin_boundary_code, event_lat, event_lng, magnitude?, source_type, source_event_ref)`

**Request** (real event example):
```json
{
  "country_code": "TR",
  "hazard_type": "earthquake",
  "admin_boundary_code": "Istanbul",
  "event_lat": 41.01,
  "event_lng": 28.98,
  "magnitude": 6.2,
  "source_type": "real_event",
  "source_event_ref": { "table": "earthquake", "id": "usgs-abc123" }
}
```

**Request** (hypothetical scenario example, US3 — "if a M4.7 earthquake happened here today"):
```json
{
  "country_code": "TR",
  "hazard_type": "earthquake",
  "admin_boundary_code": "Van",
  "event_lat": 38.5,
  "event_lng": 43.4,
  "magnitude": 4.7,
  "source_type": "hypothetical_scenario",
  "source_event_ref": { "hazard_scenario_id": "..." }
}
```

**Response shape** — always all three buckets, even when empty (FR-006/FR-007 require the three
outcomes to stay visually/structurally distinct, never collapsed into one):
```json
{
  "triggered": [
    {
      "assessment_id": "...",
      "secondary_risk_category": "secondary_flood_risk",
      "input_values": { "magnitude": 6.2, "distance_km": 8.1 },
      "affected_population": 812345,
      "recommendation_text": "Istanbul: elevated flood risk from a magnitude 6.2 event 8.1km from Basin X. Estimated 812,345 people in the area.",
      "rule_id": "..."
    }
  ],
  "not_evaluable": [
    {
      "rule_id": "...",
      "secondary_risk_category": "building_collapse_risk",
      "missing_prerequisite": "no vulnerability indicators configured for this area"
    }
  ],
  "not_triggered_count": 2
}
```

- `triggered` empty AND `not_evaluable` empty AND `not_triggered_count` is whatever it is → render as
  "no secondary risk triggered" (FR-007).
- `not_evaluable` non-empty → render each with its named missing prerequisite (FR-006) — never silently
  dropped from the response.
- If the country has zero active rules at all for this `hazard_type`/`'any'`, all three fields are
  empty/zero and the frontend renders "no cascade rules configured for this hazard type yet" (a distinct,
  more specific empty state than "rules exist but nothing triggered" — surfaced for admin guidance, not
  required reading for an ordinary viewer).

This is a plain Postgres RPC (`supabase.rpc('evaluate_cascade_rules', {...})`), not an Edge Function
(plan.md Technical Context) — same request/response contract either way from the frontend's perspective.
