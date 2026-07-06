# Feature Specification: Hazard Taxonomy Hierarchy & Encyclopedia

**Feature Branch**: `024-hazard-taxonomy-hierarchy`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Hazard Taxonomy Admin modülünün spec 010/016/020'de bilinçli olarak ertelenmiş son 2 kalemi: (1) hiyerarşik hazard ilişkileri, (2) hazard ansiklopedisi UI'ı."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Super Admin defines a parent/child hazard relationship (Priority: P1)

A Super Admin managing the global hazard taxonomy wants to express that one hazard type is a
specialization of another (e.g., "Flash Flood" is a kind of "Flood"), so that the taxonomy
reflects real-world relationships instead of a flat, unrelated list.

**Why this priority**: This is the data-model foundation the encyclopedia view depends on —
without it, there is nothing to display as a hierarchy.

**Independent Test**: Can be fully tested by opening the hazard type edit form, assigning a
parent to a hazard type, saving, and confirming the taxonomy table now shows the relationship —
delivers value on its own even before the encyclopedia view exists (the admin table already
communicates the structure).

**Acceptance Scenarios**:

1. **Given** two active hazard types A and B, **When** a Super Admin edits B and selects A as its
   parent, **Then** the change is saved and the taxonomy table shows B's parent as A.
2. **Given** a hazard type A with no parent, **When** a Super Admin attempts to set A's parent to
   A itself, **Then** the system rejects the change with a clear error.
3. **Given** hazard type A is the parent of hazard type B, **When** a Super Admin attempts to set
   A's parent to B, **Then** the system rejects the change (a cycle) with a clear error.
4. **Given** a hazard type has an assigned parent, **When** a Super Admin clears the parent
   selection and saves, **Then** the hazard type becomes top-level (no parent) again.

---

### User Story 2 - Any signed-in user browses the hazard encyclopedia (Priority: P2)

Any signed-in user, including a Viewer, wants to look up what each hazard type means, how it is
categorized, how it relates to other hazard types, and what severity thresholds apply, so they
can understand alerts they receive without needing admin access.

**Why this priority**: Delivers the actual end-user-facing value of this spec, but depends on
User Story 1 existing so there is a hierarchy worth displaying (though the page still works, just
flat, if no relationships have been defined yet).

**Independent Test**: Can be fully tested by signing in as a Viewer, navigating to the new hazard
encyclopedia page, and confirming every active hazard type is listed with its description,
category, parent/children, and threshold breakpoints, with no admin-only UI elements present.

**Acceptance Scenarios**:

1. **Given** a signed-in Viewer, **When** they navigate to the hazard encyclopedia page, **Then**
   they see every active hazard type with its display name, category, and description.
2. **Given** a hazard type has a parent and/or children, **When** viewed on the encyclopedia page,
   **Then** the relationship is visibly shown (e.g., "Part of: Flood" and/or "Includes: Flash
   Flood").
3. **Given** a hazard type has configured severity thresholds, **When** viewed on the encyclopedia
   page, **Then** the breakpoints (severity level, minimum value, metric name/unit) are shown
   read-only.
4. **Given** a signed-in Viewer (not an admin), **When** they view the encyclopedia page, **Then**
   no edit/create/deactivate controls are present.
5. **Given** a hazard type is deactivated, **When** browsing the encyclopedia page, **Then** it is
   not listed (matches the existing active-only convention used elsewhere in the app).

---

### Edge Cases

- What happens when a hazard type's parent is deactivated? The parent/child relationship is
  unaffected (informational only); the encyclopedia page still shows the relationship using the
  parent's display name even though the parent itself won't appear as its own listed entry (FR-009).
- What happens when a hazard type has no threshold configuration at all? The encyclopedia page
  shows the hazard type without a thresholds section rather than an empty/broken table.
- What happens if a Super Admin tries to delete/deactivate a hazard type that is currently a
  parent of other hazard types? Deactivation proceeds (existing behavior unchanged); the affected
  children keep their `parent_code` value unless a Super Admin explicitly changes it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a Super Admin (or a country/org admin holding the existing
  `hazard_taxonomy` capability grant) to assign one existing active hazard type as the "parent" of
  another hazard type, or leave it unset.
- **FR-002**: System MUST reject an attempt to set a hazard type's parent to itself.
- **FR-003**: System MUST reject an attempt to create a cycle (e.g., A's parent is B while B's
  parent is already A, directly or transitively).
- **FR-004**: System MUST allow a hazard type to have any number of children, but at most one
  parent (a tree structure, not an arbitrary graph).
- **FR-005**: System MUST display each hazard type's parent (if any) in the existing admin
  taxonomy table.
- **FR-006**: System MUST provide a new page, reachable by every signed-in user regardless of
  role, that lists every active hazard type's display name, category, description, parent/children
  relationships, and severity threshold breakpoints, all read-only.
- **FR-007**: System MUST NOT expose any create/edit/deactivate controls on the new encyclopedia
  page — it is strictly a read-only reference view.
- **FR-008**: The encyclopedia page MUST remain reachable by a Viewer-role account specifically
  (not just admin roles), matching this project's existing precedent for life-safety/reference
  information (shelter availability).
- **FR-009**: The encyclopedia page MUST only list active hazard types, consistent with the
  existing active-only convention used elsewhere in this app's non-admin views.
- **FR-010**: System MUST continue to allow a hazard type to exist with no parent at all
  (top-level), which remains the default for both new and pre-existing hazard types.

### Key Entities

- **Hazard Type** (existing entity, extended): gains an optional reference to another Hazard Type
  representing its parent in the taxonomy tree. A Hazard Type may have zero or more children.
- **Hazard Threshold** (existing entity, unchanged): continues to describe the severity breakpoints
  used by a Hazard Type; now also surfaced read-only on the new encyclopedia page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Super Admin can assign or clear a hazard type's parent relationship in under 10
  seconds from the existing taxonomy admin screen.
- **SC-002**: 100% of invalid parent assignments (self-reference or cycle) are rejected before
  being saved, with zero cases of a corrupted/looping taxonomy tree occurring.
- **SC-003**: Any signed-in user, including a Viewer, can find a given hazard type's description,
  category, and severity thresholds without needing admin access, in a single page visit.
- **SC-004**: The encyclopedia page loads using only data already cached by the app at startup —
  no additional wait time is introduced beyond the app's existing initial load.

## Assumptions

- The existing `hazard_types`/`hazard_thresholds` global registry (spec 010) and the
  `hazard_taxonomy` capability grant (spec 018) remain the sole authorization mechanism for
  editing; this spec does not change who may edit hazard types, only what can be edited (adding a
  parent field) and adding a new read-only view.
- A hazard type may have only one parent (single-parent tree), not multiple parents (DAG) —
  sufficient for the real-world "specialization of" relationships this project needs (e.g., Flash
  Flood under Flood), avoiding unnecessary graph-traversal complexity (YAGNI).
- No search, filtering, or pagination is needed on the encyclopedia page — the hazard type list
  is small (9 seeded types plus any admin additions), so a simple full list is sufficient.
- The encyclopedia page requires the user to be signed in (consistent with the rest of the
  authenticated app shell) but not any particular role — mirroring spec 021's shelter-info
  precedent, not a fully public/anonymous page.
- Automatic or AI-assisted relationship suggestions are out of scope; parent assignment is always
  a manual Super Admin action.
