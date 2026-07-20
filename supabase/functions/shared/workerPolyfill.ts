/**
 * Side-effect-only module: stubs the global `Worker` constructor before
 * geotiff.js is imported anywhere. Supabase's deployed Edge Runtime has no
 * `Worker` global; geotiff@2.1.3 references it at module-load time (for an
 * optional decompression worker pool this app never uses — readRasters is
 * always awaited inline, never pooled), so simply importing geotiff.js
 * crashes instantly with "ReferenceError: Worker is not defined" otherwise
 * (live-verified 2026-07-20 — this affected every function that imports
 * rasterToHexagon.ts, including the pre-existing, unmodified import-
 * worldpop; it was never actually working before this fix).
 *
 * MUST be imported before 'https://esm.sh/geotiff@2.1.3' — ES module
 * bodies execute in the order their import statements are first
 * encountered, so this only works as the first import in any file that
 * (transitively) imports geotiff. A same-file top-level statement above a
 * static `import ... from 'geotiff'` does NOT work: static imports are
 * hoisted and their module bodies run before the importing file's own
 * top-level code, regardless of source order (live-verified: the first
 * attempt at this fix put the stub inline above the geotiff import in the
 * same file and still failed identically).
 */
// deno-lint-ignore no-explicit-any
;(globalThis as any).Worker ??= class {
  constructor() {}
  postMessage() {}
  terminate() {}
}
export {}
