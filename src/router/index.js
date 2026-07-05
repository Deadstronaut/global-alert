import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';

// Exported separately (rather than only used inline below) so tests can build
// a router against these same routes/guard with createMemoryHistory, without
// needing createWebHistory's browser-only `window`/`document` dependency.
export const routes = [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
    },
    {
      path: '/map',
      name: 'map',
      component: () => import('@/views/HomeView.vue')
    },
    {
      path: '/:countryCode',
      name: 'country',
      component: () => import('@/views/HomeView.vue'),
      props: true
    },
    {
      path: '/:countryCode/map',
      name: 'country-map',
      component: () => import('@/views/HomeView.vue'),
      props: true
    },
    {
      path: '/alerts/cap',
      name: 'cap',
      component: () => import('@/views/CapView.vue'),
    },
    {
      path: '/alerts/incidents',
      name: 'incidents',
      component: () => import('@/views/IncidentsView.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { roles: ['super_admin', 'country_admin', 'org_admin'] }
    },
  ];

export async function authGuard(to) {
  const auth = useAuthStore();
  await auth.init(); // restores an existing session on hard refresh, no-op after first call
  if (to.meta.public) return true;
  if (!auth.isLoggedIn) return { name: 'login' };
  // Role-gated routes (e.g. /admin): reject before the component mounts, so
  // unauthorized roles never fire admin-only data requests (spec 004 FR-001).
  if (to.meta.roles && !to.meta.roles.includes(auth.session?.role)) {
    return { name: 'home' };
  }
  return true;
}

// createMemoryHistory fallback keeps this module import-safe under Node/Vitest
// (no `window`), which lets tests import `routes`/`authGuard` directly — the
// real app always runs in a browser, so createWebHistory is always used there.
const router = createRouter({
  history: typeof window !== 'undefined' ? createWebHistory(import.meta.env.BASE_URL) : createMemoryHistory(),
  routes,
});

router.beforeEach(authGuard);

export default router;
