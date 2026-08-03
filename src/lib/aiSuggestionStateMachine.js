// Pure ai_suggestions state-machine logic (spec 051) — mirrors the DB-level
// guard_ai_suggestion_transition() trigger so the UI can pre-check without a
// round-trip, but the trigger remains the real enforcement point since
// AiSuggestionBadge-hosting components write to Supabase directly from the
// browser (aiAssistance.js's resolveSuggestion()).

export const TRANSITIONS = {
  pending: ['approved', 'approved_edited', 'rejected', 'ignored', 'failed'],
  approved: [],
  approved_edited: [],
  rejected: [],
  ignored: [],
  failed: [],
};

export function allowedTransitions(status) {
  return TRANSITIONS[status] || [];
}

export function isValidTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return false;
  return allowedTransitions(fromStatus).includes(toStatus);
}

export function isTerminal(status) {
  return allowedTransitions(status).length === 0;
}
