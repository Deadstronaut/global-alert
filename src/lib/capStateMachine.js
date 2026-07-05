// Pure CAP draft state-machine logic (spec 006) — mirrors the DB-level
// guard_cap_draft_transition() trigger so the UI can pre-check without a
// round-trip, but the trigger remains the real enforcement point since
// CapView.vue writes to Supabase directly from the browser.

export const TRANSITIONS = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['broadcast', 'cancelled'],
  broadcast: ['false_alarm', 'all_clear', 'expired', 'cancelled'],
  rejected: ['draft'],
  cancelled: [],
  expired: [],
  false_alarm: [],
  all_clear: [],
};

export function allowedTransitions(status) {
  return TRANSITIONS[status] || [];
}

const REQUIRED_FIELDS = [
  'title', 'description', 'instructions', 'area_desc',
  'severity', 'certainty', 'urgency', 'hazard_type',
];

export function isDraftCompleteForApproval(draft) {
  const missing = REQUIRED_FIELDS.filter((field) => !String(draft?.[field] ?? '').trim());
  return { complete: missing.length === 0, missing };
}

// Mirrors the trigger's four-eyes check: the acting user must not be the
// draft's author or last editor when moving it out of pending_approval.
export function canUserActOnDraft(draft, userId) {
  if (!draft || !userId) return false;
  return draft.created_by !== userId && draft.last_edited_by !== userId;
}
