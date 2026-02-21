import {defineStore} from 'pinia';
import {ref, watch} from 'vue';

export const useUIStore = defineStore('ui', () => {
    // View state
    const viewMode = ref('map'); // 'globe' | 'map'
    const transitionState = ref('idle'); // 'idle' | 'transitioning' | 'complete'
    const selectedRegion = ref(null); // { lat, lng, zoom }
    const selectedDisaster = ref(null); // DisasterEvent or null

    // Sidebar
    const sidebarOpen = ref(true);
    const sidebarCollapsed = ref(false);

    // Panels
    const alertPanelOpen = ref(false);
    const settingsPanelOpen = ref(false);

    // Accessibility
    const darkMode = ref(true);
    const highContrast = ref(false);
    const safeMode = ref(false);
    const colorblindMode = ref(false);

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
    }

    return {
        viewMode,
        transitionState,
        selectedRegion,
        selectedDisaster,
        sidebarOpen,
        sidebarCollapsed,
        alertPanelOpen,
        settingsPanelOpen,
        darkMode,
        highContrast,
        safeMode,
        colorblindMode,
        transitionToMap,
        transitionToGlobe,
        selectDisaster,
        clearSelection,
        toggleSidebar,
        toggleAlertPanel,
        toggleSettings
    };
});
