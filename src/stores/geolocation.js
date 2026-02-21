import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {distanceKm} from '@/services/adapters/DisasterEvent.js';
import {Capacitor} from '@capacitor/core';
import {Geolocation} from '@capacitor/geolocation';

export const useGeolocationStore = defineStore('geolocation', () => {
    const userLat = ref(null);
    const userLng = ref(null);
    const isTracking = ref(false);
    const permissionStatus = ref('prompt'); // 'prompt', 'granted', 'denied'
    const nearbyThreats = ref([]);
    const alertRadius = ref(50); // Default 50km radius
    const locationError = ref(null);

    const hasLocation = computed(() => userLat.value !== null && userLng.value !== null);
    const userCoords = computed(() => {
        if (!hasLocation.value) return null;
        return [userLat.value, userLng.value];
    });

    async function requestLocation() {
        locationError.value = null;
        isTracking.value = true;

        try {
            // Check if we are native mobile with capacitor
            if (Capacitor.isNativePlatform()) {
                let perm = await Geolocation.checkPermissions();
                if (perm.location !== 'granted') {
                    perm = await Geolocation.requestPermissions();
                }

                if (perm.location === 'granted') {
                    permissionStatus.value = 'granted';
                    const position = await Geolocation.getCurrentPosition({enableHighAccuracy: true});
                    userLat.value = position.coords.latitude;
                    userLng.value = position.coords.longitude;
                    isTracking.value = false;
                    return true;
                } else {
                    permissionStatus.value = 'denied';
                    locationError.value = "Konum izni reddedildi.";
                    isTracking.value = false;
                    return false;
                }
            } else {
                // Browser Fallback (Web)
                if (navigator.geolocation) {
                    return new Promise((resolve) => {
                        navigator.geolocation.getCurrentPosition(
                            (position) => {
                                permissionStatus.value = 'granted';
                                userLat.value = position.coords.latitude;
                                userLng.value = position.coords.longitude;
                                isTracking.value = false;
                                resolve(true);
                            },
                            (error) => {
                                permissionStatus.value = error.code === error.PERMISSION_DENIED ? 'denied' : 'prompt';
                                locationError.value = error.message;
                                isTracking.value = false;
                                resolve(false);
                            },
                            {enableHighAccuracy: true, timeout: 10000}
                        );
                    });
                } else {
                    locationError.value = "Tarayıcınız konum servisini desteklemiyor.";
                    isTracking.value = false;
                    return false;
                }
            }
        } catch (error) {
            locationError.value = error.message;
            isTracking.value = false;
            return false;
        }
    }

    function calculateNearbyThreats(allEvents) {
        if (!hasLocation.value || !allEvents || !allEvents.length) {
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
            .slice(0, 20); // Show max 20 nearby threats to keep performance
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
