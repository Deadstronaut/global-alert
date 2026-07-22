import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeUrl } from './urlSafety.js';

// Live-verified 2026-07-22 against httpbin.org that safeFetch's
// redirect:'manual' handling actually refuses a 302 to a private address —
// not re-asserted here since that needs a live network call; these cover
// the synchronous/DNS-independent checks that don't.

test('assertSafeUrl: rejects non-https', async () => {
  await assert.rejects(() => assertSafeUrl('http://example.com/feed.json'), /https/);
});

test('assertSafeUrl: rejects a private literal IP', async () => {
  await assert.rejects(() => assertSafeUrl('https://192.168.1.5/feed.json'), /disallowed/);
});

test('assertSafeUrl: rejects the cloud metadata literal IP', async () => {
  await assert.rejects(() => assertSafeUrl('https://169.254.169.254/latest/meta-data/'), /disallowed/);
});

test('assertSafeUrl: rejects localhost', async () => {
  await assert.rejects(() => assertSafeUrl('https://localhost/feed.json'), /disallowed/);
});

test('assertSafeUrl: rejects a malformed URL', async () => {
  await assert.rejects(() => assertSafeUrl('not a url'), /Malformed/);
});

test('assertSafeUrl: accepts a real public https source', async () => {
  await assert.doesNotReject(() =>
    assertSafeUrl('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'),
  );
});
