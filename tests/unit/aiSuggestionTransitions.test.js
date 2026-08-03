import { describe, it, expect } from 'vitest'
import { allowedTransitions, isValidTransition, isTerminal } from '@/lib/aiSuggestionStateMachine.js'

describe('ai_suggestions transitions (spec 051)', () => {
  it('allows pending -> approved/approved_edited/rejected/ignored/failed', () => {
    expect(allowedTransitions('pending')).toEqual([
      'approved',
      'approved_edited',
      'rejected',
      'ignored',
      'failed',
    ])
  })

  it('treats approved/approved_edited/rejected/ignored/failed as terminal', () => {
    for (const status of ['approved', 'approved_edited', 'rejected', 'ignored', 'failed']) {
      expect(allowedTransitions(status)).toEqual([])
      expect(isTerminal(status)).toBe(true)
    }
  })

  it('rejects a terminal status trying to move anywhere else', () => {
    expect(isValidTransition('approved', 'rejected')).toBe(false)
    expect(isValidTransition('rejected', 'approved')).toBe(false)
  })

  it('rejects a no-op transition to the same status', () => {
    expect(isValidTransition('pending', 'pending')).toBe(false)
  })

  it('accepts each valid pending -> terminal move', () => {
    for (const status of ['approved', 'approved_edited', 'rejected', 'ignored', 'failed']) {
      expect(isValidTransition('pending', status)).toBe(true)
    }
  })
})
