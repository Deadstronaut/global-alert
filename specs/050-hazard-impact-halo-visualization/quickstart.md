# Quickstart: Hazard Impact Halo Visualization

Manual verification steps for US1 + US2 (US3 is out of scope for this pass — see spec.md).

1. Open the map in 2D view, log in as an account that can see Turkey's data.
2. Click any earthquake event (e.g. a real Kahramanmaraş/Gaziantep-area event, already used throughout this project's live tests).
3. **Expect**: a translucent circular halo appears centered on the event, radius matching the same km figure already shown in the Impact Analysis panel's "Yarıçap geçersiz kılma (varsayılan: X km)" field.
4. In the event's info card, find the new **vertical** slider (distinct from the horizontal layer-opacity sliders elsewhere).
5. Drag it to its minimum. **Expect**: the halo fades to fully transparent (no separate toggle needed).
6. Drag it back up. **Expect**: the halo becomes visible again, smoothly, no page reload.
7. Select a different event. **Expect**: the halo moves/resizes to the new event; no leftover circle from the previous one.
8. Deselect the event (close the info card). **Expect**: the halo disappears entirely.
9. Find a Turkey event with several nearby critical-infrastructure points (schools/hospitals/police — already visible on the map when the "Kritik Tesisler (Bina)" layer is toggled on). **Expect**: points closer to the epicenter render visibly more red than points closer to the halo's outer edge.
10. Click a colored critical-infrastructure point's popup. **Expect**: copy explicitly states this is a distance-based estimate, not a confirmed damage assessment (FR-005).
11. Select an event in a country/area with zero critical-infrastructure points nearby. **Expect**: no error, halo still renders, just no colored points inside it.
