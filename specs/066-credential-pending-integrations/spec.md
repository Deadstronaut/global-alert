# Feature Specification: Credential-Pending Integrations (Parking Doc)

**Feature Branch**: `066-credential-pending-integrations`

**Created**: 2026-08-10

**Status**: Parked — not implemented, tracked for when credentials are available

**Input**: User description: "From the MHEWS gap analysis, 4 of the 13 identified gaps need a
third-party account/API key this team doesn't hold, unlike specs 057-065 which needed only code.
Track them here instead of building scaffolding now, per generic-integration-credentials (spec
025) already covering the credential-storage half of this problem."

## Purpose

This is a tracking/parking document, not an implementation spec. Specs 057-065 cover every MHEWS
gap-analysis item that could be completed with code alone. The remaining 4 items below all share
one blocker: they need a real account/API key from an external provider that this project doesn't
currently hold. Spec 025 (Generic Integration Credentials Management) already provides the
mechanism to store whatever credential each of these turns out to need — a Super Admin registers a
new integration type there, and a country_admin/org_admin fills in its fields, with no new UI code
required for the common case. What's parked here is the actual data-fetching/sending code behind
each integration, which cannot be built and verified without real credentials to test against.

## Update 2026-08-10: satellite imagery unblocked

Item 2 below (satellite imagery) is **no longer parked**. The project owner registered a free
Copernicus Data Space Ecosystem (CDSE) account — the official ESA portal that hosts the same
Sentinel Hub API stack Sentinel Hub's commercial offering charges for, at no cost within a
generous free processing-unit quota — and generated an OAuth client. Implemented as **spec
067-satellite-imagery**; see that spec for the working implementation. Kept here only as a record
of why it was originally parked (the paid Sentinel Hub reseller pricing looked prohibitive before
the free CDSE path was found).

## Parked Items

### 1. NMHS / official risk data source adapter (Disaster Risk Knowledge pillar)

- **What's needed**: An official national meteorological/hydrological service (NMHS) API
  endpoint + credentials for at least one served country, to build a source-registry adapter
  analogous to `import-worldpop`/`import-country-risk-index` (spec 058).
- **Why parked**: No NMHS has yet provided this project with API access; the shape of a real
  NMHS API (auth scheme, data format) varies enough between countries that building a generic
  adapter without a concrete API to test against risks guessing wrong.
- **When unblocked**: Register a new spec-025 integration type for the specific NMHS API once a
  country's NMHS provides access; build a dedicated `import-<nmhs-name>` Edge Function following
  the existing `import-*` pattern.

### 2. ~~Satellite imagery ingestion~~ — DONE, see spec 067

Unblocked 2026-08-10 via the free Copernicus Data Space Ecosystem, not the paid Sentinel Hub
reseller originally assumed here. See `specs/067-satellite-imagery/spec.md`.

### 3. SMS / Cell Broadcast dispatch channel (Warning Dissemination pillar)

- **What's needed**: A telecom/SMS-gateway account (Twilio or a national telecom's own API).
- **Why parked**: Per `docs/mhewsprd.md`'s explicit scope constraints, SMS/cell broadcast was
  deliberately excluded from this deployment's dissemination channels (Email/WhatsApp/Web Portal
  only, later extended by spec 063's Web Push) — re-opening this scope is a product decision, not
  just an engineering one, and requires a paid account regardless.
- **When unblocked**: Extend `dispatch-alert`'s channel set following the exact pattern spec 063
  used for Web Push (extend `dispatch_receipts.channel`, `dispatchMatching.ts`'s
  `DispatchChannel` type, add an adapter under `shared/`), backed by whichever SMS provider a
  country_admin configures via spec 025.

### 4. WhatsApp Business (Meta Cloud API) real integration (Warning Dissemination pillar)

- **What's needed**: A verified Meta Business/WhatsApp Business Platform account and API
  credentials.
- **Why parked**: `dispatch-alert/index.ts`'s WhatsApp path is currently a documented mock (see
  its own inline `TODO`, spec 022's credential UI already exists via spec 025's generalization) —
  the architecture is ready, only the real Meta account is missing.
- **When unblocked**: This is the smallest lift of the four — swap the mock branch in
  `sendReceipt()`/`sendReceiptRetry()` (`dispatch-alert/index.ts`) for a real Meta Cloud API call
  reading `whatsapp_creds_<country_code>` from spec 025's credential store, exactly as the existing
  inline TODO comment already describes.

## Non-Goals

- No code changes ship with this spec — it exists purely so these 4 items aren't silently dropped
  from the MHEWS capacity picture, and so a future session with real credentials in hand has a
  concrete starting point for each.
