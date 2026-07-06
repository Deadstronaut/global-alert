# Feature Specification: Drill Mode — CAP Exercise Isolation

**Feature Branch**: `013-drill-mode-cap`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Preparedness, Drill & Response modülünü tamamlama (PRD MHEWS-FR-0210, MHEWS-FR-0245, MHEWS-FR-0278, docs/21_structured_srs.md §3.8). Mevcut durum: `drill_sessions` tablosu ve AdminView.vue'daki Tatbikat sekmesi zaten var (tatbikat başlat/bitir, durum listesi) — supabase/migrations/20260605120200_drill_mode.sql. Kod incelemesiyle tespit edilen gerçek eksik: tatbikat sırasında oluşturulan CAP uyarılarının 'EXERCISE' olarak işaretlenmesi ve gerçek dispatch'in (email/WhatsApp) tamamen engellenmesi hiç yapılmamış — bu, PRD'nin en kritik güvenlik gereksinimi (yanlışlıkla gerçek halka tatbikat uyarısı gönderilmesini önlemek) ve şu an hiçbir kod yolu bunu sağlamıyor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CAP alerts automatically flagged as exercise during an active drill (Priority: P1)

An operator authoring a CAP alert while their country has an active drill session running does not need to remember to manually mark it as a drill — the system automatically flags the new alert as an exercise alert, tied to that active drill.

**Why this priority**: Every other guarantee in this spec (no real dispatch, visible watermark) depends on alerts being correctly flagged as exercise in the first place — an operator forgetting a manual checkbox is exactly the human-error scenario this feature must eliminate.

**Independent Test**: Start a drill for a country, author a new CAP alert for that same country, and confirm it is automatically flagged as an exercise alert without the operator taking any extra action.

**Acceptance Scenarios**:

1. **Given** an active drill session for country X, **When** an operator in country X creates a new CAP draft, **Then** the draft is automatically flagged as an exercise alert.
2. **Given** no active drill session for country Y, **When** an operator in country Y creates a new CAP draft, **Then** the draft is a normal (non-exercise) alert.
3. **Given** a CAP draft was created while a drill was active, **When** that drill later ends, **Then** the already-created draft remains flagged as an exercise alert (the flag is fixed at creation time, not re-evaluated later).

---

### User Story 2 - Exercise alerts never trigger real dispatch (Priority: P1)

When an exercise-flagged CAP alert is moved to broadcast status (e.g. as part of running the drill end-to-end), the system does not send any real email or WhatsApp message to any contact, regardless of which part of the system triggers the status change.

**Why this priority**: This is the actual safety-critical guarantee named in the PRD (no real-world false alarms from a drill) — without it, running a realistic end-to-end drill risks sending real alerts to real people, which is the single most damaging failure mode this module exists to prevent.

**Independent Test**: Start a drill, author and broadcast an exercise-flagged CAP alert, and confirm no dispatch job or dispatch receipt is created for it — while confirming an equivalent non-exercise alert broadcast at the same time does still dispatch normally.

**Acceptance Scenarios**:

1. **Given** an exercise-flagged CAP alert, **When** it is transitioned to broadcast status through any code path, **Then** no email or WhatsApp dispatch is initiated for it.
2. **Given** a normal (non-exercise) CAP alert, **When** it is broadcast, **Then** dispatch proceeds exactly as it does today (no regression).
3. **Given** an exercise-flagged CAP alert that reaches broadcast status, **When** a system operator inspects it afterward, **Then** it is possible to confirm no dispatch was attempted for that specific alert.

---

### User Story 3 - Exercise alerts are clearly, visibly marked everywhere (Priority: P2)

Anyone viewing an exercise-flagged CAP alert — in the alert authoring/history view or anywhere else it might be surfaced — sees an unmistakable "EXERCISE ONLY" indicator, so nobody mistakes a drill alert for a real one.

**Why this priority**: A strong safety-net requirement, but secondary to Story 2 — even without a visible watermark, Story 2 already guarantees no real message reaches the public; the watermark exists to prevent *internal* confusion (an operator or reviewer misreading a drill alert as real), which is a lower-stakes failure mode than actual dispatch.

**Independent Test**: View an exercise-flagged alert in the authoring/history list and confirm a persistent, unmistakable "EXERCISE ONLY" label is shown alongside it at every stage of its lifecycle (draft through broadcast).

**Acceptance Scenarios**:

1. **Given** an exercise-flagged CAP alert at any status, **When** it is displayed in the alert list or detail view, **Then** an "EXERCISE ONLY" indicator is shown.
2. **Given** a normal (non-exercise) CAP alert, **When** displayed anywhere, **Then** no exercise indicator is shown.

---

### User Story 4 - Drill summary reflects how many alerts were actually issued (Priority: P3)

When an admin ends a drill, the automatically generated summary includes not just the drill's duration but also how many exercise CAP alerts were authored during it, giving a basic at-a-glance measure of drill activity.

**Why this priority**: A useful reporting nicety building on Stories 1-3, but the module delivers its full safety guarantee without it — this is the lowest-priority, purely informational addition.

**Independent Test**: Run a drill during which two exercise CAP alerts are authored, end the drill, and confirm the resulting summary reports an alert count of 2.

**Acceptance Scenarios**:

1. **Given** a drill during which N exercise CAP alerts were authored, **When** an admin ends the drill, **Then** the drill's summary records that count.
2. **Given** a drill during which zero exercise CAP alerts were authored, **When** an admin ends the drill, **Then** the summary records a count of zero (not absent/undefined).

---

### Edge Cases

- What happens if two drills are started for the same country at the same time? Out of scope for this spec to prevent (existing `drill_sessions` behavior, unchanged); a new CAP draft in that country is flagged exercise as long as at least one active drill exists for it, regardless of how many.
- What happens to an exercise alert if an operator attempts to manually broadcast it expecting real dispatch (e.g. thinking the drill already ended)? Dispatch is still blocked (Story 2 is unconditional on the alert's own flag, not on whether the drill is still active) — the alert was flagged as exercise at creation time and that flag never changes.
- What happens when an exercise alert is viewed through the public-facing alert portal? It is expected to never appear there in the first place, since it was never really dispatched/publicly broadcast in the sense the portal cares about — this spec does not need to add portal-specific filtering beyond ensuring no dispatch/receipt records exist to surface.
- What happens if a country has no active drill and an operator manually wants to test alert authoring without any real risk? Out of scope for this iteration — manual/forced exercise-flagging of an alert outside an active drill is not required by any acceptance scenario here (a drill must be started first).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST automatically flag a newly created CAP alert as an exercise alert if, at the moment of creation, an active drill session exists for that alert's country.
- **FR-002**: The system MUST leave a CAP alert's exercise flag fixed for its entire lifecycle once set at creation — ending the originating drill session MUST NOT retroactively change any already-created alert's flag.
- **FR-003**: The system MUST prevent any real dispatch (email or WhatsApp) from being initiated for an exercise-flagged CAP alert, regardless of which code path transitions it to broadcast status, with no exception path.
- **FR-004**: The system MUST continue to dispatch non-exercise CAP alerts exactly as today when they reach broadcast status (no regression to existing dispatch behavior).
- **FR-005**: The system MUST display a persistent, unmistakable "EXERCISE ONLY" indicator on every exercise-flagged CAP alert, at every status, everywhere that alert is shown to a user.
- **FR-006**: The system MUST record, on a drill session's summary when it ends, the count of exercise CAP alerts that were authored during that drill (a value of zero when none were authored, not an absent field).

### Key Entities

- **CAP Alert (`cap_drafts`)** *(existing entity, extended)*: gains an exercise flag, set once at creation based on whether an active drill exists for its country at that moment; never changed afterward.
- **Drill Session (`drill_sessions`)** *(existing entity, extended)*: its existing summary (already recording duration) gains an alert count reflecting exercise alerts authored during that session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of CAP alerts authored while a drill is active for their country are automatically flagged as exercise, with zero manual operator action required.
- **SC-002**: 100% of exercise-flagged alerts that reach broadcast status result in zero real dispatch attempts — verifiable by inspecting dispatch records after the fact.
- **SC-003**: An operator or reviewer can distinguish an exercise alert from a real one within one glance, at any point in its lifecycle, with no possibility of misreading it as real.
- **SC-004**: A completed drill's summary accurately reflects the number of exercise alerts authored during it.

## Assumptions

- "Active drill session for a country" means an existing `drill_sessions` row with `status = 'active'` and matching `country_code`, per the table already introduced prior to this spec — this spec does not change how a drill itself is started, ended, or scoped, only what happens to CAP alerts authored while one is active.
- This spec does not address drill *simulation* content (injecting fake hazard events, simulated sensor data) — it addresses only the CAP-authoring/dispatch-isolation half of drill mode, which is the safety-critical gap. Simulated hazard injection, response-time timers, and participation/acknowledgment metrics (also named in the SRS under this module) remain out of scope for this iteration.
- The existing `notify_dispatch_on_broadcast()` trigger (spec 009) is the single, authoritative place where real dispatch is initiated for any broadcast CAP alert — blocking it there is sufficient to satisfy FR-003 with no other dispatch-initiating code path to account for.
- No changes to `dispatch_jobs`/`dispatch_receipts` RLS or state machine are needed — this spec prevents those rows from ever being created for exercise alerts in the first place, rather than changing how they behave once created.
