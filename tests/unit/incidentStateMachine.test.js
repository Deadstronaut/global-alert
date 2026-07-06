import { describe, it, expect } from 'vitest'
import { isValidIncidentTransition, requiresAAR, nextStatuses } from '@/utils/incidentStateMachine.js'

describe('isValidIncidentTransition', () => {
  it('allows open -> in_progress', () => {
    expect(isValidIncidentTransition('open', 'in_progress')).toBe(true)
  })

  it('allows in_progress -> monitoring', () => {
    expect(isValidIncidentTransition('in_progress', 'monitoring')).toBe(true)
  })

  it('allows in_progress -> closed', () => {
    expect(isValidIncidentTransition('in_progress', 'closed')).toBe(true)
  })

  it('allows monitoring -> closed', () => {
    expect(isValidIncidentTransition('monitoring', 'closed')).toBe(true)
  })

  it('allows closed -> archived', () => {
    expect(isValidIncidentTransition('closed', 'archived')).toBe(true)
  })

  it('rejects open -> closed (skipping in_progress)', () => {
    expect(isValidIncidentTransition('open', 'closed')).toBe(false)
  })

  it('rejects open -> archived', () => {
    expect(isValidIncidentTransition('open', 'archived')).toBe(false)
  })

  it('rejects open -> monitoring', () => {
    expect(isValidIncidentTransition('open', 'monitoring')).toBe(false)
  })

  it('rejects in_progress -> archived', () => {
    expect(isValidIncidentTransition('in_progress', 'archived')).toBe(false)
  })

  it('rejects monitoring -> archived', () => {
    expect(isValidIncidentTransition('monitoring', 'archived')).toBe(false)
  })

  it('rejects monitoring -> in_progress (backward)', () => {
    expect(isValidIncidentTransition('monitoring', 'in_progress')).toBe(false)
  })

  it('rejects closed -> open', () => {
    expect(isValidIncidentTransition('closed', 'open')).toBe(false)
  })

  it('rejects any transition out of archived (terminal state)', () => {
    expect(isValidIncidentTransition('archived', 'open')).toBe(false)
    expect(isValidIncidentTransition('archived', 'closed')).toBe(false)
  })

  it('rejects same-state no-op transitions', () => {
    expect(isValidIncidentTransition('open', 'open')).toBe(false)
    expect(isValidIncidentTransition('monitoring', 'monitoring')).toBe(false)
    expect(isValidIncidentTransition('archived', 'archived')).toBe(false)
  })
})

describe('requiresAAR', () => {
  it('requires AAR only for monitoring -> closed', () => {
    expect(requiresAAR('monitoring', 'closed')).toBe(true)
  })

  it('does not require AAR for in_progress -> closed', () => {
    expect(requiresAAR('in_progress', 'closed')).toBe(false)
  })

  it('does not require AAR for closed -> archived', () => {
    expect(requiresAAR('closed', 'archived')).toBe(false)
  })

  it('does not require AAR for open -> in_progress', () => {
    expect(requiresAAR('open', 'in_progress')).toBe(false)
  })
})

describe('nextStatuses', () => {
  it('returns allowed next states for a given status', () => {
    expect(nextStatuses('open')).toEqual(['in_progress'])
    expect(nextStatuses('in_progress')).toEqual(['monitoring', 'closed'])
    expect(nextStatuses('monitoring')).toEqual(['closed'])
    expect(nextStatuses('closed')).toEqual(['archived'])
    expect(nextStatuses('archived')).toEqual([])
  })
})
