# Feature Specification: Drill Response-Time and Participation Metrics

**Feature Branch**: `017-drill-response-metrics`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Preparedness/Drill & Response modülünün spec 013'te açıkça ertelenen kalan kalemi: response-time timers ve participation/acknowledgment metrics. Şu an bir tatbikat bittiğinde sadece süre ve kaç uyarı yayınlandığı gösteriliyor; tatbikatın gerçek amacı olan 'ekip ne kadar hızlı tepki verdi' ve 'alıcılar uyarıyı gerçekten aldı mı/onayladı mı' sorularına cevap yok."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how quickly the team responded during a drill (Priority: P1)

After ending a drill, an administrator sees not just the drill's duration and how many exercise alerts were issued,
but how long it took from the drill starting until the first exercise alert was actually issued — the team's
real response latency.

**Why this priority**: This is the most basic, always-available signal a drill exists to produce: without knowing
response time, a drill's summary can't answer whether the team is getting faster or slower over time. It requires
no new infrastructure — the timestamps needed already exist.

**Independent Test**: Start a drill, wait a known interval, issue an exercise CAP alert, end the drill, and confirm
the summary shows a response-time value matching that known interval.

**Acceptance Scenarios**:

1. **Given** a drill is started and, some time later, an exercise CAP alert is issued during it, **When** the drill
   is ended, **Then** the summary shows the elapsed time between the drill starting and that first exercise alert
   being issued.
2. **Given** a drill is started and ended without any exercise alert ever being issued during it, **When** the
   summary is shown, **Then** it clearly indicates no response occurred, rather than showing a misleading zero or
   an error.
3. **Given** multiple exercise alerts were issued during a drill, **When** the summary is shown, **Then** the
   response-time value reflects the *first* one issued, not the last or an average.

---

### User Story 2 - See whether alert recipients actually acknowledged receiving the drill's alerts (Priority: P2)

After ending a drill, an administrator also sees what fraction of the alert's intended recipients actually
acknowledged receiving it, by clicking a simple confirmation link included in the alert they received.

**Why this priority**: Response-time alone tells you the team acted fast, but not whether the message actually
reached and registered with recipients — a core purpose of running a drill in the first place. This depends on
User Story 1's data existing (a drill must have issued at least one alert) and on recipients having a way to
acknowledge, so it's appropriately sequenced after the simpler, infrastructure-free metric.

**Independent Test**: Run a drill that dispatches to at least one contact, have that contact acknowledge via the
link they received, end the drill, and confirm the summary shows the correct acknowledgment count/rate.

**Acceptance Scenarios**:

1. **Given** a dispatched alert reached a recipient with an acknowledgment link, **When** the recipient clicks it,
   **Then** their acknowledgment is recorded exactly once, even if they click the link more than once.
2. **Given** a drill's exercise alerts were dispatched to several recipients, **When** the drill ends, **Then** the
   summary shows how many of those dispatches were acknowledged out of the total that were actually sent.
3. **Given** a drill whose alerts were dispatched but nobody acknowledged any of them, **When** the summary is
   shown, **Then** it clearly shows a zero acknowledgment rate, not a missing or broken metric.
4. **Given** an acknowledgment link for a dispatch that doesn't exist or was already handled, **When** it is
   visited, **Then** the visitor sees a clear, harmless confirmation-style page — never an application error.

### Edge Cases

- What happens when a drill is ended immediately after starting, before any dispatch has had time to complete? →
  Response time and acknowledgment rate both show "no data yet" rather than zero, since zero would misleadingly
  imply an instant (and therefore suspicious) response.
- What happens if an alert is dispatched to a recipient who has no reachable channel recorded (edge case already
  handled by existing dispatch matching)? → They were never actually sent an acknowledgment link, so they are
  correctly excluded from the acknowledgment rate's denominator, not counted as a non-acknowledger.
- What happens if the same acknowledgment link is visited from multiple devices/times? → The acknowledgment is
  recorded once (first visit); repeat visits show the same confirmation without creating duplicate records or
  errors.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a drill ends, the system MUST compute and display the elapsed time between the drill starting
  and the first exercise alert issued during it, if any.
- **FR-002**: When no exercise alert was issued during a drill, the system MUST clearly indicate that no response
  occurred, rather than displaying a zero or misleading value.
- **FR-003**: Every alert dispatch a recipient can reach MUST include a way for that recipient to confirm they
  received it.
- **FR-004**: The system MUST record at most one acknowledgment per dispatch, regardless of how many times a
  recipient confirms.
- **FR-005**: When a drill ends, the system MUST display the proportion of its exercise alert dispatches that were
  acknowledged, counted only against dispatches that were actually sent (not against recipients who were never
  reachable in the first place).
- **FR-006**: Visiting an acknowledgment confirmation for a dispatch that no longer exists or was already
  acknowledged MUST show a harmless confirmation-style result, never an application error.
- **FR-007**: Acknowledgment MUST work for both drill/exercise alerts and real alerts — the mechanism itself is the
  same regardless of exercise status; only the drill summary's aggregation is exercise-specific.

### Key Entities

- **Drill Session**: Existing entity (spec 013); gains two derived summary fields — the response-time value and
  the acknowledgment rate — computed when a drill ends, alongside its existing duration and alert-count fields.
- **Alert Dispatch**: Existing entity (a per-recipient, per-channel dispatch record, spec 009); gains an
  acknowledgment marker — whether and when its recipient confirmed receipt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can see a drill's response time and acknowledgment rate immediately upon ending it,
  with no manual calculation or cross-referencing required.
- **SC-002**: A recipient can acknowledge a dispatched alert in a single click, with no login or additional
  information required.
- **SC-003**: Acknowledging the same alert dispatch multiple times never produces an inconsistent or duplicated
  count in the drill summary.

## Assumptions

- "First exercise alert issued" is measured from the alert's creation, consistent with how spec 013's existing
  "alerts_issued" count already scopes drill activity (alerts created at or after the drill's start time, flagged
  exercise, in the drill's country).
- Acknowledgment is a lightweight, one-click confirmation (not a full read receipt, delivery proof, or
  two-way reply) — consistent with this system's existing dissemination channels (Email, WhatsApp mock, Web
  Portal) and its Simplicity/YAGNI posture; it measures recipient engagement, not technical delivery (which
  `dispatch_receipts.delivered_at` already covers separately).
- No new authentication is introduced for acknowledgment — the link itself is the credential, consistent with how
  the existing Public Alert Portal already requires no login.
- This feature applies the acknowledgment mechanism to all dispatches (not only exercise ones) since building two
  separate mechanisms for the same click-to-confirm action would be needless duplication; only the *drill summary
  view* is exercise-specific.
