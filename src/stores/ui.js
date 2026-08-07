import {defineStore} from 'pinia';
import {ref, reactive, computed, watch} from 'vue';

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
        // Combined "flowing streamlines over a speed heatmap" look, matching
        // the reference tool's own Ocean/Currents view (live-testing ask,
        // 2026-08-06: "altında da ısı haritası olmalı" — turning Currents on
        // should show its heatmap underneath, not require a second click on
        // the Overlay row). Only sets it on enable — turning Currents back
        // off leaves whatever Overlay the user has since switched to.
        if (currentsEnabled.value) activeOverlayKey.value = 'ocean_current';
    }
    const wavesEnabled = computed(() => activeAnimateLayer.value === 'wave');
    function toggleWaves() {
        toggleAnimateLayer('wave');
    }
    const selectedMode = ref('air');
    // Switching Mode (Air/Ocean/Chem/...) must clear whatever Animate/Overlay/
    // Forecast selection was active — each Mode has its own option list, and
    // leaving a prior selection "on" made its chip look active in the new
    // Mode even though it no longer applies there (2026-08-07 bug report:
    // switching Air -> Ocean kept Air's Animate/Overlay chips highlighted).
    function setMode(modeId) {
        if (selectedMode.value === modeId) return;
        selectedMode.value = modeId;
        resetFlowSelections();
    }
    // Shared by setMode above and the 2D/3D transition actions below —
    // any switch that changes which Animate/Overlay/Forecast options are
    // even valid to show should drop the prior selection rather than leave
    // a stale chip highlighted.
    function resetFlowSelections() {
        activeAnimateLayer.value = null;
        activeOverlayKey.value = null;
        selectedForecastVariable.value = null;
    }

    // Height selector (spec 054 follow-up, 2026-08-06) — 'Sfc' or a GFS
    // pressure-level string ('1000'|'850'|'700'|'500'|'250'|'70'|'10').
    // Only Temp/RH actually vary by level; every other Overlay field
    // ignores this and always reads its one 'sfc' row (see MapView.vue's
    // LEVEL_AWARE_OVERLAY_KEYS). Moved here (not local FlowControlPanel
    // state) so MapView.vue can watch it directly, same reasoning as
    // activeOverlayKey living here instead of in the panel component.
    const selectedHeight = ref('Sfc');
    function setSelectedHeight(level) {
        selectedHeight.value = level;
    }

    // Whether the full flow/overlay menu (FlowControlPanel.vue) is
    // expanded — moved here (not a local `open` ref in the panel itself),
    // 2026-08-06: the panel's own trigger button was replaced by the
    // radar scan badge that sits above the severity legend card
    // (MapView.vue), a completely different part of the DOM tree, so
    // both need to read/write the same shared open state.
    const flowPanelOpen = ref(false);
    function toggleFlowPanel() {
        flowPanelOpen.value = !flowPanelOpen.value;
    }

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
        // Forecast (spec 056) and nowcast Overlay share one visual map slot
        // — selecting either clears the other (research.md §1: showing both
        // at once would undermine "never mistaken for real-time data" more
        // than either alone helps).
        selectedForecastVariable.value = null;
    }

    // Forecast row (spec 056) — same flat-ref/single-select-radio convention
    // as selectedHeight/activeOverlayKey above, so MapView.vue can watch it
    // directly. null = forecast display off (default, spec.md Edge Cases:
    // "no forecast overlay is shown by default").
    const selectedForecastVariable = ref(null);
    const selectedForecastDayIndex = ref(0);
    function setSelectedForecastVariable(variable) {
        selectedForecastVariable.value = variable;
        selectedForecastDayIndex.value = 0; // a stale index from a variable with more days could be out-of-bounds for one with fewer (data-model.md)
        if (variable) activeOverlayKey.value = null; // mutual exclusivity, same reasoning as toggleOverlay above
    }
    function setSelectedForecastDayIndex(index) {
        selectedForecastDayIndex.value = index;
    }

    // Live-tunable flow-particle rendering (gear icon in FlowControlPanel.vue)
    // — one independent settings slot PER layer_type (2026-08-06, explicit
    // user instruction after a same-file edit meant for ocean_current broke
    // wind's own already-approved look: "hepsini ayrı tutman lazım... her
    // biri için ayrı bir motor yaz" — wind/ocean_current/wave must never
    // share state, only their own slot, so tuning one can never move
    // another's sliders). wind's defaults are the 2026-08-06 live-tuned
    // values from before this split (kept identical so wind's behavior is
    // byte-for-byte unchanged); ocean_current/wave start from the same
    // shape but are free to be tuned independently from here on.
    // particleCount is likewise per-layer — simple-current-layer.js and
    // simple-wave-layer.js (not wind, which keeps its own fixed constant
    // for now) read it live via setParticleCount().
    // opacity (2026-08-06 ask: "her şey için geçerli olsun" — one slider
    // next to the gear icon that dims both this layer_type's Animate
    // particles AND its own Overlay heatmap together, since the heatmap's
    // real colors were "good but hard to read the map underneath" at full
    // strength). Applied to Overlay for every layer_type (MapView.vue paint
    // property only, safe for wind too); applied to Animate particles only
    // for ocean_current/wave (simple-current-layer.js/simple-wave-layer.js
    // — wind's own engine file stays untouched, same standing rule as
    // particleCount above).
    const FLOW_SETTINGS_DEFAULTS = {particleCount: 3000, speedMultiplier: 333.0, trailLength: 100, trailThickness: 2.0, opacity: 0.7};
    // Live-tuned via the gear-icon sliders, 2026-08-06 — the "dot-like"
    // look (short, sparse) the user landed on for Waves after the
    // motion-scale swap (simple-wave-layer.js's own SPEED_FACTOR comment).
    // trailThickness back down to a thin 2.0px (2026-08-06 follow-up
    // correction: a first attempt made the point/line itself 8x fatter,
    // but the user clarified that wasn't the right mechanism — "iz
    // kalınlığı değil... 1.6 pikselde düşün ama yan yana 20 tane iz
    // attığını düşün, dalga gibi bir resim oluşuyor" — width should come
    // from simple-wave-layer.js's own STRAND_COUNT (20 thin parallel
    // copies of each segment) instead, so this stays thin.
    const WAVE_SETTINGS_DEFAULTS = {particleCount: 600, speedMultiplier: 166.0, trailLength: 47, trailThickness: 2.0, opacity: 0.7};
    const flowSettings = reactive({
        wind: {...FLOW_SETTINGS_DEFAULTS},
        ocean_current: {...FLOW_SETTINGS_DEFAULTS},
        wave: {...WAVE_SETTINGS_DEFAULTS},
    });
    function setFlowSpeedMultiplier(layerType, value) {
        flowSettings[layerType].speedMultiplier = value;
    }
    function setFlowTrailLength(layerType, value) {
        flowSettings[layerType].trailLength = value;
    }
    function setFlowOpacity(layerType, value) {
        flowSettings[layerType].opacity = value;
    }
    function setFlowTrailThickness(layerType, value) {
        flowSettings[layerType].trailThickness = value;
    }
    function setFlowParticleCount(layerType, value) {
        flowSettings[layerType].particleCount = value;
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
            resetFlowSelections();
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
            resetFlowSelections();
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
        setMode,
        selectedHeight,
        setSelectedHeight,
        flowPanelOpen,
        toggleFlowPanel,
        activeOverlayKey,
        toggleOverlay,
        selectedForecastVariable,
        selectedForecastDayIndex,
        setSelectedForecastVariable,
        setSelectedForecastDayIndex,
        flowSettings,
        setFlowSpeedMultiplier,
        setFlowTrailLength,
        setFlowTrailThickness,
        setFlowParticleCount,
        setFlowOpacity,
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
