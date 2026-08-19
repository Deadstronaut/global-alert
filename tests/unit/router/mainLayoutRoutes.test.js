import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '@/router/index.js'

// Contract test for specs/069-main-layout-nesting/contracts/router-contract.md
// — asserts every authenticated route resolves as a child of the MainLayout
// parent route, with paths/props/meta preserved exactly as before nesting.

const router = createRouter({ history: createMemoryHistory(), routes })

const authenticatedRoutes = [
  { name: 'home', path: '/' },
  { name: 'map', path: '/map' },
  { name: 'country', path: '/tr' },
  { name: 'country-map', path: '/tr/map' },
  { name: 'cap', path: '/alerts/cap' },
  { name: 'incidents', path: '/alerts/incidents' },
  { name: 'shelters', path: '/shelters' },
  { name: 'hazards', path: '/hazards' },
  { name: 'account-security', path: '/account-security' },
]

describe('MainLayout nesting contract', () => {
  it.each(authenticatedRoutes)('$name resolves nested under the MainLayout parent route', ({ name, path }) => {
    const params = name.startsWith('country') ? { countryCode: 'tr' } : undefined
    const resolved = router.resolve({ name, params })
    expect(resolved.path).toBe(path)
    // matched[0] = the MainLayout parent record, matched[1] = the leaf page route
    expect(resolved.matched).toHaveLength(2)
    expect(resolved.matched[0].name).toBeUndefined()
    expect(resolved.matched[1].name).toBe(name)
  })

  it('country/country-map keep props: true after nesting', () => {
    const params = { countryCode: 'tr' }
    expect(router.resolve({ name: 'country', params }).matched[1].props.default).toBe(true)
    expect(router.resolve({ name: 'country-map', params }).matched[1].props.default).toBe(true)
  })
})
