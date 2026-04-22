# MHEWS — Multi-Hazard Early Warning System
## System Architecture & Data Flow Documentation

**Version:** 1.0  
**Date:** April 2026  
**Classification:** Technical Reference — Partner Distribution

---

## 1. Executive Summary

MHEWS is a real-time global disaster monitoring and early warning platform. The system continuously ingests data from 10+ authoritative international sources, normalizes and deduplicates events, persists them to a cloud database, and delivers live updates to end-users through a responsive web interface.

The architecture is designed for **high availability**, **data fidelity**, and **scalability** — appropriate for integration into national or UN-level emergency management workflows.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES (External)                       │
│  USGS · EMSC · AFAD · Kandilli · GEOFON · GDACS · PTWC · NASA FIRMS │
│  WHO · FEWS NET · ReliefWeb · FAO · RSS Feeds · IoT Sensors          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP REST / WebSocket / RSS
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              CONTAINER 1 — GEWS Aggregator (Node.js)                 │
│                                                                      │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────────┐  │
│  │   Sources   │──▶│  Normalizer  │──▶│     Deduplicator         │  │
│  │  (pollers / │   │  (common     │   │  (proximity + time +     │  │
│  │  listeners) │   │   schema)    │   │   magnitude matching)    │  │
│  └─────────────┘   └──────────────┘   └────────────┬─────────────┘  │
│                                                     │                │
│  ┌──────────────────────────────────────────────────▼─────────────┐  │
│  │              P-Wave Early Warning Engine                        │  │
│  │   M4.0+ earthquakes → S-wave arrival time per city (500km)     │  │
│  └──────────────────────────────────────────────────┬─────────────┘  │
│                                                     │                │
│  ┌──────────────────────────────────────────────────▼─────────────┐  │
│  │                   Supabase Writer (write queue)                 │  │
│  │              Batched UPSERT every 2 seconds                     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  HTTP :8765  GET /health · GET /status  (ops monitoring)             │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ UPSERT (service role key)
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              CONTAINER 2 — Supabase (PostgreSQL + Realtime)          │
│                                                                      │
│  Tables: earthquake · wildfire · flood · drought · food_security     │
│          tsunami · cyclone · volcano · epidemic · disaster           │
│          early_warnings                                              │
│                                                                      │
│  Realtime: INSERT events broadcast to all connected frontend clients │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ REST API + Realtime WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              CONTAINER 3 — Frontend (Vue 3 + Vite / Vercel)          │
│                                                                      │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────────────┐ │
│  │  IndexedDB   │  │  Supabase     │  │   Supabase Realtime       │ │
│  │  Cache       │  │  Delta Fetch  │  │   (live INSERT stream)    │ │
│  │  (instant    │  │  (background, │  │                           │ │
│  │   load)      │  │  since last   │  │                           │ │
│  └──────┬───────┘  │  fetch only)  │  └───────────────────────────┘ │
│         │          └───────────────┘                                 │
│         ▼                                                            │
│  3D Globe View (Three.js)  ·  2D Map View (MapLibre GL)              │
│  Sidebar · Alerts · Stats · Settings · Emergency Popup              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Sources

| Source | Type | Hazard Category | Protocol | Frequency |
|--------|------|----------------|----------|-----------|
| **USGS** (US Geological Survey) | Government | Earthquake | REST/GeoJSON | 1 min |
| **EMSC** (European-Med Seismological Centre) | Scientific | Earthquake | WebSocket | Real-time |
| **AFAD** (Turkish Disaster Authority) | Government | Earthquake | REST | 2 min |
| **Kandilli Observatory** (Boğaziçi Univ.) | Academic | Earthquake | REST | 2 min |
| **GEOFON** (GFZ Potsdam) | Scientific | Earthquake | REST/GeoJSON | 2 min |
| **GDACS** (UN Joint System) | UN/Multi-agency | Multi-hazard (flood, cyclone, volcano, drought) | REST + RSS | 5 min |
| **PTWC** (Pacific Tsunami Warning Center) | NOAA | Tsunami | REST + RSS | Real-time |
| **NASA FIRMS** | NASA | Wildfire | REST/CSV | 15 min |
| **WHO** (World Health Organization) | UN | Epidemic | REST | 1 hr |
| **FEWS NET** (Famine Early Warning) | USAID | Food Security / Drought | REST | 6 hr |
| **ReliefWeb** | OCHA/UN | General Disasters | RSS | 30 min |
| **IoT Sensors** | Configurable | Any | OGC SensorThings | Configurable |

---

## 4. Aggregator Architecture (Container 1)

### 4.1 Startup Sequence

When the aggregator container starts, it performs the following steps in order:

1. **Preflight Check** — Sends HTTP HEAD requests to all 10 source endpoints (6-second timeout each). Results are logged; unreachable sources are marked offline but do not block startup.
2. **Supabase Init** — Establishes the database client using `SUPABASE_SERVICE_ROLE_KEY` (bypasses Row Level Security for write operations).
3. **Source Activation** — All data source pollers/listeners are started in parallel.
4. **HTTP Server** — Binds to port `8765`, exposing `/health` and `/status` endpoints.

### 4.2 Event Processing Pipeline

Every incoming event from any source passes through the same pipeline:

```
Raw Source Data
      │
      ▼
  Normalizer           → Converts to unified DisasterEvent schema
      │                  (id, type, lat, lng, severity, magnitude,
      │                   depth, title, description, time, source,
      │                   sourceUrl, receivedAt)
      ▼
  Deduplicator         → Checks by ID (exact) and by spatial-temporal
      │                  proximity (type-specific radius + time window)
      │                  e.g., earthquakes: 25km radius, 5min window
      ▼
  P-Wave Engine        → For M4.0+ earthquakes: calculates S-wave
      │                  arrival time at all major cities within 500km
      │                  Stores result in early_warnings table
      ▼
  Write Queue          → Batches events, UPSERT to Supabase every 2s
                         (conflict resolution: ignoreDuplicates on id)
```

### 4.3 Severity Classification

Events are automatically assigned a severity level based on source-specific metrics:

| Hazard | Critical | High | Moderate | Low |
|--------|----------|------|----------|-----|
| Earthquake | M ≥ 7.0 | M ≥ 5.5 | M ≥ 4.0 | M ≥ 2.5 |
| Wildfire | FRP ≥ 500 MW | FRP ≥ 200 MW | FRP ≥ 50 MW | FRP ≥ 10 MW |
| Flood | Level ≥ 4 | Level ≥ 3 | Level ≥ 2 | Level ≥ 1 |
| Food Security | IPC Phase ≥ 5 | Phase ≥ 4 | Phase ≥ 3 | Phase ≥ 2 |
| Tsunami | Always Critical | — | — | — |
| Cyclone | Category ≥ 4 | Category ≥ 3 | Category 1–2 | — |
| Epidemic | — | Always High | — | — |

### 4.4 Deduplication Strategy

The system receives the same physical event from multiple independent sources (e.g., a single earthquake reported by both USGS and EMSC). The deduplicator prevents duplicates using two complementary methods:

- **Exact ID match** — Each source's native event ID is stored; if seen again, it is discarded.
- **Spatial-temporal proximity** — Events of the same type that occur within a type-specific geographic radius and time window are treated as the same event, even if IDs differ across sources.

Deduplicator memory is cleared of entries older than 24 hours to prevent unbounded growth.

### 4.5 P-Wave Early Warning Engine

For every earthquake of magnitude ≥ 4.0, the system calculates the estimated time remaining before the destructive S-wave reaches each of 24 major cities within a 500 km radius.

**Physics model:**
- P-wave velocity: 6.0 km/s (used for detection)
- S-wave velocity: 3.5 km/s (destructive wave, used for warning)
- Hypocentral distance accounts for focal depth

**Output stored in `early_warnings` table:**
- Affected cities with distance, P/S arrival times, warning seconds remaining
- Estimated shaking intensity (Modified Mercalli Intensity, MMI)
- Estimated affected population (cities experiencing MMI V+)

---

## 5. Database Schema (Supabase / PostgreSQL)

All event tables share a common column structure:

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Source-assigned unique event ID |
| `type` | text | Hazard type (earthquake, wildfire, etc.) |
| `lat` | float8 | Latitude (WGS84) |
| `lng` | float8 | Longitude (WGS84) |
| `severity` | text | critical / high / moderate / low / minimal |
| `magnitude` | float8 | Source magnitude (richter, FRP, IPC phase, etc.) |
| `depth` | float8 | Depth in km (earthquakes) |
| `title` | text | Short event title |
| `description` | text | Extended description |
| `time` | timestamptz | Event occurrence time (UTC) |
| `source` | text | Source identifier (USGS, EMSC, etc.) |
| `source_url` | text | Direct link to source event page |
| `extra` | jsonb | Source-specific additional fields |
| `received_at` | timestamptz | Time aggregator received the event |

**Supabase Realtime** is enabled on all tables. Any INSERT is immediately broadcast to all connected frontend clients via a persistent WebSocket channel — eliminating polling on the frontend side.

---

## 6. Frontend Architecture (Container 3)

### 6.1 Data Loading Strategy

The frontend uses a three-layer data loading approach designed to provide instant perceived load times:

```
App Start
    │
    ├─ 1. IndexedDB Cache (synchronous-like, <50ms)
    │       └─ If data exists → render immediately, isLoading = false
    │
    ├─ 2. Supabase Delta Fetch (background, non-blocking)
    │       └─ Fetches only events since last fetch timestamp
    │          Writes results back to IndexedDB for next session
    │
    └─ 3. Supabase Realtime Subscription (persistent)
            └─ Listens for new INSERT events on all 9 tables
               Updates store and map in real-time
```

### 6.2 Frontend Technology Stack

| Component | Technology |
|-----------|-----------|
| Framework | Vue 3 (Composition API) |
| State Management | Pinia |
| 3D Globe | Three.js + three-globe |
| 2D Map | MapLibre GL JS |
| Hexbin Density Layer | H3-js (Uber's hexagonal grid, Web Worker) |
| Database Client | Supabase JS v2 |
| Local Cache | IndexedDB (browser-native) |
| Internationalisation | vue-i18n (7 languages: EN, TR, AR, FR, ES, RU, ZH) |
| Build Tool | Vite |

### 6.3 Performance Optimisations

- **Lazy loading** — `GlobeView` (Three.js, ~4MB) and `MapView` (MapLibre, ~1MB) are loaded only when the respective view is activated, not at initial page load.
- **Web Worker** — H3 hexbin density calculations run in a dedicated Web Worker thread, preventing main-thread blocking during map rendering.
- **Debounced map updates** — The map re-renders after a 400ms debounce on data changes, preventing excessive redraws during bulk data ingestion.
- **IndexedDB persistence** — Events are cached locally; subsequent page loads render without a loading screen.
- **Delta fetching** — Only events created since the last fetch are downloaded, not the full dataset on every session.

---

## 7. Deployment Architecture

### 7.1 Production Environment

```
┌─────────────────────────────────────────────────────────┐
│                     VPS / Cloud VM                       │
│              (Hetzner CX21 or equivalent)                │
│                                                         │
│  docker-compose.yml                                     │
│  ├── gews-aggregator   (Container 1, port 8765)         │
│  └── nginx             (optional reverse proxy)         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   Supabase Cloud                         │
│          (Container 2 — managed PostgreSQL)              │
│          https://mjvuzbpjyhhiwarjcvlm.supabase.co       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   Vercel / CDN                           │
│          (Container 3 — static frontend build)           │
│          Global edge distribution                        │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Docker Compose (Aggregator + Nginx)

```yaml
version: "3.9"
services:
  aggregator:
    build: ./server
    restart: always
    env_file: ./server/.env
    ports:
      - "8765:8765"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8765/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - aggregator
```

### 7.3 Required Environment Variables

**Aggregator (`server/.env`):**

```env
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[service_role_key]
HTTP_PORT=8765
NASA_FIRMS_KEY=[nasa_api_key]           # optional — wildfire data
SENSOR_URL=                             # optional — custom IoT endpoint
```

**Frontend (`.env.production`):**

```env
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon_key]
VITE_AGGREGATOR_URL=https://[aggregator_domain]
```

### 7.4 Health Monitoring

The aggregator exposes two HTTP endpoints for operational monitoring:

| Endpoint | Response |
|----------|----------|
| `GET /health` | `{ "status": "ok", "db": true }` — used by Docker HEALTHCHECK |
| `GET /status` | `{ "status": "ok", "db": true, "storeSize": 1240, "sources": { "USGS": true, "EMSC": false, ... }, "uptime": 3600 }` — used by frontend Settings panel |

---

## 8. Security Considerations

- **Service Role Key** is used exclusively on the aggregator (server-side). The frontend only holds the `anon` key, which respects Row Level Security policies.
- **CORS** on the aggregator HTTP server is restricted to `GET` and `OPTIONS` methods; no write endpoints are exposed publicly.
- **No direct database writes from frontend** — all data flows through the aggregator, ensuring data validation and deduplication occur server-side.
- **No sensitive keys in frontend build** — `VITE_` prefixed variables are build-time substitutions; only the anon key (public by design in Supabase) is embedded.

---

## 9. Data Quality & Integrity

| Mechanism | Purpose |
|-----------|---------|
| Normalizer | Enforces unified schema; truncates oversized strings; validates coordinates |
| Deduplicator | Eliminates cross-source duplicates; type-specific spatial and temporal thresholds |
| `upsert` with `ignoreDuplicates` | Idempotent DB writes; safe for retry on network failure |
| UPSERT conflict on `id` | Prevents duplicate rows in the event of aggregator restart |
| IndexedDB MAX_PER_TYPE limits | Prevents unbounded browser storage growth |
| Aggregator MAX_EVENTS limits | Caps in-memory store per event type |

---

## 10. Supported Languages

The frontend interface is fully localised in 7 languages, with right-to-left support for Arabic:

English · Turkish · Arabic (RTL) · French · Spanish · Russian · Chinese

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **GEWS** | Global Early Warning System — the aggregator component codename |
| **MHEWS** | Multi-Hazard Early Warning System — the overall platform |
| **FRP** | Fire Radiative Power — NASA FIRMS wildfire intensity metric (megawatts) |
| **IPC Phase** | Integrated Food Security Phase Classification — 1 (minimal) to 5 (famine) |
| **MMI** | Modified Mercalli Intensity — earthquake shaking scale I–XII |
| **P-wave** | Primary (compressional) seismic wave, arrives first, non-destructive |
| **S-wave** | Secondary (shear) seismic wave, arrives later, causes structural damage |
| **Hypocentral distance** | 3D distance from earthquake focus accounting for focal depth |
| **Supabase Realtime** | PostgreSQL-backed event broadcast; subscribers receive live INSERT notifications |
| **H3** | Uber's hexagonal hierarchical geospatial indexing system, used for density visualisation |

---

*This document describes the system as implemented. For questions regarding data source agreements, API key provisioning, or deployment assistance, contact the MHEWS development team.*
