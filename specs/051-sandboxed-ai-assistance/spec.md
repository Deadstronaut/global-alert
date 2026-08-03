# Feature Specification: Sandboxed AI Assistance

**Feature Branch**: `051-sandboxed-ai-assistance`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Introduce strictly scoped, non-decision-making AI/ML assistance into the platform. AI must never produce or influence risk scores, alert triggers, dispatch decisions, or any life-safety determination. AI is confined to isolated, human-reviewed support tasks only, each independently toggleable per country/admin config, with every AI output clearly labeled as AI-generated and requiring human confirmation before it has any downstream effect. Allowed tasks: (1) SOP/incident report summarization, (2) alert/public-content translation, (3) community hazard report photo pre-classification, (4) passive anomaly flagging on ingested hazard data. Forecasting, risk scoring, cascading-risk rules, and the alert/dispatch approval workflow remain fully deterministic and untouched."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draft translation of alert content (Priority: P1)

A country_admin in a multilingual country (e.g., Malaysia) authors an alert or public-facing SOP notice in one language. Before publishing, they want a starting-point translation into the country's other official/supported locales instead of writing each by hand.

**Why this priority**: Directly reduces time-to-publish for multilingual alerts without touching the CAP authoring/approval workflow (spec 006/009) — highest-value, lowest-risk capability since translation errors are visually obvious to a bilingual reviewer.

**Independent Test**: Can be fully tested by enabling the translation capability for a country, drafting alert text in the source language, requesting an AI translation into a target locale, editing/approving it, and confirming the original-language text remains the system of record while the approved translation is stored as a labeled, human-approved secondary field.

**Acceptance Scenarios**:

1. **Given** the translation capability is enabled for a country, **When** an authorized user requests an AI translation of alert or SOP text into a supported locale, **Then** the system displays the draft translation labeled "AI-suggested — review required" alongside the original text, with no auto-save or auto-publish.
2. **Given** an AI-drafted translation is displayed, **When** the reviewer edits and approves it, **Then** the approved text is stored as the locale's content and the approval action (actor, timestamp, original AI output, final approved text) is written to the audit log.
3. **Given** an AI-drafted translation is displayed, **When** the reviewer rejects it without approving, **Then** no translated content is saved and the rejection is logged.
4. **Given** the translation capability is disabled for a country, **When** a user views the alert/SOP authoring screen, **Then** no AI translation option is shown.

---

### User Story 2 - Summarize SOP documents and incident reports (Priority: P2)

An operator managing a long SOP document (spec 033) or a lengthy incident timeline (spec 011/026) wants a concise summary to speed up review, without the summary silently becoming the record of truth.

**Why this priority**: High convenience value for operators dealing with long-form text, but lower urgency than translation since it doesn't gate publishing of anything public-facing.

**Independent Test**: Can be fully tested by enabling the summarization capability, requesting a summary of an existing SOP document or incident report, and confirming the summary is shown as a clearly labeled, non-authoritative addendum that requires explicit save/approval before it is stored or shown to other users.

**Acceptance Scenarios**:

1. **Given** the summarization capability is enabled, **When** a user requests a summary of an SOP document or incident report, **Then** the system generates a draft summary labeled "AI-suggested — review required" that is not visible to other users until approved.
2. **Given** a draft AI summary, **When** the requesting user approves it, **Then** the summary is attached to the source document/report as a reviewed addendum, and the approval is audit-logged with a reference to the source content version.
3. **Given** a draft AI summary, **When** the user discards it, **Then** nothing is persisted and no other user ever sees the discarded draft.

---

### User Story 3 - Pre-classify community hazard report photos (Priority: P2)

A moderator triaging incoming community hazard reports (spec 036) wants a suggested hazard category for an uploaded photo to speed up sorting, while retaining full authority over the final category and accept/reject decision.

**Why this priority**: Meaningful triage-speed benefit in high-volume periods, but strictly assistive — the existing moderation decision authority and workflow (spec 036) are unchanged.

**Independent Test**: Can be fully tested by enabling the photo pre-classification capability, submitting a community hazard report with a photo, and confirming the moderator queue shows an AI-suggested category badge that the moderator can accept, override, or ignore — with the final stored category always reflecting the moderator's choice, never the AI's alone.

**Acceptance Scenarios**:

1. **Given** the photo pre-classification capability is enabled, **When** a community hazard report with a photo is submitted, **Then** the moderator queue displays an AI-suggested hazard category labeled "AI-suggested — review required" next to the report, without altering the report's stored category field.
2. **Given** an AI-suggested category is displayed, **When** the moderator accepts, overrides, or ignores the suggestion, **Then** the final category persisted is exactly the moderator's selection, and whether the moderator's choice matched the AI suggestion is recorded in the audit log.
3. **Given** the photo pre-classification capability is disabled for a country, **When** a moderator opens the triage queue, **Then** no AI suggestion is shown and the existing spec 036 moderation flow is unchanged.

---

### User Story 4 - Passive anomaly flags on ingested hazard data (Priority: P3)

An operator monitoring live hazard data streams (earthquake, flood, wildfire, etc. feeds) wants a passive visual cue when an incoming data point looks statistically unusual compared to recent history for that source, so they know where to look first — without any automated action being taken.

**Why this priority**: Useful situational-awareness aid but the lowest priority since it has no workflow-blocking effect and the existing monitoring dashboards already function without it.

**Independent Test**: Can be fully tested by enabling the anomaly-flagging capability, ingesting a data point that deviates significantly from recent history for its source/hazard type, and confirming a passive badge/flag appears in the admin dashboard for that record — with no risk score change, no alert creation, and no dispatch triggered as a result.

**Acceptance Scenarios**:

1. **Given** the anomaly-flagging capability is enabled for a country, **When** an ingested hazard data point deviates significantly from recent historical patterns for its source, **Then** the admin dashboard displays a passive "AI-flagged — unusual pattern" badge on that record.
2. **Given** an anomaly flag is displayed, **When** an operator views or dismisses it, **Then** the dismissal is logged but no risk score, alert, cascading-risk rule, or dispatch is created, modified, or triggered by the flag itself, either automatically or as a side effect of dismissal.
3. **Given** the anomaly-flagging capability is disabled, **When** hazard data is ingested, **Then** no anomaly evaluation runs and no flags appear.

---

### Edge Cases

- What happens when the external AI provider is unreachable or times out? The requesting workflow (translation, summarization, classification, anomaly check) MUST fail gracefully and let the user proceed with the existing manual, non-AI path — it MUST NOT block alert authoring, SOP editing, report moderation, or data ingestion.
- What happens when a country disables an AI capability while a draft AI suggestion is already on-screen for a user? The in-progress draft may still be reviewed/discarded by that user, but no new AI requests for that capability may be initiated for that country.
- How does the system handle a user attempting to approve/publish AI-suggested content without having reviewed it (e.g., scripted/rapid clicking)? Each approval action MUST require the AI-suggested content to have been rendered to the reviewer in the same session before an approve action is accepted.
- What happens if the AI suggestion is identical to leaving the field blank or unmodified (e.g., empty photo classification)? The system MUST treat "no suggestion" as a valid outcome and not force a moderator/reviewer to pick from an empty result.
- What happens when a role without AI-capability permission attempts to trigger an AI request directly (e.g., via API)? The request MUST be rejected with the same authorization checks used for the underlying feature (SOP edit, translation, moderation, dashboard view).
- How is audit-log integrity maintained when an AI suggestion is edited before approval? The audit record MUST capture both the original AI output and the final human-approved content, so edits are distinguishable from verbatim acceptance.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a per-country admin setting to independently enable or disable each of the four AI capabilities (translation, summarization, photo pre-classification, anomaly flagging), consistent with the existing country-scoping/federation model.
- **FR-002**: System MUST NOT allow any AI capability to write, modify, or influence the INFORM-style composite risk index, its component indicators (spec 039), cascading hazard risk rules (specs 048/049), alert content approval/CAP authoring/dispatch state (specs 006/009), or hazard forecasting/monitoring ingestion values (fetch-earthquakes, fetch-floods, etc.) under any circumstance.
- **FR-003**: System MUST label every AI-generated output visible to a user with a clear, non-dismissible-until-reviewed indicator (e.g., "AI-suggested — review required") distinguishing it from human-authored or system-computed content.
- **FR-004**: System MUST require an explicit human action (approve, accept, override, or discard) before any AI-generated output has any persisted or downstream effect; no AI output may be auto-saved, auto-published, or auto-applied.
- **FR-005**: System MUST record an audit log entry for every AI suggestion generated and its resolution (approved as-is, approved with edits, overridden, rejected, or ignored/timed out), including actor, timestamp, capability type, the original AI output, and the final human-determined outcome, appended to the existing tamper-evident audit log.
- **FR-006**: System MUST preserve the original human-authored source text/data as the system of record whenever an AI capability (e.g., translation, summarization) produces a derived artifact; the derived artifact is always secondary and clearly attributed.
- **FR-007**: System MUST NOT introduce any new alert dissemination channel and MUST NOT allow any AI capability to bypass, shortcut, or auto-satisfy the existing four-eyes alert approval workflow.
- **FR-008**: System MUST fail open to the pre-existing manual workflow (no AI assistance available, but the underlying feature — authoring, moderation, monitoring — remains fully usable) whenever the AI provider is unavailable, errors, times out, or returns an unusable result.
- **FR-009**: System MUST restrict who can invoke each AI capability to users who already hold the authorization required for the underlying action (e.g., only users who can edit an SOP may request an SOP summary; only users who can moderate community reports may request a photo pre-classification).
- **FR-010**: System MUST NOT transmit end-user personal data beyond what is minimally required for the requested AI task (e.g., photo pre-classification MUST NOT include reporter identity/contact fields in the data sent to the AI provider).
- **FR-011**: Anomaly flagging MUST be presented as a passive, dismissible indicator only; dismissing or ignoring a flag MUST have zero effect on any risk score, alert, or dispatch, and MUST NOT itself be interpreted as confirmation or denial of a real hazard.
- **FR-012**: System MUST make the choice of AI provider/model configurable per deployment (not hard-coded to a single vendor), consistent with the self-hosted/federated deployment model where each country instance may need its own provider and API key configuration.

### Key Entities

- **AICapabilityConfig**: Per-country record of which AI capabilities (translation, summarization, photo pre-classification, anomaly flagging) are enabled, and any provider/model configuration needed to invoke them.
- **AISuggestion**: A single AI-generated draft (translation text, summary text, category suggestion, or anomaly flag) tied to a source entity (alert, SOP document, incident report, community hazard report, or ingested data point), its capability type, generation timestamp, and current resolution state (pending, approved, approved-with-edits, rejected, ignored/expired).
- **AISuggestionAuditRecord**: Extension of the existing audit log entry shape capturing capability type, source entity reference, original AI output, final human-approved output (if any), acting user, and timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of AI-generated content shown to any user carries a visible "AI-suggested — review required" label before any approval action is possible.
- **SC-002**: 100% of AI suggestions that result in a persisted change have a corresponding audit record capturing the original AI output and the human-approved final output.
- **SC-003**: Zero AI-generated outputs affect a risk score, cascading-risk rule, alert/dispatch state, or forecasting/monitoring value, verified across all four capabilities.
- **SC-004**: When the AI provider is unavailable, 100% of the underlying manual workflows (alert authoring, SOP editing, report moderation, data monitoring) remain fully functional with no user-facing blocking error.
- **SC-005**: Country admins can enable or disable any single AI capability for their country in under 1 minute, with the change taking effect for new requests immediately (no deployment/restart required).
- **SC-006**: Moderators using photo pre-classification report reduced average time-to-categorize community hazard reports compared to the pre-AI baseline, without a reduction in categorization accuracy (measured against moderator's own final decision as ground truth).

## Assumptions

- **New external dependency flagged for approval**: This feature requires calling an external AI/LLM provider (e.g., for text summarization, translation, and image classification) from a Supabase Edge Function, similar in pattern to the existing Email/WhatsApp dispatch adapters. Per the constitution's Scope Constraints, this is noted here explicitly as a technology addition outside the current stack list (Vue 3, Pinia, Vite, Leaflet, globe.gl, h3-js, Supabase/Deno, Capacitor, vue-i18n) for explicit approval before planning proceeds. It is treated as an outbound API integration analogous to the existing external hazard-data fetchers and dispatch providers, not a new architectural layer.
- Each country/deployment is assumed to be able to supply its own AI provider API credentials (or explicitly leave a capability disabled), consistent with the self-hosted federation model where shared-cloud-only configuration is not acceptable long-term.
- "Significant deviation" for anomaly flagging is assumed to use a simple statistical threshold (e.g., standard-deviation-based comparison against recent history per source/hazard type) rather than a trained model, to keep the flagging logic itself auditable; the exact threshold is a planning-phase detail, not a scope question.
- Supported translation locales are assumed to match the 7 locales already supported by the i18n system (tr, en, es, fr, ru, ar, zh); RTL correctness for Arabic AI-translated content must still satisfy existing Principle VI requirements.
- Photo pre-classification is assumed to reuse the existing hazard-type taxonomy (specs 010/024) as its suggestion vocabulary rather than introducing a new category system.
- No new user-facing dissemination channel, and no change to who may approve/dispatch a CAP alert, is in scope — this is a hard boundary per Principle II carried into this feature rather than an open question.
