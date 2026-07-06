# Quickstart: Backend Ingestion Normalizers Read the Hazard Threshold Registry

Prerequisites: `npm run test` and the Deno/Node test suites passing locally (see `tasks.md` for exact commands);
`hazard_thresholds` table already populated (spec 010's seed data).

## Scenario 1 — Admin's threshold change affects real ingestion (User Story 1, FR-001/SC-001)

1. Via the hazard taxonomy admin screen, change the earthquake hazard type's "high" breakpoint from magnitude 5.5
   to 6.0.
2. Wait for the cache TTL window to elapse (or trigger a fresh Edge Function invocation after that window), then
   trigger an earthquake ingestion (e.g. `fetch-earthquakes`) for a source event with magnitude 5.7.
3. **Expected**: the stored event's severity is `moderate` (5.7 no longer meets the new 6.0 "high" threshold) —
   not `high`, which is what the old hardcoded threshold would have produced.

## Scenario 2 — Uncustomized hazard type is unaffected (FR-003, SC-002)

1. Without changing any threshold, trigger an ingestion for a hazard type that has never been customized (e.g.
   wildfire).
2. **Expected**: the computed severity is identical to the value produced before this feature existed (the
   hardcoded `SEVERITY_FN`/`SEVERITY_MAP` result).

## Scenario 3 — Registry unavailable does not block ingestion (FR-002, SC-003)

1. Simulate a registry fetch failure (e.g. temporarily point the service-role client at invalid credentials, or
   test this at the unit level per `contracts/hazard-thresholds-cache.md` test case 4).
2. Trigger an ingestion.
3. **Expected**: the event is still stored with a computed severity (falling back to the hardcoded map, or to the
   last successfully cached values if any existed) — no thrown error, no dropped event.

## Scenario 4 — Both runtimes stay in sync (FR-005)

1. Repeat Scenario 1's threshold change.
2. Trigger an ingestion through the Node aggregator's polling path (not just the Edge Function path).
3. **Expected**: the same updated severity computation applies — both runtimes reflect the same admin-configured
   threshold, not just one of them.
