import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { supabase } from '@/services/api/config.js';

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
      path: '/portal',
      name: 'public-portal',
      component: () => import('@/views/PublicPortalView.vue'),
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
      path: '/shelters',
      name: 'shelters',
      component: () => import('@/views/ShelterInfoView.vue'),
      // spec 021 FR-008: shelter availability is life-safety information —
      // no meta.roles, reachable by every authenticated role including
      // viewer, same as /alerts/incidents above. The full CRUD management
      // UI stays inside /admin (spec 004's tested viewer boundary is
      // untouched); this route is read-only for accounts without manage
      // access, matching SheltersPanel.vue's own canManage gate.
    },
    {
      path: '/hazards',
      name: 'hazards',
      component: () => import('@/views/HazardEncyclopediaView.vue'),
      // spec 024 FR-008: same pattern as /shelters above — reference/
      // educational info, no meta.roles, reachable by every authenticated
      // role including viewer. Parent-relationship editing stays inside
      // /admin's Hazard Taxonomy tab (unchanged access control).
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { roles: ['super_admin', 'country_admin', 'org_admin'] }
    },
    {
      path: '/mfa-challenge',
      name: 'mfa-challenge',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/account-security',
      name: 'account-security',
      component: () => import('@/views/AccountSecurityView.vue'),
      // No meta.roles — reachable by every authenticated role regardless of
      // /admin access (spec 005 clarification: Viewers must be able to reach
      // this page even though spec 004 blocks them from /admin).
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

  // Spec 005 FR-003: a password-correct session with an active second factor
  // is not "fully authenticated" until that factor is also challenged — this
  // holds on every navigation, not just the initial login form submission.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfaPending = aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2';
  if (mfaPending && to.name !== 'mfa-challenge') {
    return { name: 'mfa-challenge' };
  }

  // Spec 005 FR-009: a role configured as requiring MFA guides an unenrolled
  // user straight into enrollment rather than letting them postpone it.
  if (!mfaPending && to.name !== 'account-security' && (await auth.isMfaRequiredForRoleButUnenrolled())) {
    return { name: 'account-security' };
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
