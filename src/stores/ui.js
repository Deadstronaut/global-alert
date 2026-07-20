import {defineStore} from 'pinia';
import {ref, computed, watch} from 'vue';

// spec 045: shared range for the manual hex-resolution slider — single
// source of truth so SidebarPanel.vue (the slider's min/max) and
// MapView.vue (the clamp on the automatic fallback) never drift apart.
// H3-H8 was tried first (research.md §4) and live-tested directly against
// Turkey's real boundary geometry via the exact polygonToCells(poly, res+1,
// 2) call hexWorker.js makes: slider=7 (actual H3 res 8) produced ~979,000
// cells in ~12.5s; slider=8 (actual res 9) produced ~6.85M cells in ~87s —
// both unusable client-side. slider=6 (actual res 7) produced ~140,000
// cells in ~1.8s, matching today's existing automatic maximum already in
// production — confirmed safe. Narrowed to the H3-H6 fallback per FR-009.
export const MIN_HEX_RES = 3;
export const MAX_HEX_RES = 6;

export const useUIStore = defineStore('ui', () => {
    // View state
    const viewMode = ref('globe'); // 'globe' | 'map'
    const transitionState = ref('idle'); // 'idle' | 'transitioning' | 'complete'
    const selectedRegion = ref(null); // { lat, lng, zoom }
    const selectedDisaster = ref(null); // DisasterEvent or null

    // Tenant country config — null means global view
    const activeCountryConfig = ref(null);

    // Sidebar
    const sidebarOpen = ref(true);
    const sidebarCollapsed = ref(false);

    // Impact-analysis dock on the map (spec 008) — collapsed state lifted
    // here so sibling map overlays can react to the dock's width without a
    // direct reference to MapView.vue.
    const impactPanelCollapsed = ref(false);
    function toggleImpactPanel() {
        impactPanelCollapsed.value = !impactPanelCollapsed.value;
    }

    // Panels
    const alertPanelOpen = ref(false);
    const settingsPanelOpen = ref(false);
    const emergencyPopupOpen = ref(false);
    const activeEmergency = ref(null);

    // Accessibility
    const darkMode = ref(true);
    const highContrast = ref(false);
    const safeMode = ref(false);
    const colorblindMode = ref(false);

    // Map visualization mode: 'normal' | 'hexagon' | 'heatmap'
    const mapMode = ref('hexagon');
    // Computed aliases kept for backward compat with MapView watches
    const showHeatmap = computed(() => mapMode.value === 'heatmap');
    const showHexbins = computed(() => mapMode.value === 'hexagon');

    // spec 045: manual override for the selected country's hex grid
    // resolution — null means "automatic" (existing zoom-based
    // hexResForZoom() behavior in MapView.vue), an integer overrides it
    // until changed again. Session-only, mirrors mapMode's own shape.
    const manualHexResolution = ref(null);
    function setManualHexResolution(value) {
        manualHexResolution.value = value;
    }

    // Shelter map layer visibility (spec 027) — independent of mapMode, always
    // relevant regardless of visualization mode
    const showShelters = ref(true);
    function toggleShelters() {
        showShelters.value = !showShelters.value;
    }

    // Community report map layer visibility (spec 036) — same independent,
    // always-relevant-regardless-of-mapMode pattern as showShelters above.
    const showCommunityReports = ref(true);
    function toggleCommunityReports() {
        showCommunityReports.value = !showCommunityReports.value;
    }

    function applyThemeAttrs() {
        const theme = highContrast.value ? 'high-contrast' : (darkMode.value ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
    }

    // Apply data attributes to document for CSS
    watch([highContrast, darkMode], applyThemeAttrs, {immediate: true});

    watch(safeMode, (val) => {
        document.documentElement.setAttribute('data-safe-mode', val ? 'true' : 'false');
    });

    watch(colorblindMode, (val) => {
        document.documentElement.setAttribute('data-colorblind', val ? 'true' : 'false');
    });

    // Actions
    function transitionToMap(lat, lng, zoom = 8) {
        selectedRegion.value = {lat, lng, zoom};
        transitionState.value = 'transitioning';

        setTimeout(() => {
            viewMode.value = 'map';
            transitionState.value = 'complete';
        }, 800);
    }

    function transitionToGlobe() {
        transitionState.value = 'transitioning';

        setTimeout(() => {
            viewMode.value = 'globe';
            selectedRegion.value = null;
            transitionState.value = 'idle';
        }, 800);
    }

    function selectDisaster(event) {
        selectedDisaster.value = event;
    }

    function clearSelection() {
        selectedDisaster.value = null;
    }

    function toggleSidebar() {
        if (window.innerWidth <= 768) {
            sidebarOpen.value = !sidebarOpen.value;
        } else {
            sidebarCollapsed.value = !sidebarCollapsed.value;
        }
    }

    function toggleAlertPanel() {
        alertPanelOpen.value = !alertPanelOpen.value;
    }

    function toggleSettings() {
        settingsPanelOpen.value = !settingsPanelOpen.value;
        // Settings shares the impact-analysis dock as a flip-card face on the
        // map view (MapView.vue) — if that dock is collapsed to its narrow
        // rail, opening settings would silently do nothing visible unless
        // it's expanded back out too.
        if (settingsPanelOpen.value) impactPanelCollapsed.value = false;
    }

    function setCountryConfig(config) {
        activeCountryConfig.value = config;
    }

    return {
        viewMode,
        transitionState,
        selectedRegion,
        selectedDisaster,
        sidebarOpen,
        sidebarCollapsed,
        impactPanelCollapsed,
        toggleImpactPanel,
        alertPanelOpen,
        settingsPanelOpen,
        emergencyPopupOpen,
        activeEmergency,
        darkMode,
        highContrast,
        safeMode,
        colorblindMode,
        mapMode,
        showHeatmap,
        showHexbins,
        manualHexResolution,
        setManualHexResolution,
        showShelters,
        toggleShelters,
        showCommunityReports,
        toggleCommunityReports,
        transitionToMap,
        transitionToGlobe,
        selectDisaster,
        clearSelection,
        toggleSidebar,
        toggleAlertPanel,
        toggleSettings,
        activeCountryConfig,
        setCountryConfig
    };
});
