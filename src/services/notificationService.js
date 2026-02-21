import {PushNotifications} from '@capacitor/push-notifications';
import {supabase} from './api/config.js';

export class NotificationService {
    static isInitialized = false;

    static async initialize() {
        if (this.isInitialized || !window.Capacitor?.isNativePlatform()) return;

        try {
            // Request permission to use push notifications
            const permissions = await PushNotifications.requestPermissions();

            if (permissions.receive === 'granted') {
                // Register with Apple / Google to receive push via APNS/FCM
                await PushNotifications.register();
            } else {
                console.warn('[GEWS] Push notification permission denied');
            }

            // Add listeners
            await this.setupListeners();

            this.isInitialized = true;
        } catch (error) {
            console.error('[GEWS] Error initializing push notifications:', error);
        }
    }

    static async setupListeners() {
        // On success, we should be able to receive notifications
        PushNotifications.addListener('registration', async (token) => {
            console.log('[GEWS] Push registration success, token: ' + token.value);
            // Here we would typically save the token to Supabase for this user/device
            // For GEWS anonymous usage, we could store it locally or anonymously in a "devices" table
            localStorage.setItem('gews_fcm_token', token.value);
        });

        // Some issue with our setup and push will not work
        PushNotifications.addListener('registrationError', (error) => {
            console.error('[GEWS] Error on registration: ' + JSON.stringify(error));
        });

        // Show us the notification payload if the app is open on our device
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[GEWS] Push received: ', notification);
            // In-app alert could be triggered here via an event bus or Pinia store
        });

        // Method called when tapping on a notification
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('[GEWS] Push action performed: ', notification);
            // E.g., Navigate to the specific disaster Details
        });
    }

    /**
     * For the demo/server-side simulation, we can call the edge function
     * to broadcat an alert for testing purposes if we hold the FCM token.
     */
    static async triggerTestAlert(disaster) {
        const token = localStorage.getItem('gews_fcm_token');
        if (!token) return false;

        try {
            const {data, error} = await supabase.functions.invoke('send-alert', {
                body: {
                    title: `GEWS Uyarısı: ${disaster.type.toUpperCase()}`,
                    body: `${disaster.title} konumunuza yaklaştı! Şiddet: ${disaster.severity}`,
                    severity: disaster.severity,
                    tokens: [token] // Target this specific device
                }
            });
            return !error;
        } catch (e) {
            return false;
        }
    }
}
