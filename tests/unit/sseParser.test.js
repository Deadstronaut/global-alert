import { describe, it, expect } from 'vitest'
import { parseSseBuffer } from '@/utils/sseParser.js'

describe('parseSseBuffer', () => {
  it('parses a single complete event', () => {
    const { events, remainder } = parseSseBuffer('event: report\ndata: {"id":"1"}\n\n')
    expect(events).toEqual([{ id: '1' }])
    expect(remainder).toBe('')
  })

  it('parses multiple complete events in one chunk', () => {
    const buffer = 'event: report\ndata: {"id":"1"}\n\nevent: report\ndata: {"id":"2"}\n\n'
    const { events, remainder } = parseSseBuffer(buffer)
    expect(events).toEqual([{ id: '1' }, { id: '2' }])
    expect(remainder).toBe('')
  })

  it('buffers an incomplete trailing event for the next call', () => {
    const { events, remainder } = parseSseBuffer('event: report\ndata: {"id":"1"}\n\nevent: report\ndata: {"id":"2"')
    expect(events).toEqual([{ id: '1' }])
    expect(remainder).toBe('event: report\ndata: {"id":"2"')
  })

  it('completes a buffered event once the rest arrives', () => {
    const first = parseSseBuffer('event: report\ndata: {"id":"2"')
    expect(first.events).toEqual([])
    const second = parseSseBuffer(first.remainder + '}\n\n')
    expect(second.events).toEqual([{ id: '2' }])
  })

  it('ignores heartbeat comment lines', () => {
    const { events } = parseSseBuffer(': heartbeat\n\n')
    expect(events).toEqual([])
  })

  it('skips a malformed data line without throwing', () => {
    const { events } = parseSseBuffer('event: report\ndata: {not valid json\n\nevent: report\ndata: {"id":"3"}\n\n')
    expect(events).toEqual([{ id: '3' }])
  })

  it('returns an empty result for an empty buffer', () => {
    const { events, remainder } = parseSseBuffer('')
    expect(events).toEqual([])
    expect(remainder).toBe('')
  })
})
