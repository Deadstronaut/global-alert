import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

// Mutable mock state (vi.hoisted so it's available inside the hoisted vi.mock
// factory below) — defaults produce spec 004's pre-MFA behavior (no pending
// challenge, no per-role requirement) so those tests are unaffected; spec 005
// tests below override these per-case.
const mockState = vi.hoisted(() => ({
  aal: { currentLevel: 'aal2', nextLevel: 'aal2' },
  rolePolicyRequired: false,
  factors: [{ id: 'factor-1' }],
}))

vi.mock('@/services/api/config.js', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => {},
      mfa: {
        getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: mockState.aal }),
        listFactors: () => Promise.resolve({ data: { totp: mockState.factors } }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { required: mockState.rolePolicyRequired } }),
        }),
      }),
    }),
  },
}))

import { useAuthStore } from '@/stores/auth.js'
import { routes, authGuard } from '@/router/index.js'

async function navigateAs(role, path = '/admin') {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(authGuard)

  const auth = useAuthStore()
  await auth.init()
  auth.session = role
    ? { id: 'u1', email: 'x@x.com', role, countryCode: null, regionCode: null }
    : null

  router.push(path)
  await router.isReady()
  return router.currentRoute.value.name
}

describe('role-based /admin route guard (spec 004 US1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockState.aal = { currentLevel: 'aal2', nextLevel: 'aal2' }
    mockState.rolePolicyRequired = false
    mockState.factors = [{ id: 'factor-1' }]
  })

  it('redirects a viewer away from /admin without reaching the admin route', async () => {
    expect(await navigateAs('viewer')).toBe('home')
  })

  it.each(['super_admin', 'country_admin', 'org_admin'])(
    'allows %s to reach /admin',
    async (role) => {
      expect(await navigateAs(role)).toBe('admin')
    },
  )

  it('redirects a logged-out visitor to login', async () => {
    expect(await navigateAs(null)).toBe('login')
  })
})

describe('AAL-gating for a pending MFA challenge (spec 005 US2, T010)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockState.rolePolicyRequired = false
    mockState.factors = [{ id: 'factor-1' }]
  })

  it('redirects any authenticated role to mfa-challenge when aal1->aal2 is pending', async () => {
    mockState.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
    expect(await navigateAs('super_admin', '/admin')).toBe('mfa-challenge')
    expect(await navigateAs('viewer', '/')).toBe('mfa-challenge')
  })

  it('does not redirect when already at aal2 (challenge already completed)', async () => {
    mockState.aal = { currentLevel: 'aal2', nextLevel: 'aal2' }
    expect(await navigateAs('super_admin', '/admin')).toBe('admin')
  })

  it('does not redirect when no factor is enrolled (aal1 stays aal1)', async () => {
    mockState.aal = { currentLevel: 'aal1', nextLevel: 'aal1' }
    expect(await navigateAs('viewer', '/')).toBe('home')
  })

  it('lets a pending session stay on mfa-challenge itself (no redirect loop)', async () => {
    mockState.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
    expect(await navigateAs('super_admin', '/mfa-challenge')).toBe('mfa-challenge')
  })
})

describe('per-role mandatory MFA redirect (spec 005 US4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockState.aal = { currentLevel: 'aal2', nextLevel: 'aal2' }
  })

  it('routes an unenrolled user of a required role into account-security', async () => {
    mockState.rolePolicyRequired = true
    mockState.factors = []
    expect(await navigateAs('country_admin', '/admin')).toBe('account-security')
  })

  it('does not redirect an already-enrolled user even if their role requires MFA', async () => {
    mockState.rolePolicyRequired = true
    mockState.factors = [{ id: 'factor-1' }]
    expect(await navigateAs('country_admin', '/admin')).toBe('admin')
  })

  it('does not redirect when the role does not require MFA', async () => {
    mockState.rolePolicyRequired = false
    mockState.factors = []
    expect(await navigateAs('org_admin', '/admin')).toBe('admin')
  })
})
