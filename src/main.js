import {createApp} from 'vue';
import {createPinia} from 'pinia';

import App from './App.vue';
import router from './router';
import i18n from './i18n';
import {NotificationService} from './services/notificationService.js';

import './assets/main.css';

// Yabancı kütüphanelerin (globe.gl) yol açtığı Three.js deprecation loglarını gizle
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Clock: This module has been deprecated')) {
    return;
  }
  originalWarn(...args);
};
const app = createApp(App);

const pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(i18n);

// Dev: expose for console debugging
if (import.meta.env.DEV) {
  window.__pinia = pinia;
  window.__env = {
    SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    SUPABASE_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

// Initialize push notifications (runs only on native mobile via Capacitor)
NotificationService.initialize();

app.mount('#app');
