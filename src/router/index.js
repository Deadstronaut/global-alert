import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
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
    },
  ]
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  const auth = useAuthStore();
  if (!auth.isLoggedIn) return { name: 'login' };
  return true;
});

export default router;
