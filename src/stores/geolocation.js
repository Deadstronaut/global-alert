import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {distanceKm} from '@/services/adapters/DisasterEvent.js';

export const useGeolocationStore = defineStore('geolocation', () => {
    // State
    const userLat = ref(null);
    const userLng = ref(null);
    const isTracking = ref(false);
    const permissionStatus = ref('prompt'); // 'prompt' | 'granted' | 'denied'
    const nearbyThreats = ref([]);
    const alertRadius = ref(200); // km
    const locationError = ref(null);

    // Computed
    const hasLocation = computed(() => userLat.value !== null && userLng.value !== null);

    const userCoords = computed(() => {
        if (!hasLocation.value) return null;
        return {lat: userLat.value, lng: userLng.value};
    });

    // Actions
    async function requestLocation() {
        locationError.value = null;

        // Try Capacitor Geolocation first, then browser fallback
        try {
            if (window.Capacitor?.isNativePlatform()) {
                const {Geolocation} = await import('@capacitor/geolocation');
                const perm = await Geolocation.checkPermissions();

                if (perm.location === 'denied') {
                    permissionStatus.value = 'denied';
                    return false;
                }

                if (perm.location === 'prompt') {
                    const requested = await Geolocation.requestPermissions();
                    if (requested.location === 'denied') {
                        permissionStatus.value = 'denied';
                        return false;
                    }
                }

                const position = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 10000
                });

                userLat.value = position.coords.latitude;
                userLng.value = position.coords.longitude;
                permissionStatus.value = 'granted';
                isTracking.value = true;
                return true;
            }

            // Browser Geolocation API fallback
            if (navigator.geolocation) {
                return new Promise((resolve) => {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            userLat.value = position.coords.latitude;
                            userLng.value = position.coords.longitude;
                            permissionStatus.value = 'granted';
                            isTracking.value = true;
                            resolve(true);
                        },
                        (error) => {
                            locationError.value = error.message;
                            permissionStatus.value = error.code === 1 ? 'denied' : 'prompt';
                            resolve(false);
                        },
                        {enableHighAccuracy: true, timeout: 10000}
                    );
                });
            }

            locationError.value = 'Geolocation not supported';
            return false;
        } catch (error) {
            locationError.value = error.message;
            return false;
        }
    }

    /**
     * Calculate nearby threats from all disaster events
     * @param {Array} allEvents - all active disaster events
     */
    function calculateNearbyThreats(allEvents) {
        if (!hasLocation.value || !allEvents.length) {
            nearbyThreats.value = [];
            return;
        }

        nearbyThreats.value = allEvents
            .map(event => ({
                ...event,
                distance: distanceKm(userLat.value, userLng.value, event.lat, event.lng)
            }))
            .filter(event => event.distance <= alertRadius.value)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 20);
    }

    function setAlertRadius(km) {
        alertRadius.value = Math.max(10, Math.min(1000, km));
    }

    return {
        userLat,
        userLng,
        isTracking,
        permissionStatus,
        nearbyThreats,
        alertRadius,
        locationError,
        hasLocation,
        userCoords,
        requestLocation,
        calculateNearbyThreats,
        setAlertRadius
    };
});
