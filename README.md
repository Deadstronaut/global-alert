# Global Alert — GEWS (Global Early Warning System)

A real-time global disaster monitoring and early warning application. Aggregates earthquakes, wildfires, floods, droughts, and food security crises into a single interactive interface.

---

## Features

- **Multi-Hazard Tracking** — Earthquakes, wildfires, floods, droughts, food security
- **3D Globe & 2D Map** — Switch between an interactive globe (globe.gl) and a Leaflet map
- **Real-Time Data** — Automatic updates from multiple sources (1 min – 1 hr intervals)
- **Proximity Alerts** — Distance-based threat detection with emergency popup notifications
- **Offline Support** — localStorage cache displays last known data without internet
- **Accessibility** — Dark/light mode, high contrast, colorblind mode, safe mode
- **Multi-Language** — Turkish, English, Spanish, French, Russian, Arabic, Chinese
- **Mobile App** — iOS/Android support via Capacitor

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 (Composition API), Vite |
| State Management | Pinia |
| Routing | Vue Router |
| 3D Visualization | globe.gl (Three.js based) |
| 2D Map | Leaflet 1.9.4 + leaflet.heat |
| Hexbin | h3-js (H3 hierarchical spatial indexing) |
| Backend | Supabase (PostgreSQL + Edge Functions) |
| Edge Runtime | Deno (TypeScript) |
| Mobile | Capacitor (iOS / Android) |
| HTTP | Axios |
| i18n | vue-i18n |

---

## Data Sources

| Disaster Type | Sources | Update Frequency |
|---|---|---|
| Earthquake | USGS, Kandilli, AFAD | 1 minute |
| Flood | OpenWeather API, ReliefWeb | 5 minutes |
| Wildfire | NASA FIRMS | 15 minutes |
| Drought | USDM (US Drought Monitor) | 1 hour |
| Food Security | UN Food Security | 1 hour |

---

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Required Environment Variables

```env
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

---

## Project Structure

```
global-alert/
├── src/
│   ├── App.vue                      # Root component
│   ├── main.js                      # Application entry point
│   ├── views/
│   │   └── HomeView.vue             # Main page (globe + map)
│   ├── components/
│   │   ├── GlobeView.vue            # 3D globe component
│   │   ├── MapView.vue              # 2D Leaflet map
│   │   ├── SidebarPanel.vue         # Filter and layer panel
│   │   ├── AlertPanel.vue           # Nearby threat list
│   │   ├── SettingsPanel.vue        # Display and accessibility settings
│   │   ├── EmergencyPopup.vue       # Critical alert modal
│   │   ├── StatsOverlay.vue         # Live event counters
│   │   └── LoadingScreen.vue        # Splash screen
│   ├── stores/
│   │   ├── disaster.js              # Disaster data (Pinia)
│   │   ├── geolocation.js           # Location and nearby threats
│   │   └── ui.js                    # UI state
│   ├── services/
│   │   ├── api/
│   │   │   ├── disasterService.js   # API calls
│   │   │   └── config.js            # API endpoints
│   │   ├── adapters/
│   │   │   └── DisasterEvent.js     # Unified data model
│   │   ├── offlineCache.js          # localStorage caching
│   │   └── notificationService.js   # Push notification management
│   ├── i18n/                        # Language files (7 languages)
│   └── router/
│       └── index.js                 # Page routing
└── supabase/
    └── functions/
        ├── fetch-earthquakes/       # Earthquake data aggregation
        ├── fetch-wildfires/         # Wildfire data aggregation
        ├── fetch-floods/            # Flood data aggregation
        ├── fetch-droughts/          # Drought data aggregation
        ├── fetch-food-security/     # Food security data
        ├── fetch-historical-events/ # Historical data queries
        └── shared/
            └── cors.ts              # CORS configuration
```

---

## Severity Levels

| Level | Color | Earthquake Equivalent |
|---|---|---|
| critical | Red | ≥ 7.0 |
| high | Orange | ≥ 6.0 |
| moderate | Yellow | ≥ 5.0 |
| low | Green | ≥ 4.0 |
| minimal | Gray | < 4.0 |

---

## License

MIT
