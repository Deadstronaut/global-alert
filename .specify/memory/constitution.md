<!--
Sync Impact Report
- Version change: TEMPLATE → 1.0.0 (initial ratification)
- Modified principles: n/a (first fill of template placeholders)
- Added sections: Core Principles (I–VIII), Scope Constraints, Technology & Architecture Standards,
  Development Workflow & Quality Gates, Governance
- Removed sections: none (placeholder template superseded)
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check gate references these principles; no structural edit needed, generic placeholder already supports it)
  - ✅ .specify/templates/spec-template.md (generic; compatible with scope constraints below)
  - ✅ .specify/templates/tasks-template.md (generic; compatible with testing/quality principles below)
  - ⚠ docs/MHEWS_architecture_description-1776790086344.md — describes a Django/PostGIS/Celery
    architecture that this constitution explicitly does NOT adopt; kept as reference/vision only.
    Recommend adding a note at the top of that file pointing to this constitution (manual follow-up).
- Follow-up TODOs: none blocking; RATIFICATION_DATE set to today since no prior formal ratification exists.
-->

# Global Alert / GEWS (MHEWS) Constitution

## Core Principles

### I. Hazard-Agnostic, Model-Driven Design
The system MUST treat hazard types as data, not code. Adding a new disaster/hazard type
(e.g., a new source or category beyond earthquake, wildfire, flood, drought, food security)
MUST be achievable primarily through configuration/schema changes (new adapter config, new
severity mapping table, new source registration) rather than structural rewrites of core
components (`DisasterEvent`, Pinia stores, map/globe rendering layers).
Rationale: The PRD (docs/mhewsprd.md) defines a 12-module, hazard-agnostic early warning
platform; the codebase must not hard-code assumptions that block onboarding new hazards.

### II. Scope Discipline (NON-NEGOTIABLE)
The system MUST NOT implement functionality outside the boundaries below without an explicit,
documented constitution amendment:
- **Dissemination channels**: Email, Web Portal, WhatsApp only. SMS, cell broadcast, mobile
  push, and siren/radio/social-media automation are OUT OF SCOPE.
- **Identity**: local authentication/authorization only. No external identity federation
  (SAML, OIDC, LDAP).
- **CAP (Common Alerting Protocol)**: authoring, validation, and export ONLY. Inbound CAP hub
  ingestion is OUT OF SCOPE.
Rationale: These boundaries are stakeholder-ratified constraints from the SRS (docs/21_structured_srs.md,
constraints C5–C7) and prevent uncontrolled scope creep into infrastructure the team does not own.

### III. CAP v1.2 Compliance
Every alert authoring and export code path MUST produce CAP messages that validate against the
OASIS CAP v1.2 schema (mandatory `<info>` fields: category, event, urgency, severity, certainty,
effective/expires, headline, description, area). Update and Cancel messages MUST carry a correct
`<references>` element pointing to the superseded alert. Validation MUST run before any CAP
message is allowed to publish; validation failures MUST block publish, not just warn.
Rationale: CAP compliance is an external, auditable standard (OASIS CAP v1.2); non-compliant
output breaks downstream consumers and fails audit review.

### IV. Data Quality & Normalization
Every external disaster/hazard data source MUST be normalized into the shared `DisasterEvent`
model (id, type, lat, lng, severity, magnitude, title, description, time, source, sourceUrl)
before it reaches stores or UI. Each ingestion pipeline MUST perform deduplication using a
distance-threshold + time-window rule (thresholds are source-type-specific, e.g. 20km/5min for
earthquakes) and MUST reject/flag malformed payloads rather than silently storing them. Every
displayed time series or map layer MUST expose a data-freshness indicator (last updated /
staleness) to the user.
Rationale: PRD requirements on schema validation, quality alerts, and data-recency indicators
(SRS Req 340, user stories 8–9) depend on consistent normalization at the ingestion boundary.

### V. Access Control & Auditability
Role-based access (at minimum: Operator, Approver, Tenant Admin, Auditor) MUST gate who can
draft, approve/publish, and administer configuration. Attribute-based restrictions (e.g.,
geographic/tenant scoping) MUST be enforced wherever the PRD specifies jurisdiction limits.
Every security-relevant action (login, edit, publish, role change, drill-mode toggle) MUST
write an audit event (actor, timestamp, action, target) to an append-only log; audit records
MUST NOT be mutable or deletable through normal application code paths.
Rationale: PRD modules M9 (Audit & Compliance) and M10 (Administration & Access) require
RBAC/ABAC and an immutable audit trail as compliance-critical, non-negotiable features.

### VI. Accessibility & Internationalization
The UI MUST support dark mode, light mode, high-contrast mode, colorblind-safe palette, and a
reduced-motion "safe mode" as first-class, always-available settings — never an afterthought
bolt-on. All seven currently supported locales (tr, en, es, fr, ru, ar, zh) MUST remain
functional for any new user-facing feature, including RTL layout correctness for Arabic. New
UI text MUST be added through the i18n system, never hard-coded strings.
Rationale: Accessibility and multilingual support are explicit product features (README) and
align with WMO/UN Women EWS checklist items on inclusive, multi-channel communication.

### VII. Performance & Resilience by Design
Polling/refresh intervals MUST be differentiated by hazard type according to real-world update
cadence (fastest for earthquakes, slower for drought/food security) rather than a single global
interval. The app MUST degrade gracefully offline: cached data (localStorage, capped size per
source) MUST be shown immediately on load before live data arrives, and the app MUST remain
usable (read-only) when network requests fail. Rendering-heavy features (hexbin aggregation,
heatmaps) MUST prefer approaches that scale to large event counts (e.g., canvas over SVG) over
naive per-feature DOM/SVG rendering.
Rationale: Documented performance decisions (TECHNICAL.md §13) and offline-cache behavior are
already load-bearing product guarantees; new work must not regress them.

### VIII. Simplicity & YAGNI
The backend MUST remain Supabase-based (PostgreSQL + Deno Edge Functions) unless a documented
constitution amendment justifies otherwise. Do not introduce additional services, queues,
message brokers, or frameworks (e.g., Celery, a second database, a separate microservice) to
satisfy a PRD feature until the Supabase-native approach has been shown insufficient in an
implementation plan's Complexity Tracking section. Prefer the smallest change that satisfies a
requirement's acceptance criteria.
Rationale: The PRD/SRS/Architecture documents describe a much larger Django/PostGIS/Celery
target architecture (docs/MHEWS_architecture_description-1776790086344.md) that this project has
deliberately NOT adopted; unchecked complexity creep would silently re-introduce that architecture
piecemeal without ever deciding to do so.

## Scope Constraints & Requirements Traceability

- The functional source of truth for "what to build" is `docs/mhewsprd.md` (PRD) and
  `docs/21_structured_srs.md` (SRS). `docs/MHEWS_architecture_description-1776790086344.md` is
  retained as architectural VISION/REFERENCE ONLY and is NOT authoritative for how this
  codebase is implemented — Principle VIII and this constitution take precedence over it.
- `docs/iş planı istereler.txt` reflects the current module-by-module completion gap analysis
  against the PRD and should be treated as the living backlog prioritization signal when
  sequencing new specs/features.
- Any feature spec (`/speckit-specify`) that appears to require a technology outside the current
  stack (Vue 3, Pinia, Vite, Leaflet, globe.gl, h3-js, Supabase/Deno, Capacitor, vue-i18n) MUST
  flag this explicitly in that spec's Assumptions section for explicit approval before planning.

## Development Workflow & Quality Gates

- Automated tests are REQUIRED for critical business logic: deduplication rules, severity
  mapping, CAP XML validation, and proximity/nearby-threat distance calculations. Other code may
  follow lighter-weight testing at the author's discretion, but these four areas are
  non-negotiable test-first zones.
- Every `/speckit-plan` MUST include a Constitution Check pass that explicitly verifies the plan
  against Principles I–VIII before Phase 0 research begins, and again after Phase 1 design.
- Any deviation from a Core Principle MUST be recorded in that plan's Complexity Tracking table
  with a stated reason and the simpler alternative that was rejected.

## Governance

This constitution supersedes ad hoc practice for this repository. All specs, plans, and tasks
produced via Spec Kit MUST be checked for compliance with the principles above; reviewers should
reject or request revision of any plan/PR that silently violates Scope Discipline (Principle II)
or Simplicity/YAGNI (Principle VIII) without a documented justification.

**Amendment procedure**: Propose changes via `/speckit-constitution` with an explicit rationale.
Version MUST bump according to semantic versioning: MAJOR for removing/redefining a principle,
MINOR for adding a principle or materially expanding guidance, PATCH for wording/clarification
only. On amendment, re-check `.specify/templates/plan-template.md`, `spec-template.md`, and
`tasks-template.md` for consistency, and note any required follow-up in the Sync Impact Report.

**Version**: 1.0.0 | **Ratified**: 2026-07-03 | **Last Amended**: 2026-07-03
