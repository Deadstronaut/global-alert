# Phase 1 Data Model: Data Source Health, State Tracking & Payload Validation

## Entity: `data_sources`

Configuration and current health snapshot for a single polled hazard-data feed.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` default |
| `name` | TEXT NOT NULL | Human-readable, e.g. "USGS Earthquake Feed" |
| `hazard_type` | TEXT NOT NULL | CHECK constrained to the existing supported set: `earthquake, wildfire, flood, drought, food_security` (adding a new value is out of scope per spec Assumptions) |
| `endpoint_url` | TEXT NOT NULL | Opaque endpoint reference (spec: no new protocol defined here) |
| `endpoint_config` | JSONB | Optional extra params (query params, headers) — opaque to this feature |
| `poll_interval_seconds` | INTEGER NOT NULL | Matches existing per-type intervals (60 for earthquake, up to 3600 for drought/food_security) |
| `staleness_threshold_seconds` | INTEGER | Nullable; defaults to `3 × poll_interval_seconds` when null (per spec Assumptions) |
| `down_after_consecutive_failures` | INTEGER NOT NULL DEFAULT 3 | Threshold for `degraded → down` transition (spec Assumptions default) |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | `false` = admin-disabled; polling MUST NOT occur when false |
| `health_state` | TEXT NOT NULL DEFAULT 'healthy' | CHECK IN `('healthy','degraded','down','disabled')` |
| `consecutive_failures` | INTEGER NOT NULL DEFAULT 0 | Reset to 0 on any successful fetch |
| `last_success_at` | TIMESTAMPTZ | Null until first successful fetch |
| `last_attempt_at` | TIMESTAMPTZ | Updated on every attempt, success or failure |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**Validation rules** (from spec FR-001, FR-004–FR-006):
- `hazard_type` must be one of the existing supported types (enforced via CHECK constraint).
- `health_state` must always be `disabled` when `is_active = false`, and never `disabled` when
  `is_active = true` (enforced in application logic in `sourceHealth.ts`, mirrored by a CHECK
  constraint for defense-in-depth: `(is_active = false) = (health_state = 'disabled')`).
- `down_after_consecutive_failures` must be >= 1.

**State transitions** (FR-004–FR-006):

```
        success                success               (admin disables)
   ┌───────────┐          ┌───────────┐          ┌────────────┐
   ▼           │          ▼           │          ▼            │
 healthy ──fail──▶ degraded ──N fails──▶ down            disabled
   ▲                  ▲                   │                   │
   └──────success──────┴───────success────┘                   │
   ▲                                                            │
   └─────────────────────(admin re-enables)────────────────────┘
```
- `healthy → degraded`: most recent attempt failed, OR `now() - last_success_at >
  staleness_threshold_seconds`.
- `degraded → down`: `consecutive_failures >= down_after_consecutive_failures`.
- `degraded|down → healthy`: next attempt succeeds (automatic recovery, per spec Assumptions —
  no manual "clear" action required).
- `* → disabled`: only via explicit admin action (`is_active` set to false); polling stops.
- `disabled → healthy`: only via explicit admin re-enable action; source is treated as unknown
  ("pending first fetch") until its next attempt.

## Entity: `source_state_transitions`

Append-only audit record of every `data_sources.health_state` change.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` default |
| `source_id` | UUID NOT NULL REFERENCES `data_sources(id)` ON DELETE CASCADE | |
| `previous_state` | TEXT NOT NULL | One of the four state values |
| `new_state` | TEXT NOT NULL | One of the four state values |
| `reason` | TEXT NOT NULL | e.g. `"3 consecutive failures"`, `"manually disabled by <profile id>"`, `"fetch succeeded after outage"` |
| `changed_by` | UUID REFERENCES `auth.users(id)` ON DELETE SET NULL | Null for system-driven transitions (e.g., automatic degraded→down) |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**Rules**: No UPDATE or DELETE allowed (RLS policies mirror `audit_log`'s
`no_update_audit`/`no_delete_audit` pattern). Readable by `super_admin` role only (FR-014).

## Entity: `rejected_payloads`

Append-only audit record of every individual record rejected by `validatePayload()`.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` default |
| `source_id` | UUID REFERENCES `data_sources(id)` ON DELETE SET NULL | Nullable — source row may later be removed (FR-003: historical data persists) |
| `hazard_type` | TEXT NOT NULL | Denormalized so history survives source removal |
| `validation_error` | TEXT NOT NULL | Specific failure reason, e.g. `"missing required field: lat"`, `"lat out of range: 137.4"` |
| `record_excerpt` | JSONB NOT NULL | The offending raw record (or a truncated/redacted excerpt sufficient to diagnose — spec Assumptions explicitly does not require unlimited raw retention) |
| `occurred_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**Rules**: No UPDATE or DELETE allowed. Readable by `super_admin` role only (FR-014). Queryable by
`source_id` and/or `occurred_at` range (FR-014).

## Relationships

```
data_sources (1) ──< (many) source_state_transitions
data_sources (1) ──< (many) rejected_payloads   [source_id nullable on source deletion]
```

No changes to the existing `earthquake` / `wildfire` / `flood` / `drought` / `food_security`
event tables, `normalize.ts`'s `NormalizedEvent` shape, or `upsert.ts`'s `upsertEvents()` — this
feature is additive only, per plan.md Constraints.
