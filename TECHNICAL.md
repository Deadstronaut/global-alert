# GEWS — Technical Documentation

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Flow](#2-data-flow)
3. [Supabase Edge Functions](#3-supabase-edge-functions)
4. [Data Model: DisasterEvent](#4-data-model-disasterevent)
5. [Pinia Stores](#5-pinia-stores)
6. [Visualization Layers](#6-visualization-layers)
7. [Geolocation & Proximity Threat Calculation](#7-geolocation--proximity-threat-calculation)
8. [Offline Caching](#8-offline-caching)
9. [Notifications](#9-notifications)
10. [Accessibility & Theme System](#10-accessibility--theme-system)
11. [Internationalization (i18n)](#11-internationalization-i18n)
12. [Mobile (Capacitor)](#12-mobile-capacitor)
13. [Performance Decisions](#13-performance-decisions)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                BROWSER / APP                    │
│                                                  │
│  Vue 3 + Vite                                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │GlobeView │  │ MapView  │  │ SidebarPanel  │  │
│  │(globe.gl)│  │(Leaflet) │  │ AlertPanel    │  │
│  └────┬─────┘  └────┬─────┘  │ SettingsPanel │  │
│       │              │        └───────────────┘  │
│  ┌────▼──────────────▼──────────────────────┐    │
│  │              Pinia Stores                │    │
│  │  disasterStore | uiStore | geoStore      │    │
│  └────────────────────┬─────────────────────┘    │
│                       │                          │
│  ┌────────────────────▼─────────────────────┐    │
│  │           disasterService.js             │    │
│  │  (Axios → Supabase Edge Functions)       │    │
│  └────────────────────┬─────────────────────┘    │
└───────────────────────┼──────────────────────────┘
                        │ HTTPS
┌───────────────────────▼──────────────────────────┐
│               SUPABASE                           │
│  ┌─────────────────┐   ┌──────────────────────┐  │
│  │  Edge Functions │   │   PostgreSQL DB       │  │
│  │  (Deno / TS)    │──▶│  earthquake_events   │  │
│  │  fetch-*        │   │  wildfire_events     │  │
│  └────────┬────────┘   │  flood_events        │  │
│           │            │  drought_events      │  │
└───────────┼────────────┴──────────────────────┘──┘
            │ HTTPS
┌───────────▼────────────────────────────────────┐
│              EXTERNAL APIs                      │
│  USGS │ Kandilli │ AFAD │ NASA FIRMS            │
│  OpenWeather │ ReliefWeb │ USDM │ UN Food       │
└────────────────────────────────────────────────┘
```

---

## 2. Data Flow

### 2.1 Initial Load

```
App.vue: onMounted()
  → disasterStore.loadFromCache()       // instantly show localStorage data
  → disasterStore.fetchAll()            // fetch all sources in parallel
  → disasterStore.startPolling()        // start periodic updates
  → geolocationStore.requestLocation()  // request location permission
```

### 2.2 Polling Loop

Each disaster type runs an independent `setInterval`:

| Type | Interval |
|---|---|
| earthquake | 60,000 ms |
| flood | 300,000 ms |
| wildfire | 900,000 ms |
| drought | 3,600,000 ms |
| food_security | 3,600,000 ms |

### 2.3 Filtered Data Pipeline

```
disasterStore.allEvents (computed getter)
  ← raw events from all types
  ← activeLayers filter  (which types are enabled)
  ← severityFilter       (which severity levels are visible)
  ← timeRange filter     (start / end timestamp)
  → passed reactively as prop to GlobeView and MapView
```

---

## 3. Supabase Edge Functions

Every function follows the same structure:

```typescript
// Example: fetch-earthquakes/index.ts
Deno.serve(async (req) => {
  // 1. Parallel fetch from all sources
  const [usgs, kandilli, afad] = await Promise.allSettled([...])

  // 2. Normalize → convert to DisasterEvent format
  const events = normalize(usgs) + normalize(kandilli) + normalize(afad)

  // 3. Deduplication (20 km + 5-minute window)
  const unique = deduplicate(events)

  // 4. Upsert into Supabase DB
  await supabase.from('earthquake_events').upsert(unique)

  // 5. Return JSON
  return new Response(JSON.stringify(unique), { headers: corsHeaders })
})
```

### Deduplication Logic

Two events are considered **duplicates** when both conditions are met:
- Distance between them < threshold (varies by type)
- Time difference < 5 minutes

| Type | Distance Threshold |
|---|---|
| Earthquake | 20 km |
| Wildfire | 5 km |
| Flood | 20 km |
| Drought | 20 km |
| Food Security | 50 km |

### Severity Mapping (Earthquake Example)

| Magnitude | Severity |
|---|---|
| ≥ 7.0 | critical |
| ≥ 6.0 | high |
| ≥ 5.0 | moderate |
| ≥ 4.0 | low |
| < 4.0 | minimal |

---

## 4. Data Model: DisasterEvent

`src/services/adapters/DisasterEvent.js` — shared wrapper for all disaster types:

```javascript
class DisasterEvent {
  constructor({
    id, type, lat, lng, severity,
    magnitude, title, description,
    time, source, sourceUrl, raw, extra
  })

  // Computed getters
  get color()    // returns CSS custom property (--color-critical, etc.)
  get icon()     // returns emoji: ⛰️ 🔥 🌊 🔴 🌾

  // Haversine distance in km
  distanceTo(lat, lng) { ... }
}
```

**Type values:** `earthquake` | `wildfire` | `flood` | `drought` | `food_security`

**Severity values:** `critical` | `high` | `moderate` | `low` | `minimal`

---

## 5. Pinia Stores

### 5.1 disasterStore (`src/stores/disaster.js`)

```javascript
state: {
  earthquakes: [],      // DisasterEvent[]
  wildfires: [],
  floods: [],
  droughts: [],
  foodSecurity: [],
  activeLayers: Set,    // which types are visible
  severityFilter: Set,  // which severity levels are visible
  timeRange: { start, end }
}

getters: {
  allEvents,       // filtered combined list
  totalCount,
  criticalEvents
}

actions: {
  fetchAll(),
  fetchByType(type),
  toggleLayer(type),
  toggleSeverity(level),
  loadFromCache(),
  startPolling(),
  stopPolling()
}
```

### 5.2 uiStore (`src/stores/ui.js`)

```javascript
state: {
  viewMode: 'globe' | 'map',
  transitionState: 'idle' | 'transitioning',
  selectedDisaster: DisasterEvent | null,
  sidebarOpen, alertPanelOpen, settingsPanelOpen,
  emergencyPopupOpen,
  darkMode, highContrast, safeMode, colorblindMode,
  showHeatmap, showHexbins
}
```

### 5.3 geolocationStore (`src/stores/geolocation.js`)

```javascript
state: {
  userLat, userLng,
  isTracking,
  permissionStatus: 'granted' | 'denied' | 'prompt',
  nearbyThreats: DisasterEvent[],  // max 20, sorted by distance
  alertRadius: 50                  // km, configurable 10–1000
}
```

---

## 6. Visualization Layers

### 6.1 3D Globe (GlobeView.vue)

**Library:** globe.gl (Three.js wrapper)

Active layers:

| Layer | Description |
|---|---|
| Points | Colored point per event; size proportional to severity |
| Rings | Concentric rings for critical/high events |
| Labels | Labels only for critical events |
| Heatmap | Severity-weighted heat overlay |
| Hexbins | H3 hex cells color-coded by severity |
| User Marker | User location with pulsing animation |

Globe → Map transition: zoom animation to clicked point → `uiStore.transitionToMap()` → Leaflet flies to the same coordinates.

### 6.2 2D Map (MapView.vue)

**Library:** Leaflet 1.9.4

| Layer | Description |
|---|---|
| Tile Layer | CartoDB Dark (dark mode) / CartoDB Light |
| Markers | Emoji icon + severity color; critical events pulse via CSS animation |
| Heatmap | leaflet.heat; gray→green→yellow→orange→red gradient |
| Hexbins | H3 cells rendered on Canvas |
| User Marker | Blue circle with tooltip |

**Zoom limits:** min 1.55 — max 30

Smooth scroll-wheel zoom: `easeOut` animation driven by `requestAnimationFrame`.

---

## 7. Geolocation & Proximity Threat Calculation

### Haversine Formula

```javascript
// DisasterEvent.distanceTo(lat, lng)
const R = 6371 // Earth radius in km
const dLat = toRad(lat2 - lat1)
const dLng = toRad(lng2 - lng1)
const a = sin²(dLat/2) + cos(lat1)·cos(lat2)·sin²(dLng/2)
return R · 2 · atan2(√a, √(1−a))
```

### Nearby Threat Algorithm

```
geolocationStore.calculateNearbyThreats():
  1. Iterate over allEvents
  2. Calculate distanceTo(userLat, userLng) for each event
  3. Filter: distance <= alertRadius
  4. Sort ascending by distance
  5. Take first 20 → write to nearbyThreats
  6. If any critical/high event within alertRadius:
     → emergencyPopupOpen = true
```

---

## 8. Offline Caching

`src/services/offlineCache.js`

```javascript
// Write
localStorage.setItem(`gews_cache_${type}`, JSON.stringify({
  events: events.slice(0, 50),  // max 50 events
  timestamp: Date.now()
}))

// Read (on app startup)
const cached = JSON.parse(localStorage.getItem(`gews_cache_${type}`))
if (cached) store[type] = cached.events
```

Separate key per disaster type: `gews_cache_earthquake`, `gews_cache_wildfire`, etc.

---

## 9. Notifications

`src/services/notificationService.js`

- **Web:** Browser Notification API
- **Native:** Capacitor PushNotifications plugin
  - FCM (Android)
  - APNS (iOS)

Trigger condition: incoming event with severity `critical` or `high` **and** within `alertRadius` km of the user.

---

## 10. Accessibility & Theme System

CSS custom property–based theme system. Classes are applied to the `<html>` element:

| Class | Effect |
|---|---|
| `.dark` | Dark background, light text |
| `.light` | Light background, dark text |
| `.high-contrast` | Sharp colors, bold borders |
| `.colorblind` | Colorblind-safe palette (blue, orange, purple, green, cyan) |
| `.safe-mode` | Globe auto-rotation disabled, animations reduced |

---

## 11. Internationalization (i18n)

`src/i18n/index.js` — vue-i18n

Supported locales: `tr` (default), `en`, `es`, `fr`, `ru`, `ar`, `zh`

Arabic RTL support: when locale changes to `ar`, `document.dir = 'rtl'` is set.

---

## 12. Mobile (Capacitor)

`capacitor.config.json`:

```json
{
  "appId": "com.gews.app",
  "appName": "GEWS - Erken Uyarı",
  "webDir": "dist",
  "plugins": {
    "Geolocation": { "permissions": ["location"] },
    "PushNotifications": {}
  }
}
```

Platform detection for geolocation:

```javascript
import { Capacitor } from '@capacitor/core'
if (Capacitor.isNativePlatform()) {
  // Capacitor Geolocation.getCurrentPosition()
} else {
  // navigator.geolocation.getCurrentPosition()
}
```

---

## 13. Performance Decisions

| Decision | Rationale |
|---|---|
| Max 50 events cached per type | Avoids exceeding localStorage size limits |
| Max 20 nearby threats displayed | Keeps the alert list readable |
| Independent polling per type | Critical types (earthquake) update more frequently |
| Canvas rendering for hexbins | Much faster than SVG for large numbers of cells |
| requestAnimationFrame zoom | Synced with browser refresh cycle, no jank |
| Heatmap weight = severity score | Visual density reflects actual threat intensity |
| Globe texture selected by device | Low-resolution texture on low-power devices |
