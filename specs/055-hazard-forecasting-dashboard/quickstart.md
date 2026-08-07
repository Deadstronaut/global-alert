# Quickstart: Multi-Horizon Hazard Forecasting Dashboard

## Prerequisites

- Local Supabase running (`supabase start`) with migrations applied (`supabase db push`)
- `docker compose build wind-importer` (rebuilds the shared `mhews-wind-importer:latest` image
  after adding `fetch_cfsv2.py`/`forecast_texture.py`/`forecast_outlook.py` and the
  `--forecast-horizon` CLI flag to `main.py`)
- `server/.env` has `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (already required by every other
  importer)

## 1. Validate 15-day (short-range) ingestion

```bash
docker compose run --rm wind-importer --forecast-horizon=15d --once
```

Expected: container fetches the latest GFS cycle's forecast steps (f024...f360), generates one
texture per step per variable, uploads to the `forecast-snapshots` bucket, and inserts one row
per (variable, forecast_step_hours) into `forecast_snapshots`. Verify:

```sql
select variable, forecast_step_hours, valid_at, issued_at from forecast_snapshots
order by issued_at desc, forecast_step_hours asc limit 20;
```

Should show ~8-12 rows per variable, `forecast_step_hours` ascending, `valid_at` spread across the
next ~15 days.

## 2. Validate 1-month / 3-month (medium/long-range) ingestion

```bash
docker compose run --rm wind-importer --forecast-horizon=1mo --once
docker compose run --rm wind-importer --forecast-horizon=3mo --once
```

Expected: one row per (variable, region_code) in `forecast_outlooks` per run, `classification` in
`{below_normal, near_normal, above_normal}`, `issued_at` matching the CFSv2 run used.

```sql
select horizon, variable, region_code, classification, issued_at from forecast_outlooks
order by issued_at desc limit 20;
```

## 3. Validate the dashboard panel

1. `npm run dev`, log in, open the dashboard (overview tab, not an admin sub-tab).
2. Confirm a new "Forecast" card renders in the overview grid alongside the existing earthquake
   charts.
3. Select 15-day horizon + a region with ingested data → confirm a day-by-day
   wind/precip/temperature view renders with a visible "as of <GFS cycle time>" label.
4. Select 1-month horizon → confirm a probabilistic (below/near/above-normal) summary renders,
   visually distinct from the 15-day deterministic view, with an "as of <CFSv2 issuance>" label.
5. Select 3-month horizon → same as above for the seasonal outlook.
6. Pick a horizon with no ingested data yet (or stop its scheduled container) → confirm the panel
   shows an explicit "forecast unavailable" state, never a blank or zeroed chart (FR-010).

## 4. Validate per-deployment disable (FR-009/FR-010)

```bash
# in server/.env
FORECAST_3MO_ENABLED=false
```

```bash
docker compose run --rm wind-importer --forecast-horizon=3mo --once
```

Expected: container exits immediately, no new `forecast_outlooks` row for `horizon=3mo`. Dashboard
panel's 3-month selector shows "not configured for this deployment" (distinct copy from the
generic "unavailable" state, per FR-010).

## 5. Retention check (FR-012)

```sql
select cron.job.jobname, cron.job.schedule from cron.job
where jobname in ('enforce-forecast-snapshot-retention-daily', 'enforce-forecast-outlook-retention-daily');
```

Both jobs should be scheduled; manually invoking `select enforce_forecast_snapshot_retention();`
against synthetic rows older than 90 days should delete them while preserving the latest row per
variable/horizon.
