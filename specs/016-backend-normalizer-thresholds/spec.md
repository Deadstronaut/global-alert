# Feature Specification: Backend Ingestion Normalizers Read the Hazard Threshold Registry

**Feature Branch**: `016-backend-normalizer-thresholds`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Backend ingestion normalizer'larını (Deno Edge Function ve Node.js aggregator) hazard_thresholds registry'sine bağlama — spec 010'un bilinçli olarak ertelediği takip işi. Admin bir eşiği değiştirdiğinde, gerçek zamanlı ingest edilen afet verisinin severity hesaplaması hâlâ hardcoded değerlerden geliyor, registry'den değil."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin's threshold change takes effect for real, ingested hazard data (Priority: P1)

An administrator adjusts a severity breakpoint for a hazard type (for example, raising the earthquake "high"
threshold from magnitude 5.5 to 6.0) through the existing hazard taxonomy admin screen. The next time a real hazard
event of that type is ingested from an external source (e.g. a GDACS earthquake feed poll), the event's computed
severity reflects the new threshold — not the old, previously hardcoded one.

**Why this priority**: This is the entire reason the feature exists. Today, an admin's threshold edit only ever
affects manually-entered records; every automatically-ingested hazard event — the overwhelming majority of the
system's real data — silently continues to use the old hardcoded breakpoints forever, no matter what the admin
configures. This is the core capability gap.

**Independent Test**: Change a threshold for a hazard type via the admin screen, then trigger an ingestion for that
hazard type with a value that falls in the changed range; confirm the resulting stored severity matches the new
threshold rather than the old hardcoded one.

**Acceptance Scenarios**:

1. **Given** an administrator has changed a hazard type's severity breakpoints, **When** a new event of that hazard
   type is ingested from an external source, **Then** the event's severity is computed using the updated
   breakpoints.
2. **Given** the threshold registry is temporarily unreachable at the moment of ingestion, **When** an event is
   ingested, **Then** the event still receives a severity value (computed from the last-known-good configuration or
   the system's original built-in defaults) — ingestion never fails or drops an event solely because the registry
   could not be reached.
3. **Given** no administrator has ever changed a hazard type's thresholds, **When** events are ingested, **Then**
   the computed severities are identical to what the system produced before this feature existed — no silent
   behavior change for hazard types nobody has customized.

### Edge Cases

- What happens when the registry briefly errors during a burst of ingestion (e.g. a transient network blip)? →
  Ingestion continues using the most recently successfully retrieved configuration (or, if none has ever been
  retrieved successfully, the system's original built-in defaults); no event is ever rejected or left without a
  severity because of a registry lookup failure.
- What happens when a hazard type is ingested that has no matching entry in the registry (e.g. a brand-new type an
  admin hasn't configured thresholds for yet)? → Falls back to the system's original built-in default behavior for
  that hazard type, identical to today.
- What happens if the registry is updated by an admin at the exact moment an ingestion cycle is reading it? → Each
  ingestion cycle uses a consistent snapshot of the configuration for that cycle; a threshold change is reflected
  starting from the next refresh, not necessarily mid-cycle — an eventually-consistent update is acceptable, since
  ingestion cycles already run on a recurring schedule (seconds to minutes), not once per organizational lifetime.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST compute severity for every automatically-ingested hazard event using the same
  threshold configuration an administrator can view and edit through the existing hazard taxonomy admin screen.
- **FR-002**: The system MUST continue to produce a severity value for every ingested event even when the threshold
  configuration cannot be retrieved at that moment — ingestion MUST NOT fail, stall, or drop an event due solely to
  a configuration-retrieval failure.
- **FR-003**: When no administrator has customized a given hazard type's thresholds, the system MUST compute
  severity for that hazard type identically to its behavior before this feature existed (zero regression for
  unconfigured hazard types).
- **FR-004**: The system MUST NOT require a live configuration lookup for every single ingested event — the
  configuration MUST be retrieved on a recurring basis and reused across a reasonable window of ingestion activity,
  not fetched fresh per event.
- **FR-005**: This capability MUST apply consistently across every automated ingestion pathway that computes
  severity from raw values, not just one of them.

### Key Entities

- **Hazard Threshold Configuration**: The existing, admin-editable set of severity breakpoints per hazard type
  (already used to compute severity for manually-entered records). This feature makes automated ingestion pathways
  consumers of the same configuration, rather than introducing a new configuration source.
- **Ingested Hazard Event**: A hazard occurrence retrieved from an external source and given a computed severity
  value as part of being stored. No new fields are introduced; only how the severity value is computed changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator's threshold change is reflected in newly-ingested hazard events within one ingestion
  cycle (i.e., without requiring a deployment, restart, or manual intervention).
- **SC-002**: 100% of hazard types with no administrator-customized thresholds continue to produce the exact same
  severity classifications as before this feature — zero regression.
- **SC-003**: A temporary configuration-retrieval outage causes zero ingestion failures or dropped events across
  all automated ingestion pathways.

## Assumptions

- "Within one ingestion cycle" (SC-001) is an acceptable freshness bound for this system — hazard severity
  thresholds are an operational/administrative setting, not a safety-critical value that must propagate
  instantaneously; the existing recurring ingestion schedule (already in place per hazard type) is the natural
  refresh cadence.
- The two automated ingestion pathways currently computing severity independently (the Edge Function-based one and
  the separate real-time aggregator process) are both in scope; the interactive, manual-entry authoring path is
  unaffected — it already reads the same configuration (delivered in a prior feature).
- No new hazard types, threshold schema fields, or admin-facing UI changes are introduced — this feature only
  changes which code path automated ingestion uses to *read* the existing configuration.
