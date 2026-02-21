import {createRouter, createWebHistory} from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
    },
    {
      path: '/map',
      name: 'map',
      component: () => import('@/views/HomeView.vue'),
      beforeEnter: (to, from, next) => {
        // Handled by the HomeView component internally
        next();
      }
    }
  ]
});

export default router;
