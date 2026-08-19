# Quickstart: Live Flight Tracking

## Prerequisites

- Supabase local dev stack running (`supabase start`) or a deployed instance with Edge Functions.
- No API key/account needed — OpenSky anonymous tier requires none.

## Validate the backend

```bash
supabase functions serve fetch-live-flights
curl -s http://localhost:54321/functions/v1/fetch-live-flights | jq '.states | length, .stale, .fetchedAt'
```

Expected: a non-negative integer count of airborne aircraft, `stale: false` on a healthy first
call, and a recent `fetchedAt` timestamp. Re-run within 10 minutes and `fetchedAt` should be
identical (proves the server-side cache is working, not re-hitting OpenSky every call).

## Validate the frontend layer

1. `npm run dev`, open the app, land on the default 3D globe view.
2. In the right-side globe layer dock, confirm a new 🛩 icon button is present, off by default
   (matches the other six layers).
3. Click it — aircraft markers should appear on the globe within a few seconds (SC-001).
4. Hover an aircraft marker — a real-data info card should show callsign/origin/altitude, not a
   generic placeholder (FR-006).
5. Wait ~60s — marker positions should visibly shift (SC-002).
6. In the top-left 2x2 quick-access grid (now present on both the 3D globe and the 2D map),
   confirm four equally-sized icons: radar badge, screenshot/download, shelters, flights — and
   that toggling flights here matches the right-side dock's toggle state (FR-009).
7. Click the screenshot/download icon while on the 3D globe — a PNG of the current globe view
   should download (not a blank image — this is the `preserveDrawingBuffer` fix from research.md
   §4).

## Validate graceful degradation

- Temporarily block the edge function's outbound network (or point it at an invalid URL) and
  confirm the globe layer shows a visible "stale/unavailable" state rather than freezing or
  fabricating positions (FR-007, edge case in spec.md).
