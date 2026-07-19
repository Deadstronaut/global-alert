# Quickstart: Sidebar Hazard-View Layout Rework + Manual Hexagon Resolution Control

## 1. Layout (US1)

1. Open the sidebar (expanded state).
2. Confirm durum and ısı appear as a compact two-option toggle.
3. Confirm petek appears as its own full-width panel, positioned directly above the "🌋 Afet
   Ansiklopedisi" nav-link and matching its width.
4. Select durum, then ısı, then petek in turn — confirm the existing mutual-exclusion behavior is
   unchanged (selecting one hides whichever of the other two was active).

## 2. Manual resolution (US2)

1. Select a country, then select petek — confirm the hex grid renders at today's automatic
   resolution (no visible change yet).
2. Move the resolution slider in the petek panel — confirm the grid re-renders at the new
   resolution.
3. Zoom the map in/out — confirm the manually-set resolution does NOT revert to the automatic
   zoom-based value (FR-005).
4. Switch to durum or ısı, then back to petek — confirm the manually-set resolution is still in
   effect (FR-006), not reset.
5. With no country selected, open the petek panel — confirm the slider is present but has no
   visible effect (FR-007's edge case).

## 3. Resolution range decision (FR-009)

1. During implementation: select Turkey, move the slider to its finest setting (H8 if the H3-H8
   range is used).
2. Confirm the hex grid computes and renders in a reasonable time with no unusable lag.
3. If H7/H8 prove impractical, narrow `MAX_HEX_RES` to 6 and re-verify — record the final decision
   and its rationale in tasks.md.

## 4. Regression check

1. Confirm the exposure-layer panel (population/roads/rivers/WorldPop) is unaffected — still
   filters by selected country (prior-session fix), unrelated to this feature.
2. Confirm the world/viewport background hex mesh (visible when no country is selected) still
   renders at its own automatic resolution, unaffected by the manual override.
