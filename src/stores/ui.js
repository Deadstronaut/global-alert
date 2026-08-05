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
    // Placeholder dashboard dialog (2026-08-03) — empty centered modal for
    // now, content to be filled in later.
    const dashboardPanelOpen = ref(false);
    const emergencyPopupOpen = ref(false);
    const activeEmergency = ref(null);

    // Accessibility
    const darkMode = ref(true);
    const highContrast = ref(false);
    const safeMode = ref(false);
    const colorblindMode = ref(false);

    // Map visualization mode: 'normal' | 'hexagon' | 'heatmap'
    // Default 'hexagon' matches the app's own initial state — viewMode
    // starts at 'globe' (3D), and the user wants 3D to read as "Petek" while
    // 2D reads as "Isı" (2026-07-30); transitionToMap/transitionToGlobe below
    // keep it in sync as the user switches between the two. Selecting a
    // country in the 2D map still forces 'hexagon' on its own regardless
    // (see MapView's selectCountry).
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
    // relevant regardless of visualization mode. Defaults to off (2026-07-26
    // feedback) — now that OSM-imported shelters actually populate this
    // layer (649 points in TR alone), leaving it on by default clutters the
    // map before the user has asked for it.
    const showShelters = ref(false);
    function toggleShelters() {
        showShelters.value = !showShelters.value;
    }

    // Community report map layer visibility (spec 036) — same independent,
    // always-relevant-regardless-of-mapMode pattern as showShelters above.
    const showCommunityReports = ref(false);
    function toggleCommunityReports() {
        showCommunityReports.value = !showCommunityReports.value;
    }

    // Animate row (Wind/Currents/Waves) — single-select "radio button with
    // toggle-off" (spec 053/054 follow-up, corrected 2026-08-05): earlier
    // this was three fully-independent flags, then earth.nullschool.net's
    // own Animate row was found to be a `role="radiogroup"` (live-verified
    // by reading its DOM, 2026-08-05) — only one flow ever animates at
    // once there. Explicit correction from the user after seeing them all
    // stack: "her biri radyo buton olmalı fakat tekrar bastığımda toggle
    // olmalı, kendi içinde on/off olabilmeli" (each should be a radio
    // button, but pressing the active one again should turn it off). A
    // single nullable ref (not three booleans) makes mutual exclusion
    // automatic instead of something every toggle function has to
    // remember to enforce.
    const activeAnimateLayer = ref(null); // null | 'wind' | 'ocean_current' | 'wave'
    function toggleAnimateLayer(key) {
        activeAnimateLayer.value = activeAnimateLayer.value === key ? null : key;
    }
    // Read-only computed booleans, kept so MapView.vue's existing per-layer
    // watches (`() => uiStore.windEnabled`, etc.) didn't need to change
    // shape when this became a single shared ref.
    const windEnabled = computed(() => activeAnimateLayer.value === 'wind');
    function toggleWind() {
        toggleAnimateLayer('wind');
    }
    const currentsEnabled = computed(() => activeAnimateLayer.value === 'ocean_current');
    function toggleCurrents() {
        toggleAnimateLayer('ocean_current');
    }
    const wavesEnabled = computed(() => activeAnimateLayer.value === 'wave');
    function toggleWaves() {
        toggleAnimateLayer('wave');
    }
    const selectedMode = ref('air');

    // Overlay row — same single-select-with-toggle-off correction as
    // Animate above, and for the same reason (nullschool's own Overlay row
    // is also `role="radiogroup"`): one shared key across BOTH overlay
    // "kinds" (speed-color layers reusing flow_snapshots textures, and
    // pre-colored overlay_snapshots layers like PM2.5/Temp) since only one
    // Overlay color layer should ever be on the map at a time regardless
    // of which mechanism produced it.
    const activeOverlayKey = ref(null); // null | 'wind' | 'ocean_current' | 'wave' | 'air_quality_pm25' | 'temperature' | ...
    function toggleOverlay(key) {
        activeOverlayKey.value = activeOverlayKey.value === key ? null : key;
    }
    const speedOverlayEnabled = computed(() => ({
        wind: activeOverlayKey.value === 'wind',
        ocean_current: activeOverlayKey.value === 'ocean_current',
        wave: activeOverlayKey.value === 'wave',
    }));
    const preColoredOverlayEnabled = computed(() => ({
        air_quality_pm25: activeOverlayKey.value === 'air_quality_pm25',
        temperature: activeOverlayKey.value === 'temperature',
    }));

    // Live-tunable flow-particle rendering (gear icon in FlowControlPanel.vue)
    // — defaults are the live-testing result, 2026-08-05, that produced the
    // actual nullschool-style flowing-streamline look (see MapView.vue's
    // setFlowLayerEnabled comment).
    const flowSpeedMultiplier = ref(336);
    const flowTrailLength = ref(89);
    function setFlowSpeedMultiplier(value) {
        flowSpeedMultiplier.value = value;
    }
    function setFlowTrailLength(value) {
        flowTrailLength.value = value;
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
            // Was 'heatmap' — 2D map used to always open with the heatmap
            // overlay already on, which the user found visually harsh
            // (2026-08-03 feedback). null = the true "off" state: none of
            // Durum/Petek/Isı pressed. Distinct from 'normal', which is
            // Durum's own *selected* state — the first cut of this fix
            // wrongly reused 'normal' as both "off" and "Durum active",
            // so Durum showed as pressed on open and toggling it off just
            // re-landed on itself instead of truly clearing (2026-08-03
            // follow-up correction).
            mapMode.value = null;
            transitionState.value = 'complete';
        }, 800);
    }

    // Durum(📍)/Petek(⬡)/Isı buttons (SidebarPanel.vue) are radio-style —
    // picking a different mode switches to it — except pressing the
    // already-active one again turns it off instead of re-selecting it,
    // landing back on null (see transitionToMap's comment on null vs
    // 'normal'). 2026-08-03 feedback.
    function toggleMapMode(mode) {
        mapMode.value = mapMode.value === mode ? null : mode;
    }

    function transitionToGlobe() {
        transitionState.value = 'transitioning';

        setTimeout(() => {
            viewMode.value = 'globe';
            mapMode.value = 'hexagon';
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

    function toggleDashboardPanel() {
        dashboardPanelOpen.value = !dashboardPanelOpen.value;
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
        dashboardPanelOpen,
        toggleDashboardPanel,
        emergencyPopupOpen,
        activeEmergency,
        darkMode,
        highContrast,
        safeMode,
        colorblindMode,
        mapMode,
        toggleMapMode,
        showHeatmap,
        showHexbins,
        manualHexResolution,
        setManualHexResolution,
        showShelters,
        toggleShelters,
        showCommunityReports,
        toggleCommunityReports,
        activeAnimateLayer,
        toggleAnimateLayer,
        windEnabled,
        toggleWind,
        currentsEnabled,
        toggleCurrents,
        wavesEnabled,
        toggleWaves,
        selectedMode,
        activeOverlayKey,
        toggleOverlay,
        preColoredOverlayEnabled,
        speedOverlayEnabled,
        flowSpeedMultiplier,
        flowTrailLength,
        setFlowSpeedMultiplier,
        setFlowTrailLength,
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
