# Data Model: Sidebar Hazard-View Layout Rework + Manual Hexagon Resolution Control

## New state

```js
// src/stores/ui.js
const manualHexResolution = ref(null) // null = automatic (existing hexResForZoom behavior)

function setManualHexResolution(value) {
  manualHexResolution.value = value
}
```

Exported alongside the existing `mapMode`/`showHeatmap`/`showHexbins` from `useUIStore`.

## Reused (unmodified) state

```
uiStore.mapMode          // existing — 'normal' | 'hexagon' | 'heatmap', mutual-exclusion untouched
```

## Behavioral contract

```
MapView.vue: refreshCountryHexGridFromSelection()
  gridRes = uiStore.manualHexResolution ?? Math.min(currentHexRes.value, 8)   // was: always automatic
  ...unchanged from here (hexWorker.postMessage FILL_GRID)

MapView.vue: watch(currentHexRes, (newRes) => { ... })
  if uiStore.manualHexResolution != null:
    // zoom-bucket change must NOT override a manual choice (FR-005) — still
    // refresh the world/viewport background mesh (updateHexbins(), unaffected
    // by this feature), just skip the country-grid regeneration sub-block.
  else:
    // unchanged: regenerate country-hex-grid at the new automatic resolution

MapView.vue: NEW watch(() => uiStore.manualHexResolution, (value) => {
  if (value != null && uiStore.mapMode === 'hexagon') refreshCountryHexGridFromSelection()
})
  // Live regeneration while the slider is being dragged and petek is active.
  // If petek is not currently active, the new value is simply stored — it is
  // picked up the next time uiStore.mapMode becomes 'hexagon' (the existing
  // mapMode watcher already calls refreshCountryHexGridFromSelection() on
  // entering 'hexagon' mode, spec 044 Phase 7), satisfying FR-006's
  // persistence-across-toggle requirement with no extra code.

SidebarPanel.vue: durum/ısı toggle (was: 3-button map-mode-selector)
  <button @click="uiStore.mapMode = 'normal'">   // durum
  <button @click="uiStore.mapMode = 'heatmap'">  // ısı

SidebarPanel.vue: NEW standalone petek panel (full width, above Afet Ansiklopedisi nav-link)
  <button @click="uiStore.mapMode = 'hexagon'">  // petek toggle, same mapMode write as before
  <input type="range" v-if="uiStore.mapMode === 'hexagon'"
         :min="MIN_HEX_RES" :max="MAX_HEX_RES"
         @input="uiStore.setManualHexResolution(Number($event.target.value))" />
```

## Key relationships

```
SidebarPanel.vue (durum/ısı toggle + petek panel + slider)
        │  writes
        ▼
uiStore.mapMode, uiStore.manualHexResolution
        │  read
        ▼
MapView.vue (refreshCountryHexGridFromSelection, currentHexRes watcher, new manualHexResolution watcher)
        │  hexWorker FILL_GRID
        ▼
country-hex-grid source  ──►  rendered hex grid for the selected country only
```

World/viewport background mesh (`hex-world-bg` source, `updateViewportGrid`/`updateHexbins`) and
exposure-layer hexagons (`exposure-dataset-*` sources, spec 042/043) are unaffected — neither
reads `uiStore.manualHexResolution`.
