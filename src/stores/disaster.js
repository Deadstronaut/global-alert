import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {fetchAllDisasters, fetchEarthquakes, fetchWildfires, fetchFloods, fetchDroughts} from '@/services/api/disasterService.js';
import {cacheEvents, loadAllCachedData} from '@/services/offlineCache.js';
import {POLLING_INTERVALS} from '@/services/api/config.js';

export const useDisasterStore = defineStore('disaster', () => {
    // State
    const earthquakes = ref([]);
    const wildfires = ref([]);
    const floods = ref([]);
    const droughts = ref([]);
    const activeLayers = ref(new Set(['earthquake', 'wildfire', 'flood', 'drought']));
    const activeSeverities = ref(new Set(['critical', 'high', 'moderate', 'low', 'minimal']));
    const isLoading = ref(false);
    const lastUpdated = ref(null);
    const startDate = ref(null);
    const endDate = ref(null);
    const sourcesOnline = ref(0);
    const errors = ref([]);
    const selectedTimeRange = ref(24); // Default 24 hours

    // Polling timers
    const pollingTimers = ref({});

    // Computed
    const allEvents = computed(() => {
        const events = [];
        if (activeLayers.value.has('earthquake')) events.push(...earthquakes.value);
        if (activeLayers.value.has('wildfire')) events.push(...wildfires.value);
        if (activeLayers.value.has('flood')) events.push(...floods.value);
        if (activeLayers.value.has('drought')) events.push(...droughts.value);

        // Filter by Severity
        let filtered = events.filter(e => activeSeverities.value.has(e.severity));

        // Filter by Time
        if (startDate.value || endDate.value) {
            // Calendar Mode: Use explicit range
            const startStr = startDate.value ? new Date(startDate.value).getTime() : 0;
            const endStr = endDate.value ? new Date(endDate.value).getTime() : Infinity;

            return filtered.filter(e => {
                const et = new Date(e.time).getTime();
                return et >= startStr && et <= endStr;
            });
        } else {
            // Quick Range Mode: From now backwards
            const now = new Date();
            const cutoff = new Date(now.getTime() - selectedTimeRange.value * 60 * 60 * 1000);
            return filtered.filter(e => new Date(e.time).getTime() >= cutoff.getTime());
        }
    });

    const totalCount = computed(() => ({
        earthquake: earthquakes.value.length,
        wildfire: wildfires.value.length,
        flood: floods.value.length,
        drought: droughts.value.length,
        total: earthquakes.value.length + wildfires.value.length + floods.value.length + droughts.value.length
    }));

    const criticalEvents = computed(() =>
        allEvents.value.filter(e => e.severity === 'critical' || e.severity === 'high')
    );

    // Actions
    async function fetchAll() {
        isLoading.value = true;
        errors.value = [];

        try {
            const data = await fetchAllDisasters(startDate.value, endDate.value);
            earthquakes.value = data.earthquakes;
            wildfires.value = data.wildfires;
            floods.value = data.floods;
            droughts.value = data.droughts;
            sourcesOnline.value = data.sourcesOnline;
            lastUpdated.value = data.fetchedAt;

            // Cache for offline use
            cacheEvents('earthquake', data.earthquakes);
            cacheEvents('wildfire', data.wildfires);
            cacheEvents('flood', data.floods);
            cacheEvents('drought', data.droughts);
        } catch (error) {
            errors.value.push(error.message);
            console.error('[GEWS] Fetch all failed:', error);
        } finally {
            isLoading.value = false;
        }
    }

    async function fetchByType(type) {
        try {
            const fetchers = {
                earthquake: fetchEarthquakes,
                wildfire: fetchWildfires,
                flood: fetchFloods,
                drought: fetchDroughts
            };

            const fetcher = fetchers[type];
            if (!fetcher) return;

            const data = await fetcher();
            const storeMap = {earthquake: earthquakes, wildfire: wildfires, flood: floods, drought: droughts};
            storeMap[type].value = data;
            cacheEvents(type, data);
            lastUpdated.value = new Date().toISOString();
        } catch (error) {
            console.error(`[GEWS] Fetch ${type} failed:`, error);
        }
    }

    function toggleLayer(type) {
        if (activeLayers.value.has(type)) {
            activeLayers.value.delete(type);
        } else {
            activeLayers.value.add(type);
        }
        // Force reactivity
        activeLayers.value = new Set(activeLayers.value);
    }

    function isLayerActive(type) {
        return activeLayers.value.has(type);
    }

    function toggleSeverity(severity) {
        if (activeSeverities.value.has(severity)) {
            activeSeverities.value.delete(severity);
        } else {
            activeSeverities.value.add(severity);
        }
        activeSeverities.value = new Set(activeSeverities.value);
    }

    function isSeverityActive(severity) {
        return activeSeverities.value.has(severity);
    }

    function loadFromCache() {
        const cached = loadAllCachedData();
        if (cached.earthquakes.length) earthquakes.value = cached.earthquakes;
        if (cached.wildfires.length) wildfires.value = cached.wildfires;
        if (cached.floods.length) floods.value = cached.floods;
        if (cached.droughts.length) droughts.value = cached.droughts;
    }

    function startPolling() {
        // Earthquake: every 1 minute
        pollingTimers.value.earthquake = setInterval(() => fetchByType('earthquake'), POLLING_INTERVALS.earthquake);
        // Wildfire: every 15 minutes
        pollingTimers.value.wildfire = setInterval(() => fetchByType('wildfire'), POLLING_INTERVALS.wildfire);
        // Flood: every 5 minutes
        pollingTimers.value.flood = setInterval(() => fetchByType('flood'), POLLING_INTERVALS.flood);
        // Drought: every 1 hour
        pollingTimers.value.drought = setInterval(() => fetchByType('drought'), POLLING_INTERVALS.drought);
    }

    function stopPolling() {
        Object.values(pollingTimers.value).forEach(timer => clearInterval(timer));
        pollingTimers.value = {};
    }

    return {
        earthquakes,
        wildfires,
        floods,
        droughts,
        activeLayers,
        activeSeverities,
        isLoading,
        lastUpdated,
        startDate,
        endDate,
        selectedTimeRange,
        sourcesOnline,
        errors,
        allEvents,
        totalCount,
        criticalEvents,
        fetchAll,
        fetchByType,
        toggleLayer,
        isLayerActive,
        toggleSeverity,
        isSeverityActive,
        loadFromCache,
        startPolling,
        stopPolling
    };
});
