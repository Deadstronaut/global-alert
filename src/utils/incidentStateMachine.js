// Mirrors guard_incident_transition() in
// supabase/migrations/20260707140000_incident_state_guard.sql 1:1.
// Keep both in sync manually if the lifecycle rules ever change.

const ALLOWED_TRANSITIONS = {
  open: ['in_progress'],
  in_progress: ['monitoring', 'closed'],
  monitoring: ['closed'],
  closed: ['archived'],
  archived: [],
}

export function isValidIncidentTransition(from, to) {
  if (from === to) return false
  return (ALLOWED_TRANSITIONS[from] || []).includes(to)
}

export function requiresAAR(from, to) {
  return from === 'monitoring' && to === 'closed'
}

export function nextStatuses(from) {
  return ALLOWED_TRANSITIONS[from] || []
}
