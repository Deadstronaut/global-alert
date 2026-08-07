# Quickstart: Forecast Map Display

## Prerequisites

- Spec 055's `forecast_snapshots` table populated (verify: `select count(*) from forecast_snapshots;`
  returns > 0 — it does in the live deployment as of 2026-08-06, 155+ rows across 14 variables).
- `npm run dev` running locally, logged in with a role that can see the map's layer control.

## 1. Open the Forecast row

1. Open the map's flow/layer control (the button that opens `FlowControlPanel.vue`).
2. Confirm a new "Forecast" row is visible, below the existing Overlay row, listing chips for the
   14 forecast variables.
3. Confirm no forecast overlay is shown on the map yet (nothing selected by default).

## 2. Select a variable and step through days

1. Click a forecast variable chip (e.g. "Temperature").
2. Confirm a day slider appears, its range matching however many days that variable actually has
   data for (8 for most variables; fewer for `uv_index` — verify against
   `select variable, count(*) from forecast_snapshots group by variable;`).
3. Confirm the map renders Day 1's overlay by default, with a visible day label (e.g. "Day 1 · Aug
   7") and an "as of" freshness indicator.
4. Drag the slider to a later day. Confirm the map's overlay updates to that day's texture, and
   the previous day's overlay is gone (not stacked).
5. Drag the slider rapidly across several values in quick succession. Confirm the map ends up
   showing the LAST day dragged to, not an earlier one that happened to resolve later
   (research.md §5's race-condition guard).

## 3. No-data day

1. Select `uv_index`.
2. Move the slider to a day beyond its available range is not possible by construction (the
   slider's max is bounded by the real day list) — instead, verify the no-data path by
   temporarily querying a variable/day combination you know is empty (e.g. right after a fresh
   deploy before any ingestion has run) and confirming the panel shows the "no forecast data for
   this day" message rather than a blank map tile or a thrown error.

## 4. Mutual exclusivity with nowcast Overlay

1. With a forecast variable active, click an existing nowcast Overlay chip (e.g. "Overlay: Wind").
2. Confirm the forecast overlay is removed and the nowcast Overlay layer appears in its place —
   never both simultaneously.
3. Reverse: with a nowcast Overlay active, select a forecast variable — confirm the nowcast
   Overlay layer is removed.

## 5. No regression to existing layers

1. With no forecast selection, exercise the existing Animate (Wind/Currents/Waves), Overlay, and
   Height controls exactly as before this feature shipped. Confirm no behavior change (spec
   FR-007/FR-008, SC-004).
