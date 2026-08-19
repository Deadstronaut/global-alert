# Contract: `GET /functions/v1/fetch-live-flights`

New Supabase Edge Function. Mirrors the existing `fetch-*` edge functions' CORS/response
envelope conventions (see `supabase/functions/fetch-food-security/index.ts`) minus the
`hazard_events` upsert step — this endpoint returns live data directly, it does not persist it.

## Request

No parameters required. (Bounding-box narrowing via `lamin`/`lomin`/`lamax`/`lomax` query
params may be added later if needed — not required for this increment, see research.md §1.)

## Response `200 OK`

```json
{
  "fetchedAt": "2026-08-19T21:40:00.000Z",
  "stale": false,
  "states": [
    {
      "icao24": "4b1234",
      "callsign": "THY123",
      "originCountry": "Turkey",
      "lat": 41.02,
      "lng": 28.97,
      "altitudeM": 10972,
      "velocityMs": 245.1,
      "headingDeg": 87.3,
      "onGround": false
    }
  ]
}
```

- `states` excludes any aircraft with `onGround: true` or a null position — the frontend never
  has to filter these itself.
- `stale: true` means OpenSky could not be reached on the last scheduled refresh and this is the
  previous successful snapshot being served instead (FR-007) — frontend MUST surface this
  (e.g. dim/label the layer) rather than presenting it as fresh.

## Response `200 OK` — no data available

```json
{ "fetchedAt": "2026-08-19T21:40:00.000Z", "stale": true, "states": [] }
```

Empty `states` with `stale: true` on first-ever failed fetch (no prior cache to fall back to).
Not an error status — the frontend layer simply shows nothing, with the stale indicator on.

## Caching contract (server-side)

- Upstream OpenSky call happens at most once per 10 minutes, process-wide (in-memory cache keyed
  by nothing, since there's only one global query) — see research.md §1 for the credit-budget
  reasoning.
- Every request to this function within the cache window returns the cached snapshot
  immediately; no per-request upstream call.
