import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api/config.js', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => {},
    },
  },
}))

import { useAuthStore } from '@/stores/auth.js'
import { routes, authGuard } from '@/router/index.js'

async function navigateAs(role) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(authGuard)

  const auth = useAuthStore()
  await auth.init()
  auth.session = role
    ? { id: 'u1', email: 'x@x.com', role, countryCode: null, regionCode: null }
    : null

  router.push('/admin')
  await router.isReady()
  return router.currentRoute.value.name
}

describe('role-based /admin route guard (spec 004 US1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
