import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deduplicator } from './deduplicator.js';

function eq(overrides = {}) {
  return {
    id: 'usgs-1', type: 'earthquake', lat: 38.0, lng: 27.0,
    magnitude: 5.0, time: '2026-08-03T00:00:00.000Z',
    source: 'USGS', sourceUrl: 'https://usgs', receivedAt: '2026-08-03T00:00:01.000Z',
    ...overrides,
  };
}

test('findMatch: brand new event has no match', () => {
  const dedup = new Deduplicator();
  assert.equal(dedup.findMatch(eq()), null);
});

test('add() seeds contributingSources from the event\'s own single source', () => {
  const dedup = new Deduplicator();
  const event = eq();
  dedup.add(event);
  assert.deepEqual(event.contributingSources, [
    { source: 'USGS', magnitude: 5.0, sourceUrl: 'https://usgs', receivedAt: '2026-08-03T00:00:01.000Z' },
  ]);
});

test('findMatch: same physical quake from a different agency matches (within radius/time/magnitude tolerance)', () => {
  const dedup = new Deduplicator();
  const first = eq();
  dedup.add(first);
  const second = eq({ id: 'emsc-9', source: 'EMSC', lat: 38.05, lng: 27.02, magnitude: 5.1, time: '2026-08-03T00:01:00.000Z' });
  assert.equal(dedup.findMatch(second), first);
});

test('findMatch: a genuinely different quake (far away) does not match', () => {
  const dedup = new Deduplicator();
  dedup.add(eq());
  const farAway = eq({ id: 'usgs-2', lat: -10, lng: 150 });
  assert.equal(dedup.findMatch(farAway), null);
});

test('mergeSource: appends the new agency to contributingSources', () => {
  const dedup = new Deduplicator();
  const existing = eq();
  dedup.add(existing);
  const incoming = eq({ id: 'emsc-9', source: 'EMSC', magnitude: 5.1, sourceUrl: 'https://emsc', receivedAt: '2026-08-03T00:01:30.000Z' });
  dedup.mergeSource(existing, incoming);
  assert.deepEqual(existing.contributingSources, [
    { source: 'USGS', magnitude: 5.0, sourceUrl: 'https://usgs', receivedAt: '2026-08-03T00:00:01.000Z' },
    { source: 'EMSC', magnitude: 5.1, sourceUrl: 'https://emsc', receivedAt: '2026-08-03T00:01:30.000Z' },
  ]);
});

test('mergeSource: the same agency reporting twice does not duplicate its badge', () => {
  const dedup = new Deduplicator();
  const existing = eq();
  dedup.add(existing);
  const incomingAgain = eq({ id: 'usgs-1b', magnitude: 5.05 });
  dedup.mergeSource(existing, incomingAgain);
  assert.equal(existing.contributingSources.length, 1);
  assert.equal(existing.contributingSources[0].source, 'USGS');
});

test('findMatch: exact same id is always a match regardless of distance', () => {
  const dedup = new Deduplicator();
  const existing = eq();
  dedup.add(existing);
  const sameId = eq({ lat: 0, lng: 0 }); // same id, wildly different location
  assert.equal(dedup.findMatch(sameId), existing);
});
