import { fileURLToPath, URL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// maplibre-gl's worker script (maplibre-gl-worker-*.mjs, bundled/hashed by
// Vite normally via the app's own `?url` import) loads a sibling chunk,
// maplibre-gl-shared.mjs, via a relative URL it builds itself at runtime —
// invisible to Vite's static import graph, so `vite build` never copies it
// into dist/assets. Production-only bug (live-testing finding, 2026-08-03):
// local `vite dev` serves node_modules files on demand and never hits this,
// but the built site 404s on /assets/maplibre-gl-shared.mjs — MapLibre's
// worker silently fails to initialize with no thrown console error, and
// every map (any style) renders black. Copies straight from node_modules
// on every build so it always matches whatever maplibre-gl version is
// actually installed, instead of a manual copy that'd go stale on upgrade.
function copyMaplibreSharedChunk() {
  return {
    name: 'copy-maplibre-gl-shared-chunk',
    generateBundle() {
      const src = resolve('node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs')
      if (!existsSync(src)) return
      this.emitFile({
        type: 'asset',
        fileName: 'assets/maplibre-gl-shared.mjs',
        source: readFileSync(src, 'utf-8'),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    copyMaplibreSharedChunk(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
