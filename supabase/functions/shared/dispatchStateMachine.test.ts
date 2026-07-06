import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { isValidJobTransition, isValidReceiptTransition } from './dispatchStateMachine.ts'

// DispatchJob transitions
Deno.test('job: queued -> running is valid', () => {
  assertEquals(isValidJobTransition('queued', 'running'), true)
})
Deno.test('job: running -> completed is valid', () => {
  assertEquals(isValidJobTransition('running', 'completed'), true)
})
Deno.test('job: running -> failed is valid', () => {
  assertEquals(isValidJobTransition('running', 'failed'), true)
})
Deno.test('job: queued -> completed is invalid (skips running)', () => {
  assertEquals(isValidJobTransition('queued', 'completed'), false)
})
Deno.test('job: completed -> running is invalid (terminal state)', () => {
  assertEquals(isValidJobTransition('completed', 'running'), false)
})
Deno.test('job: same-state is invalid', () => {
  assertEquals(isValidJobTransition('running', 'running'), false)
})

// DispatchReceipt transitions
Deno.test('receipt: queued -> sent is valid', () => {
  assertEquals(isValidReceiptTransition('queued', 'sent'), true)
})
Deno.test('receipt: queued -> failed is valid (send attempt itself errors)', () => {
  assertEquals(isValidReceiptTransition('queued', 'failed'), true)
})
Deno.test('receipt: sent -> delivered is valid', () => {
  assertEquals(isValidReceiptTransition('sent', 'delivered'), true)
})
Deno.test('receipt: sent -> bounced is valid', () => {
  assertEquals(isValidReceiptTransition('sent', 'bounced'), true)
})
Deno.test('receipt: queued -> delivered is invalid (skips sent)', () => {
  assertEquals(isValidReceiptTransition('queued', 'delivered'), false)
})
Deno.test('receipt: delivered -> sent is invalid (terminal state)', () => {
  assertEquals(isValidReceiptTransition('delivered', 'sent'), false)
})
Deno.test('receipt: failed -> queued is valid (retry reopens the same row)', () => {
  assertEquals(isValidReceiptTransition('failed', 'queued'), true)
})
Deno.test('receipt: bounced -> queued is valid (retry reopens the same row)', () => {
  assertEquals(isValidReceiptTransition('bounced', 'queued'), true)
})
Deno.test('receipt: delivered -> queued is invalid (only failed/bounced can be retried)', () => {
  assertEquals(isValidReceiptTransition('delivered', 'queued'), false)
})
