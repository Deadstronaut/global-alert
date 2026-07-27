# MHEWS — Deployment and Operations Guide (How To Use)

This document provides a complete, step-by-step guide for deploying and
operating the MHEWS (Multi-Hazard Early Warning System) platform. It
assumes no prior familiarity with the system.

## 1. System Components

```
┌─────────────┐      ┌──────────────────┐      ┌───────────────────────┐
│  FRONTEND   │      │    AGGREGATOR     │      │          DB           │
│  (Vue, static│ ──▶ │  (Node.js, ws:8765)│ ──▶ │  Supabase (Postgres)  │
│  build, nginx)│     │  Docker container  │      │  Cloud or self-hosted │
└─────────────┘      └──────────────────┘      │  via Supabase CLI     │
                                                  └───────────────────────┘
```

- **Frontend** — the map/interface presented to the end user in a browser.
  It consists of a statically compiled build (the `dist/` directory),
  served by an nginx container.
- **Aggregator** — a Node.js service that runs continuously in the
  background. It retrieves data from external sources (NASA FIRMS, GDACS,
  and others), processes it, broadcasts it to the frontend in real time via
  WebSocket, and writes it to the Supabase database.
- **Database** — a PostgreSQL database. In this project it is managed via
  the **Supabase CLI**; the operator does not provision or maintain a
  standalone Postgres container manually. Supabase's official tooling
  provisions the full stack, including authentication, realtime, and
  storage.

The operational flow is as follows:
1. A user navigates to the address assigned to the server (domain or IP) in
   a browser → the **frontend** loads.
2. The **aggregator** container, running continuously under Docker,
   collects data in the background.
3. Collected data is written to **PostgreSQL tables**.
4. The frontend is supplied both directly from Supabase (REST/Realtime) and
   from the aggregator's WebSocket broadcast, producing a live view for the
   user.

---

## 2. Prerequisites (One-Time Setup)

| Tool | Purpose | Verification command |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Runs the containers | `docker --version` |
| [Node.js 22+](https://nodejs.org/) | Builds the frontend | `node --version` |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | Manages the database | `supabase --version` |
| Git | Retrieves the source code | `git --version` |

Installing the Supabase CLI (Windows, PowerShell):
```powershell
scoop install supabase
```
or via npm:
```powershell
npm install -g supabase
```

---

## 3. Deployment Scenarios: Cloud or Self-Hosted

The database layer may be provisioned in one of two ways. The choice
affects only two lines in `server/.env`; every other component remains
identical.

### Scenario A — Supabase Cloud (recommended)

The database is not hosted on the operator's own server; Supabase's
managed cloud service is used instead. Maintenance, backups, and updates
are handled by Supabase.

1. Create a free account at https://supabase.com and provision a new
   project.
2. From the project dashboard, under **Settings → API**, copy:
   - the `Project URL` (e.g. `https://xxxxx.supabase.co`)
   - the `service_role` key (⚠️ **not** the `anon` key — the server
     component requires the service_role key)
3. These values will be entered into `server/.env` in Step 5, below.
4. Apply the database migrations to the cloud project:
   ```powershell
   supabase link --project-ref xxxxx
   supabase db push
   ```

### Scenario B — Self-Hosted (on the operator's own server, via Supabase CLI)

This scenario applies where an operator requires a fully independent
deployment on their own infrastructure. The Supabase CLI provisions its own
Postgres + Auth + Realtime + Studio stack via Docker automatically; no
manual database setup is required.

1. On the target server, navigate to the project directory (this
   repository).
2. Start the local Supabase stack:
   ```powershell
   supabase start
   ```
   On first run, this command downloads the required Docker images (which
   may take several minutes) and, upon completion, prints output similar
   to the following:
   ```
   API URL: http://127.0.0.1:54321
   DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
   anon key: eyJ...
   service_role key: eyJ...
   Studio URL: http://127.0.0.1:54323
   ```
   **Record this URL and these keys** — they are required for
   `server/.env` in Step 5.
3. The migrations located in `supabase/migrations` are applied
   automatically by `supabase start`. To apply newly added migrations:
   ```powershell
   supabase db push
   ```
4. To visually confirm the database is operating correctly, open
   `http://127.0.0.1:54323` (Studio) in a browser — tables can be inspected
   there directly.

> **Note.** `supabase start` remains running continuously in the
> background as a set of Docker containers. After a server restart, simply
> run `supabase start` again; data persists in a Docker volume across
> restarts.

---

## 4. Building the Frontend

```powershell
npm install
npm run build
```

This command produces the `dist/` directory, which `docker-compose.yml`
mounts into the nginx container. Prior to building, the frontend's
connection to Supabase must be configured in the `.env` file at the
project root:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co        # or http://127.0.0.1:54321 (self-hosted)
VITE_SUPABASE_ANON_KEY=eyJ...                       # the anon key — NOT the service_role key
```

---

## 5. Configuring the Aggregator (`server/.env`)

```powershell
cd server
cp .env.example .env
```

Open `.env` and populate the following fields:

```
WS_PORT=8765

# Scenario A (Cloud): use the cloud project's credentials.
# Scenario B (Self-hosted): use the values printed by `supabase start`.
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Data source API key (required for wildfire detection)
NASA_FIRMS_KEY=your-nasa-firms-key
```

> ⚠️ In the self-hosted scenario, `SUPABASE_URL` must be reachable via the
> server's own network address (e.g. `http://<server-ip>:54321`), not
> `127.0.0.1` — the aggregator and database may reside on separate Docker
> networks. Adjust this address accordingly if the two are not on the same
> `docker-compose.yml` network.

---

## 6. Starting the System

From the project root directory:

```powershell
docker compose up -d
```

This command starts two containers:
- `mhews-frontend` — ports 80/443
- `mhews-aggregator` — port 8765

To check status:
```powershell
docker compose ps
docker compose logs -f aggregator
```

If the aggregator log shows recurring data-collection activity (messages
such as "fetch", "insert", "broadcast"), the system is operating correctly.

---

## 7. Verification — Confirming the System Is Operational

1. **Does the frontend load?**
   Navigate to the server's address in a browser (e.g. `http://<server-ip>`
   or a configured domain). If the map and interface render, the frontend
   is functioning.

2. **Is the aggregator collecting data?**
   ```powershell
   docker compose logs -f aggregator
   ```
   Data-fetch and processing log entries should appear at regular
   intervals.

3. **Is data being written to the database?**
   - Cloud: open the Supabase dashboard, navigate to **Table Editor**, open
     a relevant table (e.g. `disasters`, `alerts`), and confirm the row
     count is increasing.
   - Self-hosted: open `http://127.0.0.1:54323` (Studio) and inspect table
     contents in the same manner.

4. **End-to-end confirmation:** if a live event (e.g. a wildfire hotspot)
   is visible on the frontend map, the full chain — frontend, aggregator,
   and database — is confirmed operational.

---

## 8. Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Frontend loads but no data is displayed | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` incorrect or not set prior to build | Correct `.env`, then re-run `npm run build` |
| Aggregator container restarts repeatedly | `server/.env` missing or incorrect values (in particular `SUPABASE_SERVICE_ROLE_KEY`) | Inspect the error via `docker compose logs aggregator` |
| Cannot connect to the database (self-hosted) | `supabase start` is not running, or the server address is incorrect | Verify with `supabase status`; correct `SUPABASE_URL` to reflect the server's IP address |
| `supabase start` returns a Docker error | Docker Desktop is not running | Start Docker Desktop and retry |
| Migrations are absent from the database | `supabase db push` was not executed | Run `supabase link` followed by `supabase db push` |

---

## 9. Quick Reference — Command Summary

```powershell
# 1) Install the Supabase CLI (one-time)
npm install -g supabase

# 2) Start the database (self-hosted) or connect to the cloud project
#    (Scenario A/B, see Section 3)
supabase start
supabase db push

# 3) Build the frontend
npm install
npm run build

# 4) Configure the aggregator's environment file
cd server && cp .env.example .env   # then edit manually

# 5) Start the system
cd ..
docker compose up -d

# 6) Verify
docker compose ps
docker compose logs -f aggregator
```

Upon completion of these six steps, the system is fully operational: the
frontend is live, the aggregator is running, and the database is
populated.

---

## 10. Data Sources (What the Aggregator Collects)

The aggregator connects to the following hazard and early-warning data
sources via `server/src/sources/registry.js`. Each source is defined in
its own adapter file (`server/src/sources/<name>.js`); sources operating in
`poll` mode are retrieved at fixed intervals, while the `websocket`-mode
source (EMSC) maintains a persistent connection and receives data in real
time.

| Source | Category | Description | Endpoint |
|---|---|---|---|
| **USGS** | Earthquake | Global earthquake data (GeoJSON feed) | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/` |
| **EMSC** | Earthquake | Euro-Mediterranean earthquake data (real-time, WebSocket) | `emsc-csem.org` |
| **AFAD** | Earthquake | Official earthquake data from Turkey's Disaster and Emergency Management Authority | `deprem.afad.gov.tr/apiv2/event/filter` |
| **Kandilli (KOERI)** | Earthquake | Earthquake data from Boğaziçi University's Kandilli Observatory (Turkey) | internal adapter |
| **GEOFON (GFZ)** | Earthquake | Seismology service operated by GFZ Potsdam | `geofon.gfz-potsdam.de/fdsnws/event/1/query` |
| **GDACS (REST + RSS)** | Multi-hazard | Global Disaster Alert and Coordination System (earthquake, flood, cyclone, and others) | `gdacs.org/gdacsapi` |
| **PTWC (REST + RSS)** | Tsunami | Pacific Tsunami Warning Center bulletins | `tsunami.gov` |
| **NASA FIRMS** | Wildfire | Satellite-based active fire detection (requires an API key) | `firms.modaps.eosdis.nasa.gov/api` |
| **WHO** | Disease outbreak | World Health Organization disease outbreak news feed | `who.int/emergencies/disease-outbreak-news` |
| **FEWS NET** | Famine / food security | Famine Early Warning Systems Network (IPC phase data) | `fdw.fews.net/api/ipcphase` |

> Additional adapters (`fao.js`, `reliefweb.js`, `iot.js`) exist within the
> codebase but are not enabled by default in `registry.js`; they are
> available for future activation.

**Source management.** Which sources are active, their URLs, and their
polling intervals can be modified by an administrator via the
`data_sources` table (read by `configuredSources.js`, which drives the
adapters defined in `registry.js`) — sources can therefore be enabled or
disabled without any code change.

**Obtaining a NASA FIRMS API key:** register at no cost via
https://firms.modaps.eosdis.nasa.gov/api/map_key/, and enter the resulting
key into the `NASA_FIRMS_KEY` field in `server/.env`. If this key is not
provided, the aggregator automatically skips this source (the system
continues to operate normally; wildfire data is simply omitted).

---

## 11. System Architecture — Technical Detail

```
                     ┌─────────────────────────────┐
                     │  External Data Sources (10+) │
                     │  USGS / AFAD / GDACS / etc.  │
                     └───────────────┬──────────────┘
                                      │ poll / websocket
                                      ▼
                     ┌─────────────────────────────┐
                     │   AGGREGATOR (Node.js)       │
                     │  server/src/index.js         │
                     │  - sources/    (data ingest)  │
                     │  - processors/ (normalize,   │
                     │    dedup, preflight, pwave)  │
                     │  - output/     (DB write, WS  │
                     │    broadcast, health tracking)│
                     └──────┬───────────────┬───────┘
                             │               │
                    HTTP :8765/health   WS :8765
                             │               │
                             ▼               ▼
                     ┌──────────────┐  ┌─────────────┐
                     │   Supabase   │  │  FRONTEND   │
                     │  (Postgres)  │  │  (Vue, nginx)│
                     │  disasters,  │  │  live map    │
                     │  early_      │  │  + Supabase  │
                     │  warnings,   │  │  REST/       │
                     │  data_sources│  │  Realtime    │
                     └──────────────┘  └─────────────┘
```

**Data processing pipeline (within the aggregator):**
1. `sources/*` — raw data is retrieved (API / RSS / WebSocket).
2. `processors/normalizer.js` — heterogeneous source formats are converted
   into a common data model.
3. `processors/deduplicator.js` — events reported by multiple sources are
   deduplicated.
4. `processors/preflight.js`, `processors/pwave.js` — early-warning and
   pre-analysis logic.
5. `output/supabaseWriter.js` — resulting records are written to the
   `disasters` / `early_warnings` tables.
6. `output/wsServer.js` — the same data is broadcast in real time to
   connected frontend clients via WebSocket.
7. `output/healthTracker.js` — the last known success/failure status of
   each source is tracked and exposed at the `/health` endpoint.

---

## 12. Endpoints

| Endpoint | Protocol | Purpose |
|---|---|---|
| `http://<server>:8765/health` | HTTP GET | Aggregator and source health status (JSON) |
| `ws://<server>:8765` | WebSocket | Live hazard/alert data broadcast (consumed by the frontend) |
| `http://<server>` (80/443) | HTTP | Frontend interface (nginx) |
| Supabase `Project URL` | HTTPS / REST / Realtime | Database queries, authentication, realtime subscriptions |

The `/health` endpoint may be connected to a monitoring service (uptime
checker, health-check probe, etc.) to enable automated availability
tracking.

---

## 13. Environment Variables — Full Reference

### `server/.env` (aggregator)

| Variable | Required | Description |
|---|---|---|
| `WS_PORT` / `HTTP_PORT` | No (defaults to 8765) | WebSocket and health-endpoint port |
| `SUPABASE_URL` | Yes | Supabase project address (cloud or self-hosted) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side key with write privileges (must never be exposed to the frontend) |
| `NASA_FIRMS_KEY` | No | If omitted, only wildfire data is skipped |
| `OPENWEATHER_KEY` | No | Optional weather-data enrichment |
| `SENDGRID_API_KEY` / `SENDGRID_FROM` | No | Required for email notifications (dissemination module) |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` | No | Required for WhatsApp notifications |

### Project-root `.env` (frontend build)

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project address (anonymous access) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public, limited-privilege key (protected by Row-Level Security) |
| `VITE_WS_URL` | No | Aggregator WebSocket address; defaults to `ws://localhost:8765` if unset |

> **Security notice.** The `SERVICE_ROLE_KEY` is a fully privileged key
> that bypasses all Row-Level Security policies. It must remain exclusively
> within `server/.env` and must never be committed to source control,
> embedded in frontend code, or exposed to the browser.

---

## 14. Update Procedure

```powershell
# 1) Pull the latest code
git pull

# 2) Apply any new migrations
supabase db push          # self-hosted, or a linked cloud project

# 3) Rebuild the frontend
npm install
npm run build

# 4) Rebuild and restart the containers
docker compose up -d --build
```

If the aggregator's source code has changed, the `--build` flag rebuilds
the Docker image from the updated Dockerfile. If only `dist/` has changed,
a container restart is unnecessary — the volume mount ensures nginx serves
the newly built files automatically.

---

## 15. Backup Procedures

- **Cloud (Scenario A):** Supabase performs automatic backups according to
  the project's plan tier. Manual backups may also be taken from the
  dashboard under **Database → Backups**.
- **Self-hosted (Scenario B):** Data resides in the Docker volume created
  by `supabase start`. To take a manual backup:
  ```powershell
  supabase db dump -f backup.sql
  ```
  To restore from a backup:
  ```powershell
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f backup.sql
  ```

---

## 16. Stopping and Resetting the System

```powershell
# Stop the containers (data is preserved)
docker compose down

# Stop the self-hosted database stack (data is preserved; the volume remains)
supabase stop

# Fully reset the self-hosted database (⚠️ all data will be permanently deleted)
supabase db reset
```

---

## 17. References

**Internal documentation:**
- [`README.md`](../README.md) — general project overview
- [`TECHNICAL.md`](../TECHNICAL.md) — technical details
- [`docs/ADMIN_PANEL_GUIDE.md`](./ADMIN_PANEL_GUIDE.md) — administration panel user guide
- [`docs/MHEWS_system_architecture.md`](./MHEWS_system_architecture.md) — system architecture
- [`docs/security_roles_protocol.md`](./security_roles_protocol.md) — security and role protocol
- [`docs/PROJE_DURUMU.md`](./PROJE_DURUMU.md) — project status
- [`server/src/sources/registry.js`](../server/src/sources/registry.js) — active data source registry (source code)
- [`server/.env.example`](../server/.env.example) — full environment variable template

**External tool documentation:**
- Docker Compose: https://docs.docker.com/compose/
- Supabase CLI: https://supabase.com/docs/guides/cli
- Supabase self-hosting: https://supabase.com/docs/guides/self-hosting
- Vite (frontend build tool): https://vitejs.dev/

**Data source providers:**
- USGS Earthquake Feed: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/
- EMSC-CSEM: https://www.emsc-csem.org/
- AFAD (Turkey): https://deprem.afad.gov.tr/
- GFZ Potsdam GEOFON: https://geofon.gfz-potsdam.de/
- GDACS: https://www.gdacs.org/
- PTWC (Pacific Tsunami Warning Center): https://www.tsunami.gov/
- NASA FIRMS (satellite fire data): https://firms.modaps.eosdis.nasa.gov/
- WHO Disease Outbreak News: https://www.who.int/emergencies/disease-outbreak-news
- FEWS NET: https://fews.net/
