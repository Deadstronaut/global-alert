# Phase 1 Data Model: Live Flight & Ship Tracking

No persisted database entities — this feature is intentionally stateless/ephemeral (see plan.md
Storage: N/A). The only "model" is the shape of data passed between the edge function and the
frontend, and the frontend's own transient display state.

## AircraftState (in-memory / wire shape only)

Sourced verbatim (subset) from OpenSky's `/states/all` response, one per currently-in-flight
aircraft. Not stored; held only in the edge function's short-lived cache and the frontend's
reactive layer data for as long as the flights layer is on.

| Field | Type | Notes |
|---|---|---|
| `icao24` | string | Unique transponder address — used as the stable id for hover/dedup |
| `callsign` | string \| null | Flight callsign, trimmed; null if not broadcast |
| `originCountry` | string | Country of aircraft registration |
| `lat` | number \| null | Null if position not currently available — such aircraft are filtered out before reaching the frontend (nothing to plot) |
| `lng` | number \| null | Same as above |
| `altitudeM` | number \| null | Barometric altitude, meters |
| `velocityMs` | number \| null | Ground speed, m/s |
| `headingDeg` | number \| null | True track, degrees |
| `onGround` | boolean | Excluded from the globe layer when true (only in-flight aircraft are shown, per spec) |

## FlightsLayerResponse (edge function → frontend contract)

| Field | Type | Notes |
|---|---|---|
| `fetchedAt` | ISO 8601 string | When the edge function last successfully refreshed from OpenSky — frontend uses this to compute staleness (FR-007) |
| `states` | AircraftState[] | Filtered to airborne aircraft with a known position |
| `stale` | boolean | True if the last upstream refresh attempt failed and this is a previously-cached snapshot being served as a fallback |

## Frontend display state (GlobeView.vue local reactivity)

| State | Type | Default | Notes |
|---|---|---|---|
| `showFlights` (ui.js) | boolean | `false` | Mirrors the other six layer toggles' pattern; also drivable from the new top-left quick-access grid (spec FR-009 — same state, second entry point) |
| flight poll timer | interval | 60s | Frontend → edge function only; does not itself consume OpenSky credits (see research.md §1) |

No relationships, no state transitions beyond "layer on/off" and "data fresh/stale" — this is
the simplest possible shape that satisfies the spec's acceptance criteria.
