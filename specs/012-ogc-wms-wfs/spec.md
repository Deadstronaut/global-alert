# Feature Specification: OGC WMS/WFS Map Layers

**Feature Branch**: `012-ogc-wms-wfs`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Data Ingestion & Monitoring modülünün son kalemi: OGC WMS/WFS adapter (PRD MHEWS-FR-0037, MHEWS-SD-MAP-03, MHEWS-NFR-0058, constitution constraint C4 'OGC standards: consume only'). Bu, mevcut 5 hazard-event fetch-* pipeline'ından farklı bir yetenek — WMS/WFS uçlarından gelen veri bir DisasterEvent değil, haritada gösterilen bir görsel katman (raster tile veya vektör overlay). Admin bir WMS/WFS katmanı kaydeder, harita kullanıcısı bu katmanı açıp/kapatabilir ve opaklığını ayarlayabilir."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register an external OGC map layer (Priority: P1)

A Tenant Admin registers an external OGC-compliant WMS or WFS endpoint (e.g. a national meteorological service's radar imagery, or a hydrological agency's gauge-station vector layer) as a new map layer, providing its endpoint URL, the specific layer/type name to request, and a human-readable display name.

**Why this priority**: Without a way to register a layer, no other capability in this spec has anything to render — this is the foundation everything else builds on.

**Independent Test**: As a Tenant Admin, register a WMS endpoint with a layer name; confirm it is saved and appears in the layer registry, inactive by default until explicitly activated.

**Acceptance Scenarios**:

1. **Given** a Tenant Admin on the map layers admin panel, **When** they submit a valid WMS endpoint URL, layer name, and display name, **Then** a new map layer record is created.
2. **Given** the same panel, **When** they submit a WFS endpoint URL and feature type name instead, **Then** a new WFS-type map layer record is created.
3. **Given** an admin submits an endpoint URL that is not HTTPS or resolves to a private/loopback address, **When** they submit the form, **Then** the system rejects it with a clear reason (consistent with this project's existing data-source URL safety rule).
4. **Given** a non-Tenant-Admin user (country_admin, org_admin, viewer), **When** they attempt to register or edit a map layer, **Then** the action is rejected.

---

### User Story 2 - Toggle and adjust an OGC layer on the map (Priority: P1)

A map user (any authenticated role) opens the map view, sees a list of active OGC map layers available to them, and can toggle each one on/off and adjust its opacity, so they can overlay authoritative external context (e.g. weather radar) on top of the platform's own hazard events without it obscuring the base map or event markers.

**Why this priority**: This is the actual value delivery named in MHEWS-SD-MAP-03 ("layer toggle and opacity") — registering a layer (Story 1) is meaningless if nobody can see or control it on the map.

**Independent Test**: With one active WMS layer registered, open the map, toggle the layer on, confirm it renders as an overlay; adjust its opacity slider and confirm the rendered layer's transparency changes; toggle it off and confirm it disappears.

**Acceptance Scenarios**:

1. **Given** an active WMS map layer, **When** a user toggles it on from the map's layer panel, **Then** the corresponding raster overlay appears on the map.
2. **Given** an active WFS map layer, **When** a user toggles it on, **Then** the corresponding vector features (points/lines/polygons) appear on the map.
3. **Given** a visible layer, **When** the user drags its opacity slider, **Then** the rendered layer's visual transparency updates accordingly without needing to re-toggle it.
4. **Given** a layer the admin has deactivated, **When** any user opens the map, **Then** that layer does not appear in the layer panel at all.

---

### User Story 3 - Deactivate or edit a registered layer (Priority: P2)

A Tenant Admin edits an existing map layer's display name or endpoint details, or deactivates a layer that is no longer needed (e.g. a seasonal flood-forecast WMS feed taken offline for the year) without deleting its configuration history.

**Why this priority**: Necessary for ongoing maintenance of the registry, but the module delivers its core value (Stories 1-2) without this — admins can work around a missing edit feature by re-registering, whereas Stories 1-2 have no workaround.

**Independent Test**: Deactivate an active layer and confirm it immediately stops appearing in the map's layer panel for all users; edit its display name and confirm the change is reflected.

**Acceptance Scenarios**:

1. **Given** an active map layer, **When** a Tenant Admin deactivates it, **Then** it is immediately removed from every user's map layer panel.
2. **Given** an inactive map layer, **When** a Tenant Admin reactivates it, **Then** it reappears in the map layer panel (still off by default until a user toggles it).
3. **Given** an existing map layer, **When** a Tenant Admin edits its display name or endpoint URL, **Then** the change is saved and reflected the next time any user loads the map.

---

### Edge Cases

- What happens when a registered WMS/WFS endpoint is unreachable or returns an error at render time? The layer's toggle remains available, but the map shows no imagery/features for it — this is a live, unrecorded rendering failure (not logged as ingestion data quality, since no data is being stored per this spec's scope), analogous to a broken image link.
- What happens if two map layers have overlapping geographic extents? Both render simultaneously per their individual opacity settings; layer draw order follows registration order (no manual re-ordering in this iteration).
- What happens when a WFS endpoint returns a very large number of features? The system does not implement pagination, simplification, or feature-count limiting in this iteration — performance beyond default browser/rendering-engine limits is out of scope.
- What happens when an admin edits an active layer's endpoint URL to one that fails the safety validation (Story 1, Scenario 3)? The edit is rejected the same way a new registration would be, and the layer keeps its previous, valid configuration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a Tenant Admin to register a new map layer as either type `wms` or type `wfs`, capturing at minimum: a display name, the source type (`wms`/`wfs`), the endpoint URL, and the specific layer/feature-type name to request from that endpoint.
- **FR-002**: The system MUST reject any map layer endpoint URL that is not HTTPS or that resolves to a private, loopback, or otherwise non-public address, consistent with this project's existing data-source URL safety rule (MHEWS-FC-INV-09).
- **FR-003**: The system MUST restrict map layer creation, editing, deactivation, and reactivation to the same administrative role tier already used for hazard taxonomy and SOP repository management (`super_admin`); other roles MAY view and toggle active layers on the map but MUST NOT manage the registry.
- **FR-004**: The system MUST render an active `wms`-type layer as a map overlay using the registered endpoint and layer name, and MUST render an active `wfs`-type layer as vector features using the registered endpoint and feature-type name.
- **FR-005**: The system MUST allow any authenticated user viewing the map to independently toggle each active map layer on or off.
- **FR-006**: The system MUST allow any authenticated user viewing the map to adjust the rendered opacity of each currently-visible map layer.
- **FR-007**: The system MUST exclude deactivated map layers entirely from the map's layer panel for all users (not merely rendered as unavailable/greyed out).
- **FR-008**: The system MUST NOT store, deduplicate, or normalize the geospatial data returned by a WMS/WFS endpoint into the platform's own hazard-event records — this data is rendered live as a visual overlay only, consistent with this project's "consume only" constraint on OGC standards.
- **FR-009**: A user's on/off and opacity choices for a given layer MUST persist only for their current map session (no requirement to persist per-user layer preferences across sessions in this iteration).

### Key Entities

- **Map Layer** *(new entity)*: An admin-registered reference to an external OGC WMS or WFS endpoint. Has a display name, source type (`wms`/`wfs`), endpoint URL, layer/feature-type name, and an active/inactive flag. Distinct from `data_sources` (which drives the hazard-event ingestion pipeline) — a Map Layer never produces a stored hazard event.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Tenant Admin can register a working external WMS or WFS layer and have it appear as a toggleable option on the map without any code change or deployment.
- **SC-002**: Any map user can turn an available OGC layer on, see it rendered within the same page load, and adjust its transparency using a single control, with no page reload required.
- **SC-003**: Deactivating a layer removes it from every user's map layer panel with no stale/cached layer remaining visible on a fresh page load.
- **SC-004**: 100% of map layer registration attempts using a non-HTTPS or private-address endpoint are rejected before being saved.

## Assumptions

- "Tenant Admin" maps to the `super_admin` role in this system's actual RBAC model, consistent with spec 010 (Hazard Taxonomy) and spec 011 (SOP Repository) — there is no separate "Tenant Admin" role.
- This spec covers the 2D map view only (the MapLibre GL-based `MapView.vue`); the 3D globe view is out of scope, since WMS/WFS overlays are inherently a 2D map-tile/vector-layer concept with no established equivalent in the project's globe rendering.
- Per-layer feature styling (custom colors/icons for WFS vector features, custom tile parameters for WMS beyond layer name) is out of scope for this iteration — a single sensible default rendering style is applied to all layers of a given type.
- No caching, retry, or health-monitoring state machine (unlike `data_sources`) is introduced for map layers in this iteration — an unreachable endpoint simply fails to render silently, since no ingested data or dispatch depends on it.
- Layer re-ordering, per-user saved layer preferences, and feature-count/complexity limits for large WFS responses are explicitly out of scope, per the Edge Cases above.
