# Phase 1 Data Model: Multi-Horizon Hazard Forecasting Dashboard

Two new tables, sibling to `flow_snapshots`/`overlay_snapshots` (see
`supabase/migrations/20260805090000_flow_snapshots.sql` and
`supabase/migrations/20260805120000_overlay_snapshots.sql` for the established shape/RLS/audit
convention this follows).

## ForecastSnapshot (`forecast_snapshots`)

Short-range (15-day), deterministic, raster/texture-backed — one row per (variable, region grid,
forecast step) per GFS cycle. Mirrors `overlay_snapshots`' texture-storage shape since this, like
the air-quality overlay, is a continuous scalar field rendered as a pre-colored PNG, not a vector
field needing `flow_snapshots`' u/v decode-range columns.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `variable` | TEXT | `wind_speed` \| `precipitation` \| `temperature` — CHECK constraint, extensible list |
| `forecast_step_hours` | INTEGER | Hours from cycle issuance (e.g. 24, 72, 120, ..., 360) — the "which day of the 15" axis |
| `valid_at` | TIMESTAMPTZ | `issued_at + forecast_step_hours` — the actual date/time this forecast step is *for* |
| `issued_at` | TIMESTAMPTZ | GFS cycle issuance time — this row's "as of" basis (FR-007) |
| `imported_at` | TIMESTAMPTZ | DEFAULT NOW() — when this deployment's container ingested it |
| `texture_storage_path` | TEXT | Supabase Storage path in `forecast-snapshots` bucket |
| `value_min` / `value_max` | DOUBLE PRECISION | Decode range for the texture, same convention as `overlay_snapshots` |
| `bounds` | DOUBLE PRECISION[4] | `[west, south, east, north]` |
| `source_name` | TEXT | `"NOAA GFS"` |

Indexes: `(variable, valid_at)` for "what's the forecast for day N" lookups;
`(variable, issued_at DESC)` for "what's the latest cycle" lookups (same pattern as
`idx_overlay_snapshots_type_issued_at`).

RLS: public read (non-sensitive weather data, same as `flow_snapshots`/`overlay_snapshots`),
service-role-only write. Audit trigger on INSERT/UPDATE/DELETE (Constitution Principle V).

Retention (FR-012): 90 days, always keeping at least the latest cycle's full step set per
variable (never zero out a variable just because ingestion has been down) — same shape as
`enforce_overlay_snapshot_retention()` but with a 90-day window instead of 7, since this is
lower-cadence forecast data intended to support later verification analysis, not disposable
nowcast cache.

## ForecastOutlook (`forecast_outlooks`)

Medium/long-range (1-month, 3-month), probabilistic, tabular — one row per (horizon, variable,
region, issuance). No texture/raster; a discrete classification per region is sufficient (FR-005,
FR-006) and matches CFSv2's coarser, region-aggregate-appropriate resolution (research.md §3).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `horizon` | TEXT | `1mo` \| `3mo` — CHECK constraint |
| `variable` | TEXT | `precipitation` \| `temperature` — CHECK constraint |
| `region_code` | TEXT | Matches the existing free-text region convention (`contacts.region_code`, CAP `region_code`) |
| `classification` | TEXT | `below_normal` \| `near_normal` \| `above_normal` — CHECK constraint (research.md §3) |
| `confidence` | DOUBLE PRECISION | 0.0-1.0; reserved for a future percentage-probability upgrade (research.md §3), nullable for now |
| `valid_period_start` / `valid_period_end` | DATE | The month(s)/season this outlook covers |
| `issued_at` | TIMESTAMPTZ | CFSv2 run issuance time — this row's "as of" basis (FR-007) |
| `imported_at` | TIMESTAMPTZ | DEFAULT NOW() |
| `source_name` | TEXT | `"NOAA CFSv2"` |

Indexes: `(horizon, region_code, variable, issued_at DESC)` — the panel's primary lookup shape
("latest outlook for this horizon+region+variable").

RLS: public read, service-role-only write, audit trigger — same as above.

Retention (FR-012): 90 days per `(horizon, region_code, variable)` combination, always keeping the
latest.

## Deployment Forecast Configuration

Not a new database table (research.md §5) — represented by three environment variables
(`FORECAST_15D_ENABLED`, `FORECAST_1MO_ENABLED`, `FORECAST_3MO_ENABLED`) read by each importer
container from `server/.env`, consistent with every other importer's per-deployment `env_file`
configuration. The frontend infers per-horizon availability from data freshness/presence, not
from a separate config flag it would have to keep in sync.

## Relationships

- `forecast_snapshots` and `forecast_outlooks` are independent of each other and of
  `flow_snapshots`/`overlay_snapshots` — no foreign keys, same "sibling table" pattern as the
  existing snapshot tables, since these are append-only time-series ingestion outputs, not
  relational entities tied to `DisasterEvent`/hazard records.
- `region_code` is a soft reference (free text, no FK) to the same informal region concept used by
  `contacts.region_code` and CAP dispatch targeting — consistent with, not a new, region model
  (research.md §6).
