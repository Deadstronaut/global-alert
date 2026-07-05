import { describe, it, expect } from 'vitest'
import {
  TRANSITIONS,
  allowedTransitions,
  isDraftCompleteForApproval,
  canUserActOnDraft,
} from '@/lib/capStateMachine.js'

describe('CAP draft transitions', () => {
  it('allows draft -> pending_approval and draft -> cancelled', () => {
    expect(allowedTransitions('draft')).toEqual(['pending_approval', 'cancelled'])
  })

  it('allows pending_approval -> approved/rejected/cancelled', () => {
    expect(allowedTransitions('pending_approval')).toEqual(['approved', 'rejected', 'cancelled'])
  })

  it('allows approved -> broadcast/cancelled', () => {
    expect(allowedTransitions('approved')).toEqual(['broadcast', 'cancelled'])
  })

  it('allows broadcast -> false_alarm/all_clear/expired/cancelled', () => {
    expect(allowedTransitions('broadcast')).toEqual(['false_alarm', 'all_clear', 'expired', 'cancelled'])
  })

  it('newly allows rejected -> draft (resubmission)', () => {
    expect(allowedTransitions('rejected')).toEqual(['draft'])
  })

  it('treats cancelled/expired/false_alarm/all_clear as terminal', () => {
    expect(allowedTransitions('cancelled')).toEqual([])
    expect(allowedTransitions('expired')).toEqual([])
    expect(allowedTransitions('false_alarm')).toEqual([])
    expect(allowedTransitions('all_clear')).toEqual([])
  })

  it('returns empty array for an unknown status', () => {
    expect(allowedTransitions('bogus')).toEqual([])
  })
})

describe('isDraftCompleteForApproval', () => {
  const completeDraft = {
    title: 'Earthquake warning',
    description: 'A magnitude 4.7 quake was detected.',
    instructions: 'Move to open ground.',
    area_desc: 'Istanbul, Kadikoy',
    severity: 'high',
    certainty: 'observed',
    urgency: 'immediate',
    hazard_type: 'earthquake',
  }

  it('reports complete when all required fields are present', () => {
    expect(isDraftCompleteForApproval(completeDraft)).toEqual({ complete: true, missing: [] })
  })

  it.each([
    'title', 'description', 'instructions', 'area_desc',
    'severity', 'certainty', 'urgency', 'hazard_type',
  ])('reports %s as missing when empty', (field) => {
    const draft = { ...completeDraft, [field]: '' }
    const result = isDraftCompleteForApproval(draft)
    expect(result.complete).toBe(false)
    expect(result.missing).toContain(field)
  })

  it('reports multiple missing fields at once', () => {
    const result = isDraftCompleteForApproval({ ...completeDraft, title: '', description: '   ' })
    expect(result.complete).toBe(false)
    expect(result.missing).toEqual(expect.arrayContaining(['title', 'description']))
  })
})

describe('canUserActOnDraft (four-eyes)', () => {
  const draft = { created_by: 'user-a', last_edited_by: 'user-b' }

  it('denies the original author', () => {
    expect(canUserActOnDraft(draft, 'user-a')).toBe(false)
  })

  it('denies the last editor', () => {
    expect(canUserActOnDraft(draft, 'user-b')).toBe(false)
  })

  it('allows a different user', () => {
    expect(canUserActOnDraft(draft, 'user-c')).toBe(true)
  })

  it('denies when draft or userId is missing', () => {
    expect(canUserActOnDraft(null, 'user-c')).toBe(false)
    expect(canUserActOnDraft(draft, null)).toBe(false)
  })
})

describe('TRANSITIONS table shape', () => {
  it('has an entry for every known status', () => {
    const statuses = ['draft', 'pending_approval', 'approved', 'broadcast', 'rejected', 'cancelled', 'expired', 'false_alarm', 'all_clear']
    statuses.forEach((s) => expect(TRANSITIONS).toHaveProperty(s))
  })
})
