# Feature Specification: Live Flight & Ship Tracking

**Feature Branch**: `072-live-flight-ship-tracking`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "Gerçek zamanlı uçuş ve gemi takibi katmanı, 3B globe üzerinde. Kapsam: (1) Canlı uçuş verisi ve canlı gemi/AIS verisi için gerçek veri kaynağı entegrasyonu — globe'daki diğer katmanlar gibi sadece gerçek veriye dayalı olmalı, dekoratif/sahte olmayacak. (2) Bu uçak/gemi konumlarının 3B globe üzerinde gösterilmesi, sağdaki mevcut katman dock'una yeni bir aç/kapa butonu olarak eklenmesi, varsayılan kapalı. (3) Ayrıca ana ekranın sol üst köşesinde, mevcut radar rozeti ile aynı görsel boyutta, bir ekran görüntüsü indirme kontrolüyle ve sığınaklar toggle'ıyla birlikte 2x2 eşit boyutlu bir hızlı-erişim ikon grid'i oluşturulması."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See live aircraft and vessels on the globe (Priority: P1)

An operator monitoring the 3D globe wants to turn on a layer that shows real aircraft currently in flight and real ships currently at sea, so they have situational awareness of air/maritime traffic near an unfolding disaster (e.g. evacuation routes, search-and-rescue assets, blocked shipping lanes near a flooded port).

**Why this priority**: This is the core data capability the feature exists to deliver; every other part of this spec (dock button, grid) exists to expose it. Without it there's nothing to toggle.

**Independent Test**: Can be fully tested by enabling the new layer and confirming aircraft/vessel icons appear at real, currently-plausible positions (cross-checked against a public flight/vessel tracker) and move over time as their real positions update.

**Acceptance Scenarios**:

1. **Given** the globe view is open and the new layer is off (default), **When** the operator turns the layer on from the layer dock, **Then** real aircraft and real ship positions currently in transit appear on the globe as distinct, labeled markers.
2. **Given** the layer is on, **When** time passes, **Then** each marker's position updates to reflect the aircraft's/ship's real current location (not a static snapshot).
3. **Given** the layer is on, **When** the operator hovers an aircraft or ship marker, **Then** a real-data info card shows identifying details (e.g. callsign/flight number or vessel name, heading, speed) — consistent with the existing hover-card layer.
4. **Given** the underlying live data source is temporarily unavailable, **When** the layer is on, **Then** the globe shows a clear "data unavailable" state for that layer rather than silently freezing stale positions or showing fabricated ones.

---

### User Story 2 - Toggle the layer from the existing layer dock (Priority: P1)

An operator who has already learned the existing right-side globe layer dock (terminator, night lights, choropleth, timeline, dynamic atmosphere, hover cards) wants flight/ship tracking to work the same way — one more small icon button, off by default, in the same place.

**Why this priority**: Consistency with the pattern already shipped in spec 072's predecessor work; without this the new layer would be discoverable only through a different, inconsistent path.

**Independent Test**: Can be fully tested by opening the globe view and confirming a 7th icon button appears in the existing dock, defaults to off, and toggling it shows/hides the flight/ship markers with no effect on the other six layers.

**Acceptance Scenarios**:

1. **Given** a first-time visit to the globe view, **When** the page loads, **Then** the flight/ship layer is off, matching the other six layer toggles' default state.
2. **Given** the operator clicks the new dock button, **When** the layer turns on, **Then** only the flight/ship markers appear or disappear — no other layer's state changes.

---

### User Story 3 - Quick-access 2x2 icon grid, top-left of the main screen (Priority: P2)

A user wants one-click access, from the main screen, to four related "always useful" controls arranged as a compact 2x2 grid of equally-sized icons in the top-left corner: the existing decorative radar badge, an existing screen-capture/export control, the existing shelters layer toggle, and the new flight/ship layer toggle.

**Why this priority**: This is a layout/convenience improvement on top of User Story 1/2 — the flight/ship layer is already fully usable via the right-side dock without it, so this can ship after or be adjusted independently.

**Independent Test**: Can be fully tested by loading the main screen and confirming four equally-sized icons are grouped in a 2x2 grid in the top-left corner, each control retains its existing behavior, and the grid does not overlap or crowd out other top-left UI (e.g. the location search box).

**Acceptance Scenarios**:

1. **Given** the main screen is loaded, **When** the user looks at the top-left corner, **Then** four equally-sized icon controls are visible in a 2x2 grid: radar badge, screenshot/export control, shelters toggle, flight/ship toggle.
2. **Given** the shelters toggle or flight/ship toggle is activated from this grid, **When** the operator later opens the corresponding full control (sidebar / right-side globe dock), **Then** its state matches what was set from the grid — the grid is a second entry point to the same shared state, not a separate one.

---

### Edge Cases

- What happens when the live flight or ship data source returns zero results for the current view (e.g. a remote ocean region with no traffic)? The layer should show correctly as empty, not as an error.
- What happens when the live data source's request volume/rate limit is exceeded? The layer should degrade gracefully (e.g. show the last successfully fetched positions with a visible "stale" indication, or show the unavailable state) rather than crash the globe view.
- What happens on a country-locked deployment (per the project's federated per-country model) — is flight/ship data shown globally or clipped to the deployment's own country/region? [See Assumptions.]
- What happens when an aircraft/ship marker is hovered and its identifying data is incomplete (e.g. anonymized/blocked transponder)? The info card should show what's known and clearly indicate the rest is unavailable, not fabricate placeholder values.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display real, currently-in-transit aircraft positions on the 3D globe, sourced from a live public flight-tracking data feed.
- **FR-002**: System MUST display real, currently-at-sea vessel positions on the 3D globe, sourced from a live vessel/AIS tracking data feed.
- **FR-003**: System MUST refresh both aircraft and vessel positions on a recurring interval so markers reflect real movement over time, not a one-time snapshot.
- **FR-004**: System MUST NOT display fabricated, simulated, or decorative aircraft/vessel positions under any circumstance — every marker shown must trace back to a real feed response (consistent with the project's existing no-decorative-fake-data-viz rule).
- **FR-005**: System MUST expose the flight/ship layer as one additional toggle in the existing globe layer dock, defaulting to off.
- **FR-006**: System MUST show a real-data hover info card for each aircraft/vessel marker (identifier, heading/speed where available), using the existing hover-card mechanism.
- **FR-007**: System MUST visibly indicate when the live data source is unavailable or stale, rather than silently showing frozen or fabricated data.
- **FR-008**: System MUST present four equally-sized quick-access icon controls — the existing radar badge, an existing screen-capture/export control, the existing shelters toggle, and the new flight/ship toggle — arranged as a 2x2 grid in the top-left corner of the main screen.
- **FR-009**: Toggling the shelters or flight/ship control from the 2x2 grid MUST update the same underlying state as the existing full controls (right-side globe dock for flight/ship, existing shelters toggle location) — the grid is an additional entry point, not a separate, disconnected state.
- **FR-010**: System MUST NOT change the existing behavior of the radar badge or the screen-capture/export control beyond relocating/resizing them into the grid.

### Key Entities

- **Aircraft Position**: A real, currently-in-flight aircraft's location (lat/lng, altitude, heading, speed) and identifying info (callsign/flight number, origin/destination if available), sourced live and refreshed periodically.
- **Vessel Position**: A real, currently-at-sea ship's location (lat/lng, heading, speed) and identifying info (vessel name/type if available), sourced live and refreshed periodically.
- **Quick-Access Grid Control**: One of four equally-sized icon buttons in the top-left 2x2 grid, each either a pure action (screen capture) or a toggle mirroring an existing layer's on/off state (shelters, flight/ship) or purely decorative (radar badge).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can enable live flight/ship tracking and see real aircraft/vessel positions appear on the globe within 5 seconds of toggling the layer on.
- **SC-002**: Aircraft and vessel marker positions visibly update to reflect real movement at least once per minute while the layer is on.
- **SC-003**: 100% of aircraft/vessel markers shown trace back to a real live data feed response — zero fabricated or placeholder markers appear under any tested condition, including data-source outages.
- **SC-004**: The top-left 2x2 quick-access grid is discoverable and usable without consulting documentation — a new user can identify what each of the four icons does (via hover/tooltip) within one interaction.
- **SC-005**: Adding the flight/ship layer does not degrade overall globe interaction responsiveness (rotation/zoom stays smooth) compared to before the layer existed, whether the layer is on or off.

## Assumptions

- The project's live vessel/AIS data source and live flight data source are each subject to their own access terms, coverage limits, and possible rate limits or costs; exact provider selection is a technical/planning decision made in `/speckit-plan`, not this spec.
- Flight/ship data is shown globally (not clipped to a single country), consistent with how the other five real-data globe layers (choropleth, terminator, etc.) already behave in this app's anon-sees-all + country-locked-login architecture — a country-locked deployment still sees global air/maritime traffic, same as it sees the global terminator line.
- "Screen-capture/export control" in FR-008/FR-010 refers to whichever existing control on the main screen currently lets a user save/export a view of the map or globe; the exact existing control is identified during planning by inspecting the current UI, not re-specified here to avoid guessing at UI internals in this document.
- The four quick-access grid icons are sized to match the existing radar badge's visual footprint (the smallest of the four today), rather than enlarging the radar badge to match a larger control.
- No new user roles or permissions are introduced — flight/ship tracking visibility follows the same access rules as the globe view itself.
