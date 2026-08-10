# Feature Specification: Resource / Capacity Inventory

**Feature Branch**: `062-resource-capacity-inventory`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "MHEWS gap analysis (Preparedness & Response pillar): no field-capacity inventory exists (equipment, personnel, vehicles, supplies) — shelters track where people go, contacts track who to notify, but nothing tracks what response resources a country/org actually has on hand. New standalone module, no external dependency."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin records available response resources (Priority: P1)

An admin wants to record what personnel, equipment, vehicles, and supplies are available for
disaster response in their country/org, so this capacity is visible alongside the rest of the
preparedness picture (shelters, SOPs, drill readiness).

**Independent Test**: Open the Resource Inventory tab, add a resource with a type, name, quantity,
and status, save, and confirm it appears in the list.

**Acceptance Scenarios**:

1. **Given** an admin fills in a resource's type, name, quantity, and status, **When** they save,
   **Then** a new `resource_inventory` row is created scoped to their country.
2. **Given** an existing resource's status changes (e.g. from `available` to `deployed`),
   **When** an admin edits and saves it, **Then** the row updates in place (not duplicated) and
   `updated_at` reflects the change.
3. **Given** a country_admin/org_admin views the tab, **When** the list loads, **Then** only their
   own country's resources are visible (RLS-enforced, matching contacts/shelters).

### Edge Cases

- A resource with quantity 0 is valid (e.g. a fully depleted supply, tracked rather than deleted,
  so its depletion is visible rather than silently disappearing).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `resource_inventory` table with `resource_type` (personnel,
  equipment, vehicle, supply, other), `name`, `quantity`, `unit`, `status` (available, deployed,
  depleted, maintenance), `region_code`, and `notes`.
- **FR-002**: RLS MUST scope access identically to `contacts`/`shelters`: super_admin sees all;
  country_admin/org_admin see only their own country; no anon read (operationally sensitive, same
  class as `risk_indicators`).
- **FR-003**: The admin UI MUST provide create/edit/delete for resources, gated behind the same
  `canAdmin` check used by the adjacent Risk tab.
- **FR-004**: This feature MUST NOT alter shelters, contacts, or any other existing module — a
  new, independent table and tab.

### Key Entities

- **resource_inventory**: `country_code`, `org_id`, `resource_type`, `name`, `quantity`, `unit`,
  `status`, `region_code`, `notes`, `created_by`, `created_at`, `updated_at`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can record a new resource in under 30 seconds.
- **SC-002**: 100% of resource rows are correctly scoped by country under RLS (verified by the same
  test pattern used for contacts/shelters).

## Assumptions

- No linkage to dispatch/cascade rules is introduced in this iteration — this is a standalone
  inventory, matching the "fully completable now" classification from the MHEWS gap review. A
  future spec could link resources to cascade-rule recommendations or drill scenarios if needed
  (YAGNI for now).
