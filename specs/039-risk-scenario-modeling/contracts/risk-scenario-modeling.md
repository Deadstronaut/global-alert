# Contracts: Risk & Scenario Modeling

## RPC: `compute_risk_area_score(country_code, admin_boundary_code)`

Reads the four factor RPCs/lookups, combines them per the documented formula, and either returns a
fresh `risk_area_scores` row or the most recent cached one (caller decides via a `force_recompute`
flag). Returns the four factor scores individually plus the composite — never only the composite
(FR-004).

**Response shape**:
```json
{
  "hazard_score": 6.2,
  "exposure_score": 8.1,
  "vulnerability_score": 5.4,
  "coping_capacity_score": 3.0,
  "composite_score": null,
  "missing_factors": ["coping_capacity"],
  "indicator_config_snapshot": [...]
}
```
`composite_score` is `null` whenever `missing_factors` is non-empty (FR-007) — the frontend MUST render
this as an explicit "insufficient configuration" state, not a zero.

## RPC: `save_risk_indicator(exposure_dataset_id, category, weight, normalize_min, normalize_max)`

Validates: `category` weights within the same country+category sum to 1.0 across all active
indicators (FR-002) before insert/update succeeds; rejects otherwise with the specific indicators and
weights that don't sum, so the admin can fix it without re-deriving which ones are off.

## Edge Function: `simulate-hazard-scenario`

**Request**:
```json
{ "hazard_type": "earthquake", "parameters": { "magnitude": 7.0, "epicenter_lat": 39.9, "epicenter_lng": 32.8 }, "exposure_dataset_ids": ["..."] }
```

**Response (supported hazard_type)**:
```json
{
  "footprint_geojson": { "type": "Polygon", "coordinates": [...] },
  "estimated_impact": [{ "exposure_dataset_id": "...", "total_value": 812345, "feature_count": 214 }],
  "formula_range_warning": false
}
```

**Response (unsupported hazard_type, FR-010)**:
```json
{ "error": "no_formula_available", "hazard_type": "cyclone", "message": "Scenario simulation is not yet available for this hazard type." }
```
HTTP 200 with this error body (not a 4xx/5xx) — this is an expected, documented outcome, not a failure
(same convention as spec 038's "zero valid records ≠ import failure").

## Edge Function: `compute-risk-exceedance-curve`

**Request**: `{ "country_code": "TR", "admin_boundary_code": "Ankara", "hazard_type": "earthquake", "seed": 42 }`

**Response (threshold met, FR-012)**:
```json
{ "curve": [{ "impact_level": 5000, "annual_exceedance_probability": 0.12 }, ...], "historical_record_count": 47, "seed": 42 }
```

**Response (threshold not met, FR-013)**:
```json
{ "error": "insufficient_historical_data", "historical_record_count": 3, "minimum_required": 20 }
```
Same "HTTP 200, documented non-error outcome" convention as above.
