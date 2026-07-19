# Contract: `get_dataset_features_geojson` (Postgres RPC)

**Type**: Supabase RPC (Postgres `SQL STABLE` function), called via `supabase.rpc(...)` from the
frontend. Not an Edge Function — no separate deployment step, ships as part of a migration.

## Request

```ts
supabase.rpc('get_dataset_features_geojson', {
  dataset_id: string,              // required, UUID of an exposure_datasets row
  simplify_tolerance?: number,     // optional, in the geometry's coordinate units (degrees, since
                                    // geom is SRID 4326); omit or null for full precision
})
```

## Response

**Note**: this function `RETURNS JSONB` (a single `jsonb_agg(...)` array), not `SETOF`/`TABLE` —
switched after a live finding that PostgREST's default 1000-row cap truncates
`TABLE`-returning functions (research.md §2 addendum). The array shape below is identical either
way; only the underlying mechanism (and the absence of a row limit) differs.

Array of objects:

```json
[
  {
    "id": "5b1f...-uuid",
    "geom_geojson": "{\"type\":\"LineString\",\"coordinates\":[[27.1,38.5],[27.2,38.6]]}",
    "metric_value": 1250.4,
    "properties": { "highway": "motorway", "name": "O-4", "osmId": 123456789 }
  }
]
```

- `geom_geojson` is a JSON **string** (from `ST_AsGeoJSON`), not a nested object — the caller must
  `JSON.parse()` each row's `geom_geojson` before assembling a `FeatureCollection`. This matches
  `get_intersecting_features`'s existing, already-consumed shape exactly (no new parsing
  convention introduced).
- Empty dataset (zero features) → empty array `[]`, not an error — the caller renders this as "no
  features to show" for that layer, not a failure state.
- Unknown/inaccessible `dataset_id` (RLS denies or row doesn't exist) → empty array `[]` (RLS
  filters rows, it does not raise), same as every other RLS-scoped query in this codebase.

## Error cases

- Malformed `dataset_id` (not a valid UUID): PostgREST returns a 400-level error from the standard
  Postgres type-cast failure — the frontend call site MUST catch this and treat it as a
  render-skip for that layer (do not crash the whole map), matching the WFS layer's existing
  "silent render failure" convention (`MapView.vue`'s `addWfsLayer`, per its own code comment).

## Non-goals

- No pagination — a single call returns the full dataset. If a future dataset proves too large for
  this (see research.md §2's simplification mitigation and the deferred vector-tile alternative),
  that is a follow-up decision, not part of this contract's MVP scope.
- No write/mutation capability — this function is `STABLE`, read-only, by design (FR-009).
