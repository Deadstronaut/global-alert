import {createApp} from 'vue';
import {createPinia} from 'pinia';

import App from './App.vue';
import router from './router';
import i18n from './i18n';
import {NotificationService} from './services/notificationService.js';

import './assets/main.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(i18n);

// Initialize push notifications (runs only on native mobile via Capacitor)
NotificationService.initialize();

app.mount('#app');
