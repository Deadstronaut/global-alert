# Data Model: Backend Ingestion Normalizers Read the Hazard Threshold Registry

No schema changes. This feature only changes how two existing runtimes *read* the already-existing
`hazard_thresholds` table (spec 010). Documented here for reference only.

## Existing Entity (unchanged): `hazard_thresholds`

| Column | Type | Notes |
|---|---|---|
| `hazard_type_code` | TEXT | FK to `hazard_types.code` |
| `metric_name` | TEXT | e.g. "magnitude", "frp", "level", "phase" |
| `unit` | TEXT | display-only |
| `breakpoints` | JSONB | ordered array of `{ min_value: number, severity: string }` |

## New (in-memory only, per-runtime) — Threshold Cache

Not persisted anywhere; exists only for the lifetime of the Edge Function invocation / Node process.

| Field | Type | Notes |
|---|---|---|
| `thresholds` | `Record<hazardTypeCode, Breakpoint[]>` | Last successfully fetched snapshot, keyed by hazard type code |
| `fetchedAt` | `number` (epoch ms) | When `thresholds` was last successfully populated; `0`/unset means never |
| `refreshing` | `boolean` | Guards against launching a second concurrent background refresh while one is in flight |

### Breakpoint (already exists as `hazard_thresholds.breakpoints`' shape)

| Field | Type | Notes |
|---|---|---|
| `min_value` | number | Inclusive lower bound for this severity tier |
| `severity` | string | One of the existing severity levels (`critical`/`high`/`moderate`/`low`/`minimal`) |

## Behavior (both runtimes, identical logic — see contracts/)

1. On each `normalize()` call: if `Date.now() - fetchedAt > TTL_MS` and not already `refreshing`, kick off a
   non-awaited background fetch of `hazard_thresholds` (service-role client) that updates `thresholds`/`fetchedAt`
   on success and leaves the existing cache untouched on failure.
2. Severity computation reads `thresholds[hazardType]` if present (registry has customized this hazard type);
   otherwise falls back to the existing hardcoded `SEVERITY_FN`/`SEVERITY_MAP` entry for that hazard type — exactly
   as today.
3. Nothing in this flow ever throws or blocks; a fetch failure simply leaves the cache (or lack thereof) as it was.
