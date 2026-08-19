import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '@/router/index.js'

// spec 069 US3: login/report/mfa-challenge must NOT be nested under
// MainLayout — they render exactly as they did before this feature.
// (public-portal/'/portal' was removed 2026-08-19 — see spec 069 tasks.md.)

const router = createRouter({ history: createMemoryHistory(), routes })

describe('public/pre-shell routes remain top-level', () => {
  it.each([
    { name: 'login', path: '/login', public: true },
    { name: 'report-hazard', path: '/report', public: true },
    { name: 'mfa-challenge', path: '/mfa-challenge', public: undefined },
  ])('$name is a single-record (non-nested) route', ({ name, path, public: isPublic }) => {
    const resolved = router.resolve({ name })
    expect(resolved.path).toBe(path)
    expect(resolved.matched).toHaveLength(1)
    expect(resolved.meta.public).toBe(isPublic)
  })
})
