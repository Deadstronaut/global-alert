# MHEWS — Administration Panel User Guide

## Purpose and Scope

This document describes the Administration Panel of the MHEWS (Multi-Hazard
Early Warning System) platform. It is intended for system administrators,
national authorities, and organizational operators who configure, populate,
and monitor the platform after deployment.

The Administration Panel is accessible to authenticated users holding an
administrative role. It is organized into sixteen functional sections
("tabs"), each governing a distinct area of the system's data or operations.

---

## 1. Role Model and Access Control

Access to each section of the Administration Panel is governed by a
role-based permission model. Understanding this model is a prerequisite to
understanding what any individual user is permitted to see or change.

| Role | Scope | Description |
|---|---|---|
| **Super Admin** | Global (all countries) | Full access to every section, including delegation of specific capabilities to other roles. A Super Admin whose country assignment is left blank has visibility across all onboarded countries. |
| **Country Admin** | Single country | Full administrative access restricted to the country to which the account is assigned. |
| **Org Admin** | Single organization | Access restricted to records belonging to their organization (e.g., a specific emergency-response agency or ministry unit). |
| **Viewer** | Read-only | No write access; used for observers, auditors without edit rights, or trainees. |

In addition to these base roles, the Super Admin may grant individual
**capability permissions** to a non-Super-Admin user for specific
administrative modules — namely *Hazard Taxonomy*, *SOP Repository*, *Map
Layers*, and *Audit*. This allows delegation of a narrow area of
responsibility (for example, allowing a subject-matter expert to maintain
the hazard taxonomy without granting them full administrative rights).

**Multi-country design.** The platform is explicitly architected for use by
more than one country simultaneously. Nearly every data table — user
profiles, organizations, drills, data sources, and every hazard-event table
(earthquake, wildfire, flood, drought, food security, tsunami, cyclone,
volcano, epidemic) — carries a `country_code` field used to scope records
and enforce data isolation between countries. A dedicated onboarding
workflow (Section 7, *Boundary Data*) exists specifically to register a new
country's administrative boundary before that country begins operating on
the platform. No component inspected during this review hardcodes a single
country; country-specific text in the interface (e.g. sample email
addresses, placeholder agency names) is illustrative only, not functional
logic. **Conclusion: any country may be onboarded and operated
independently on this platform**, provided a Country Admin account and
boundary data are configured for it.

---

## 2. Users

**Purpose.** Create and manage user accounts, assign roles, and control
account-level access scope.

**How it works.** An administrator creates a user record by supplying:
- **Email** (required) — used for the account invitation and sign-in.
- **Full name**.
- **Role** — selected from the roles the administrator is permitted to
  grant (a Country Admin, for instance, cannot create another Super Admin).
- **Country Code** (two-letter) — restricts the account's visibility to that
  country. This field is editable only by a Super Admin; leaving it blank
  grants access across all countries and should be reserved for Super Admin
  accounts.
- **Organization ID** — links the account to a specific organization.
- **Region/Province Code** (optional) — for further sub-national scoping.

**Ongoing management.** From the same screen, an administrator can: edit a
user's role, country, or organization; suspend or reactivate an account;
revoke elevated privileges (demoting a user to Viewer); and unlock an
account that has been automatically locked after repeated failed sign-in
attempts. Super Admins additionally see and manage per-user capability
grants (see Section 1) and can export a full access-review report (CSV or
JSON) for compliance purposes.

**Who can use this tab.** Creation and editing require administrative
rights (Super Admin or Country Admin). Capability grants and suspend/
reactivate controls are visible to Super Admins and Country Admins only.

---

## 3. Organizations

**Purpose.** Register and maintain the organizational hierarchy operating
within each country — e.g. a national disaster-management authority and its
subordinate regional offices.

**How it works.** An administrator enters:
- **Name** (required).
- **Country Code** — the country the organization belongs to.
- **Type** — selected from a predefined list of organization types (e.g.
  government agency, NGO, first-responder unit).
- **Parent Organization ID** (optional) — establishes a hierarchical
  relationship, allowing a national authority to have subordinate regional
  or local organizations nested beneath it.

This hierarchy is later used throughout the platform to scope user
accounts (Section 2), assigned citizen reports (Section 16), and
notification targeting (Section 8).

**Who can use this tab.** Creation is restricted to administrators (Super
Admin or Country Admin).

---

## 4. Drill / Exercise

**Purpose.** Plan, run, and record emergency-preparedness drills and
simulation exercises, independent of real hazard data.

**How it works.** An administrator starts a drill session by specifying:
- **Drill Title** (required).
- **Country**.
- **Scenario Type** — one of earthquake, flood, wildfire, tsunami, or
  multi-hazard.

While a drill is active, administrators may inject simulated hazard events
(hazard type, coordinates, severity, description) to exercise the response
workflow exactly as a real event would trigger it, without affecting live
production data. After the exercise, participants can record structured
feedback (lessons learned, related hazard type), and a summary of the drill
can be exported as CSV or JSON for after-action review and — where
required — for regulatory reporting (see also Section 14, *Audit*, which
retains scheduled annual drill reports).

**Who can use this tab.** Managing and concluding drills requires
administrative rights.

---

## 5. Data Sources

**Purpose.** Configure and monitor the external feeds that the backend
aggregator polls to ingest hazard data automatically (see the aggregator
architecture described in `HOW_TO_USE.md`, Section 11).

**How it works.** Each source entry defines a name, hazard type, upstream
endpoint, and polling behavior. Sources are displayed in two groups:
- **Global Sources** — feeds available to all countries (e.g. USGS, GDACS,
  NASA FIRMS).
- **Local Sources** — feeds specific to one country (e.g. a national
  seismological agency), tagged with a country badge visible to Super
  Admins.

A health panel alongside each source shows its current operational state
and recent activity, including any rejected payloads, allowing an
administrator to detect a broken or misconfigured feed without inspecting
server logs.

**Who can use this tab.** Managing sources requires the source-management
permission, held by administrators.

---

## 6. File Upload

**Purpose.** Bulk-import historical or third-party hazard data from a file
rather than waiting for automated ingestion.

**How it works.** An administrator selects:
- **Hazard Type** — determines the destination table (earthquake, wildfire,
  flood, drought, or food security).
- **Country Code**.
- **Source Name** — recorded against every imported row for traceability.
- **Column Mapping** — an interactive mapping tool that aligns the columns
  of the uploaded file to the fields expected by the target table (for
  example, mapping a file's "Mag" column to the system's "magnitude"
  field).

Upon import, the system reports how many records were successfully
inserted and how many were rejected (e.g. due to missing coordinates or
malformed values), allowing the administrator to correct and re-upload a
failed subset.

**Who can use this tab.** Administrator access only.

---

## 7. Boundary Data

**Purpose.** Register or update the geographic administrative boundary of a
country. This is the key step in **onboarding a new country** to the
platform.

**How it works.** An administrator supplies:
- **Country Code**.
- **Name Property** — the property within the uploaded geographic file that
  should be used as the human-readable boundary name.
- **Boundary File** — a geographic boundary file (GeoJSON) describing the
  country's or region's outline.

Once uploaded, the boundary becomes available for map rendering, hazard
containment checks (determining whether an event falls within a country's
territory), and reporting scoped to that geography.

**Who can use this tab.** Administrator access only. This tab should be one
of the first configured when adding a new country to the platform.

---

## 8. Contact Directory

**Purpose.** Maintain the list of individuals and channels that will
receive alert notifications.

**How it works.** Each contact record includes:
- **Full Name**, **Email**, **WhatsApp Number**.
- **Preferred Language**.
- **Hazard Type Filter** — restricts which hazard categories this contact
  should be notified about.
- **Country Code** and **Region Code** (optional) — scopes the contact
  geographically.
- **Notification Opt-ins** — separate toggles for email and WhatsApp
  delivery, respecting the contact's consent.

This directory is the recipient list consulted by the dispatch subsystem
(Section 9) when an alert is issued.

**Who can use this tab.** Available to administrators and organization
admins, allowing an organization to maintain its own contact list without
requiring country-level access.

---

## 9. Dispatch Tracking

**Purpose.** Monitor the delivery and acknowledgement status of alerts that
have already been sent to the contacts registered in Section 8.

**How it works.** This is primarily a monitoring view. It surfaces, per
dispatched alert: which jobs were created, which recipients received the
message, and which recipients acknowledged (or failed to acknowledge)
receipt. This provides accountability and traceability for every alert
issued by the system — a requirement in most early-warning regulatory
frameworks — and provides visibility needed to determine whether a
follow-up or retry is required.

**Who can use this tab.** Available to administrators and organization
admins.

---

## 10. Integrations

**Purpose.** Configure the outbound channels used to actually deliver
notifications — for example SMS gateways, WhatsApp Business API
credentials, or generic webhook endpoints.

**How it works.** Each integration is created from a predefined
**integration type** (which defines a template of required fields — API
keys, sender IDs, endpoint URLs, etc.) and then configured per organization
or country with the specific credentials and settings that organization
uses. The current connection status of each configured integration is
displayed, allowing an administrator to confirm a channel is correctly
wired before relying on it during a real event.

**Who can use this tab.** Available to administrators and organization
admins.

---

## 11. Hazard Taxonomy

**Purpose.** Define the catalogue of hazard types recognized by the
platform and the severity thresholds that classify an incoming event as
low, moderate, or severe.

**How it works.** An administrator with this capability can:
- Add or deactivate hazard type codes and their display names.
- Define default severity thresholds for each hazard type (for example,
  the magnitude ranges that separate a minor earthquake from a major one).
- Define **country- or organization-specific overrides** of those default
  thresholds, allowing one country's warning criteria to differ from
  another's based on local building codes, population density, or
  historical risk tolerance.

**Who can use this tab.** Restricted to Super Admins or users who have been
explicitly granted the `hazard_taxonomy` capability (see Section 1).

---

## 12. SOP Repository

**Purpose.** Maintain the library of Standard Operating Procedures (SOPs)
that responders should follow for each hazard type.

**How it works.** An administrator uploads a document (with a title, an
associated hazard type, and a version identifier). When a document is
updated, the previous version is retained in a version history, preserving
an auditable record of procedural changes over time. Documents can be
filtered by hazard type for quick retrieval during an active incident.

**Who can use this tab.** Restricted to Super Admins or users granted the
`sop_repository` capability.

---

## 13. Map Layers

**Purpose.** Register additional map overlay layers available to end users
on the situational map (for example, flood-risk zones, population density,
or infrastructure layers).

**How it works.** An administrator registers a layer's name, type, and
source, making it selectable as an overlay on the public-facing map
interface.

**Who can use this tab.** Restricted to Super Admins or users granted the
`map_layers` capability.

---

## 14. Audit

**Purpose.** Provide a read-only compliance and traceability view over
administrative actions and system-generated reports.

**How it works.** This section allows filtering of the audit log by table
(e.g. user profiles, organizations, alert drafts, security-recovery codes)
and by action type (creation, update, etc.). It also surfaces:
- A retry queue for audit records that failed to write on first attempt,
  ensuring no administrative action goes unlogged even under transient
  failure.
- Compliance reports, incident reports, and scheduled annual drill reports
  (see Section 4).

This section exists to satisfy governance and regulatory requirements that
every consequential action within the system be traceable to a specific
user, time, and change.

**Who can use this tab.** Restricted to Super Admins or users granted the
`audit` capability.

---

## 15. Impact Data

**Purpose.** Manage the exposure datasets (e.g. population, infrastructure,
or asset layers) used to estimate the potential impact of a hazard event on
a given area.

**How it works.** An administrator registers or updates a dataset that the
system's impact-estimation logic references when a hazard event occurs
within its geographic coverage — for instance, estimating how many people
reside within the affected radius of an earthquake.

**Who can use this tab.** Administrator access only.

---

## 16. Citizen Reports

**Purpose.** Review and act upon hazard reports submitted directly by the
public ("crowd-sourced" reporting), including any photographic evidence
attached.

**How it works.** This section is presented as two views:
- **Moderation view** (administrator access): lists all incoming citizen
  reports for review, verification, and moderation, including attached
  photographs.
- **Assigned Reports view** (organization admin access): shows only the
  reports that have been assigned to the signed-in user's organization for
  follow-up, without exposing the full national queue.

This structure allows a national authority to triage incoming public
reports and delegate specific ones to the responsible regional or local
organization for action.

**Who can use this tab.** Full moderation access is restricted to
administrators; organization admins see only the reports assigned to their
own organization.

---

## 17. Summary Table

| # | Tab | Primary Data Managed | Minimum Access Level |
|---|---|---|---|
| 1 | Users | User accounts, roles, country/org scope | Country Admin |
| 2 | Organizations | Organization hierarchy | Country Admin |
| 3 | Drill / Exercise | Simulated hazard drills, feedback | Country Admin |
| 4 | Data Sources | Automated ingestion feed configuration | Admin (source-management) |
| 5 | File Upload | Bulk historical/import data | Country Admin |
| 6 | Manual Entry | Single hazard event record | Country Admin |
| 7 | Boundary Data | Country/region geographic boundaries | Country Admin |
| 8 | Contact Directory | Alert recipient contacts | Org Admin |
| 9 | Dispatch Tracking | Alert delivery/acknowledgement status | Org Admin |
| 10 | Integrations | Outbound notification channel config | Org Admin |
| 11 | Hazard Taxonomy | Hazard types, severity thresholds | Super Admin / capability |
| 12 | SOP Repository | Standard Operating Procedures | Super Admin / capability |
| 13 | Map Layers | Map overlay layer registry | Super Admin / capability |
| 14 | Audit | Compliance and action logs | Super Admin / capability |
| 15 | Impact Data | Exposure/impact datasets | Country Admin |
| 16 | Citizen Reports | Public-submitted incident reports | Country Admin / Org Admin (assigned) |

---

## 18. Onboarding a New Country — Recommended Sequence

Given the platform's multi-country design, the following order is
recommended when activating the system for a new country:

1. **Boundary Data (§7)** — upload the country's administrative boundary
   so the map and geographic scoping function correctly.
2. **Organizations (§2)** — register the national authority and its
   subordinate organizations.
3. **Users (§2)** — create the Country Admin account, then invite
   subordinate Org Admin and Viewer accounts.
4. **Hazard Taxonomy (§11)** — review default hazard thresholds and define
   any country-specific overrides required by local regulation or risk
   tolerance.
5. **Data Sources (§5)** — enable relevant global sources and configure any
   local/national data feeds specific to the country.
6. **Contact Directory (§8) and Integrations (§10)** — populate notification
   recipients and configure the delivery channels used to reach them.
7. **SOP Repository (§12)** — upload the country's standard operating
   procedures for each hazard type.

Once these steps are complete, the platform is fully operational for the
new country, and its data will remain isolated from other onboarded
countries by the `country_code` scoping described in Section 1.
