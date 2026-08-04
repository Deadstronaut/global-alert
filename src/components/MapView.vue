<script setup>
import { ref, reactive, shallowRef, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore, MIN_HEX_RES } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'
import { numericToAlpha2 } from '@/data/isoMapping.js'
import { getSeverityHex, getDisasterIcon } from '@/services/adapters/DisasterEvent.js'
import { polygonToCells, cellToParent, getResolution, latLngToCell } from 'h3-js'
import HexWorker from '@/workers/hexWorker.js?worker'
import ProvinceAggregationWorker from '@/workers/provinceAggregationWorker.js?worker'
import { feature } from 'topojson-client'
import landTopo from 'world-atlas/land-10m.json'
import countriesTopo from 'world-atlas/countries-10m.json'
import { CUSTOM_TERRITORIES } from '@/data/customTerritories.js'
import { COUNTRY_NAMES } from '@/data/countryNames.js'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// maplibre-gl resolves its worker script relative to its own bundled
// import.meta.url, which breaks under Vite (dev pre-bundling copies the main
// file without its worker sibling; production bundling inlines it into a
// chunk with no matching worker file at all) — either way the worker 404s
// silently, and every vector/GeoJSON source (base map, hex grid, heatmap)
// never renders while plain-fetch resources (style/sprite/markers) still
// work, since the worker is what tile parsing runs in. Pointing it at the
// `?url`-resolved asset (fingerprinted by Vite, always correct in both dev
// and build) sidesteps the relative-URL lookup entirely.
maplibregl.setWorkerUrl(maplibreWorkerUrl)
import ImpactPanel from '@/components/impact/ImpactPanel.vue'
import GeocodingSearch from '@/components/impact/GeocodingSearch.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import PanelCollapseToggle from '@/components/PanelCollapseToggle.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useMapLayersStore } from '@/stores/mapLayers.js'
import { useSheltersStore, occupancyPercentage } from '@/stores/shelters.js'
import { useCommunityReportsStore } from '@/stores/communityReports.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useDrillInjectedEventsStore } from '@/stores/drillInjectedEvents.js'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'
import { getShelterMarkerColor, getShelterMarkerIcon } from '@/services/shelterMarkerStyle.js'
import { useExposureLayersStore } from '@/stores/exposureLayers.js'
import { colorForDataset, isPopulationSource, isGridMetricSource, populationFillExpression, gridMetricFillExpression, rampForGridMetric, populationLegendStops, gridMetricLegendStops, POPULATION_RAMP, HALO_SEVERITY_RAMP } from '@/utils/exposureLayerColor.js'
import { circlePolygon, distanceKm } from '@/utils/circleGeometry.js'
import { defaultBufferRadiusKm } from '@/lib/hazardBuffer.js'
import { buildFeaturePopupHtml } from '@/utils/exposureFeaturePopup.js'
import { disasterSourceBadges } from '@/utils/disasterSourceBadges.js'
import { POPUP_CLOSE_BTN_HTML } from '@/utils/popupCloseButton.js'
import { friendlyDatasetLabel } from '@/utils/exposureLayerLabel.js'
import { formatPopulationLabel } from '@/utils/formatPopulationLabel.js'
import { loadRegionBoundaries } from '@/data/boundaries/index.js'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// spec 012: OGC WMS/WFS map layer registry — admin-registered external
// overlays rendered live on this map (never stored/normalized, FR-008).
const mapLayersStore = useMapLayersStore()
// spec 042: toggleable exposure_datasets/exposure_features layers (roads,
// population, and future river/basin sources) — read-only visualization,
// shares the layerVisibility/layerOpacity refs below with the WMS/WFS layers.
const exposureLayersStore = useExposureLayersStore()
const exposureFeatureCache = new Map() // datasetId -> GeoJSON.FeatureCollection
let exposurePopup = null
const sheltersStore = useSheltersStore()
const communityReportsStore = useCommunityReportsStore()
const hazardTypesStore = useHazardTypesStore()
const drillInjectedEventsStore = useDrillInjectedEventsStore()
const auth = useAuthStore()
const layerVisibility = ref({}) // { [layerId]: boolean }
const layerOpacity = ref({}) // { [layerId]: number 0..1 }
const DEFAULT_LAYER_OPACITY = 0.7

// Exposure layer fetches (get_dataset_features_geojson) are a single big
// RPC call per dataset — 10-15s for a country-wide population grid is
// typical — that used to leave the panel looking frozen/broken with no
// feedback for the whole wait. loadingExposureLayer tracks which dataset
// (if any) is currently in flight so a LoadingOverlay can cover the screen
// until it resolves; exposureLayerLoadTokens lets ESC "cancel" it (there's no
// real abort handle on a Supabase RPC call, so cancelling just means
// discarding the response when it eventually arrives and flipping the
// toggle back off, rather than actually stopping the in-flight request).
//
// Keyed per dataset.id (not a single shared counter) — live-testing finding:
// toggling on two population layers back-to-back (e.g. Meta/HDX then
// WorldPop) used to bump one shared token, so the FIRST layer's response
// would arrive, see the token had moved on (because of the SECOND layer's
// unrelated load starting), and silently discard itself — checkbox stayed
// on, but the layer never rendered. Scoping the token per dataset means one
// dataset's load starting/cancelling never invalidates another's.
const loadingExposureLayer = ref(null)
const exposureLayerLoadTokens = new Map() // datasetId -> token

// Legend data for currently-rendered gridded (choropleth) exposure layers —
// keyed by dataset.id so multiple layers toggled on at once each get their
// own legend card. Populated in addExposureLayer, cleared in
// removeExposureLayerRendering — user-reported 2026-08-05: selecting a
// gridded layer (e.g. rainfall/CHIRPS) changed the map's colors with no
// on-screen explanation of what value each color represents, while the
// unrelated event-severity legend kept showing regardless of the selected
// layer. reactive (not ref) so Map.set/delete are tracked without needing to
// replace the whole Map on every change.
const exposureLegends = reactive(new Map()) // datasetId -> { id, label, isPopulation, stops }
const activeExposureLegends = computed(() => Array.from(exposureLegends.values()))

function cancelExposureLayerLoading() {
  const dataset = loadingExposureLayer.value
  if (dataset) {
    exposureLayerLoadTokens.set(dataset.id, (exposureLayerLoadTokens.get(dataset.id) ?? 0) + 1)
    const key = exposureLayerKey(dataset)
    layerVisibility.value = { ...layerVisibility.value, [key]: false }
  }
  loadingExposureLayer.value = null
}

function isLayerVisible(layerId) {
  return !!layerVisibility.value[layerId]
}

function getLayerOpacity(layerId) {
  return layerOpacity.value[layerId] ?? DEFAULT_LAYER_OPACITY
}

function wmsSourceId(layer) { return `map-layer-wms-${layer.id}` }
function wfsSourceId(layer) { return `map-layer-wfs-${layer.id}` }

function addWmsLayer(layer) {
  if (!map) return
  const sourceId = wmsSourceId(layer)
  const base = layer.endpoint_url.includes('?') ? `${layer.endpoint_url}&` : `${layer.endpoint_url}?`
  const tileUrl = `${base}SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${encodeURIComponent(layer.layer_name)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`
  map.addSource(sourceId, { type: 'raster', tiles: [tileUrl], tileSize: 256 })
  map.addLayer({
    id: sourceId,
    type: 'raster',
    source: sourceId,
    paint: { 'raster-opacity': getLayerOpacity(layer.id) },
  })
}

async function addWfsLayer(layer) {
  if (!map) return
  const sourceId = wfsSourceId(layer)
  const base = layer.endpoint_url.includes('?') ? `${layer.endpoint_url}&` : `${layer.endpoint_url}?`
  const url = `${base}SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${encodeURIComponent(layer.layer_name)}&OUTPUTFORMAT=application/json`
  let geojson
  try {
    const res = await fetch(url)
    if (!res.ok) return // silent render failure per spec.md Edge Cases
    geojson = await res.json()
  } catch {
    return // silent render failure — no data/table write, no blocking error
  }
  // Toggle may have been switched off again while the fetch was in flight.
  if (!map || !isLayerVisible(layer.id) || map.getSource(sourceId)) return

  map.addSource(sourceId, { type: 'geojson', data: geojson })
  const opacity = getLayerOpacity(layer.id)
  map.addLayer({ id: `${sourceId}-fill`, type: 'fill', source: sourceId, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#4da3ff', 'fill-opacity': opacity * 0.4 } })
  map.addLayer({ id: `${sourceId}-line`, type: 'line', source: sourceId, filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: { 'line-color': '#4da3ff', 'line-opacity': opacity, 'line-width': 2 } })
  map.addLayer({ id: `${sourceId}-point`, type: 'circle', source: sourceId, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#4da3ff', 'circle-opacity': opacity, 'circle-radius': 5 } })
}

function removeMapLayerRendering(layer) {
  if (!map) return
  if (layer.source_type === 'wms') {
    const sourceId = wmsSourceId(layer)
    if (map.getLayer(sourceId)) map.removeLayer(sourceId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  } else {
    const sourceId = wfsSourceId(layer)
    for (const suffix of ['-fill', '-line', '-point']) {
      if (map.getLayer(sourceId + suffix)) map.removeLayer(sourceId + suffix)
    }
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  }
}

function toggleMapLayer(layer) {
  const next = !isLayerVisible(layer.id)
  layerVisibility.value = { ...layerVisibility.value, [layer.id]: next }
  if (!mapLoaded) return
  if (next) {
    if (layer.source_type === 'wms') addWmsLayer(layer)
    else addWfsLayer(layer)
  } else {
    removeMapLayerRendering(layer)
  }
}

function setMapLayerOpacity(layer, value) {
  layerOpacity.value = { ...layerOpacity.value, [layer.id]: value }
  if (!map || !isLayerVisible(layer.id)) return
  if (layer.source_type === 'wms') {
    const sourceId = wmsSourceId(layer)
    if (map.getLayer(sourceId)) map.setPaintProperty(sourceId, 'raster-opacity', value)
  } else {
    const sourceId = wfsSourceId(layer)
    if (map.getLayer(`${sourceId}-fill`)) map.setPaintProperty(`${sourceId}-fill`, 'fill-opacity', value * 0.4)
    if (map.getLayer(`${sourceId}-line`)) map.setPaintProperty(`${sourceId}-line`, 'line-opacity', value)
    if (map.getLayer(`${sourceId}-point`)) map.setPaintProperty(`${sourceId}-point`, 'circle-opacity', value)
  }
}

// spec 042: exposure_datasets layers (roads/population/rivers/basins/...).
// Same toggle lifecycle shape as the WFS layers above (addWfsLayer/
// removeMapLayerRendering/toggleMapLayer), but the data source is a local
// Postgres RPC over already-imported data, not a live external fetch, and
// features are click-inspectable (research.md §1/§3 for spec 042).
function exposureSourceId(dataset) { return `exposure-dataset-${dataset.id}` }
function exposureLayerKey(dataset) { return `exposure-dataset-${dataset.id}` }

const EXPOSURE_SUB_LAYER_SUFFIXES = ['-fill', '-line', '-point']

// Value labels are always on, gated purely by zoom (VALUE_LABEL_MINZOOM on
// the symbol layer below) — no manual toggle. At country-wide zoom a
// gridded layer can have tens of thousands of cells, so the numbers would
// be illegible clutter until the user has zoomed in close enough for
// individual cells to actually be distinguishable.
const VALUE_LABEL_MINZOOM = 8

// Kept short and locale-formatted (thousands separators) rather than a
// MapLibre expression — different metrics span wildly different scales in
// this dataset family (population counts in the hundreds of thousands,
// SPI-style anomalies around ±0-4, river discharge in m3/s), and picking
// the right precision per value is far simpler as plain JS than as a
// MapLibre `step`/`case` expression evaluated per-feature on the GPU side.
function formatMetricValueLabel(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  const abs = Math.abs(value)
  if (abs >= 100) return Math.round(value).toLocaleString()
  if (abs >= 1) return (Math.round(value * 10) / 10).toLocaleString()
  return (Math.round(value * 100) / 100).toString()
}

async function addExposureLayer(dataset) {
  if (!map) return
  const sourceId = exposureSourceId(dataset)

  let geojson = exposureFeatureCache.get(dataset.id)
  if (!geojson) {
    const myToken = (exposureLayerLoadTokens.get(dataset.id) ?? 0) + 1
    exposureLayerLoadTokens.set(dataset.id, myToken)
    loadingExposureLayer.value = dataset
    // ~55m tolerance at the equator — imprecise at country-scale zoom levels
    // this panel renders at, but meaningfully shrinks the ST_AsGeoJSON
    // payload/serialization cost for line-heavy datasets (live-verified:
    // Turkey's 65,010-feature road network went from timing out
    // server-side to completing in ~11s once this was passed).
    const { data, error } = await supabase.rpc('get_dataset_features_geojson', { dataset_id: dataset.id, simplify_tolerance: 0.0005 })
    // ESC (cancelExposureLayerLoading) bumped this dataset's own token while
    // this was in flight — the toggle's already been flipped back off, so
    // just drop the response instead of racing to render a layer the user
    // cancelled. A DIFFERENT dataset's load starting/cancelling in the
    // meantime never affects this check (see this block's header comment).
    if (myToken !== exposureLayerLoadTokens.get(dataset.id)) return
    if (loadingExposureLayer.value === dataset) loadingExposureLayer.value = null
    if (error || !data) return // silent render failure — matches addWfsLayer's existing convention
    // Population values run into the hundreds of thousands/millions — a
    // hexagon is too small to fit "482,367" without overflow, so population
    // sources get an abbreviated "482K"/"1.2M" label (spec 046 FR-003)
    // instead of the generic comma-separated formatMetricValueLabel used by
    // every other gridded metric (SPI/anomaly/discharge values are small
    // floats that already fit).
    // osm-buildings' metric_value is always 1 (one row per facility, not a
    // real count) — labeling every single point "1" is meaningless clutter
    // (live-testing finding, user-reported: a whole campus of buildings each
    // showing "1"). The facility's own name is far more useful there.
    const isCriticalInfra = dataset.source_name === 'osm-buildings'
    const buildLabel = isPopulationSource(dataset.source_name) ? formatPopulationLabel : formatMetricValueLabel
    geojson = {
      type: 'FeatureCollection',
      features: data.map((row) => ({
        type: 'Feature',
        geometry: JSON.parse(row.geom_geojson),
        properties: {
          ...row.properties,
          __metricValue: row.metric_value,
          __metricValueLabel: isCriticalInfra
            ? String(row.properties?.name ?? '').slice(0, 28)
            : buildLabel(row.metric_value),
        },
      })),
    }
    exposureFeatureCache.set(dataset.id, geojson)
  }

  // Toggle may have been switched off again while the fetch was in flight.
  if (!map || !isLayerVisible(exposureLayerKey(dataset)) || map.getSource(sourceId)) return

  const color = colorForDataset(dataset)
  const opacity = getLayerOpacity(exposureLayerKey(dataset))
  const isPopulation = isPopulationSource(dataset.source_name)
  const isGridMetric = isGridMetricSource(dataset.source_name)
  // spec 046 US2: kick off (fire-and-forget) the region-boundary
  // availability check for every level (province/ADM1, district/ADM2,
  // village/ADM3) for this dataset's country as soon as its hexagon data is
  // on the map — the toggle buttons in the panel read regionBoundaryCache
  // reactively once this resolves, so a country without boundary data at a
  // given level (FR-007) simply never enables that button. Loops over
  // REGION_LEVELS (not hardcoded) so adding a future level here needs no
  // second edit elsewhere.
  if (isPopulation) {
    for (const level of REGION_LEVELS) ensureRegionBoundaryChecked(dataset.country_code, level)
  }
  // Both population and other gridded metrics (GDO anomalies, GloFAS
  // discharge) are thousands of small per-pixel cells covering a whole
  // country — a flat fill + full-opacity 2px outline (the default, meant
  // for a handful of large features) reads as a dense, illegible grid/moiré
  // pattern instead of a heatmap, so both get a quantile-graduated fill and
  // a thin, low-opacity outline instead.
  const isGridded = isPopulation || isGridMetric
  const fillColor = isPopulation ? populationFillExpression(geojson) : isGridMetric ? gridMetricFillExpression(geojson, rampForGridMetric(dataset.source_name)) : color

  // Legend: same quantile breakpoints as the fill expression above, just
  // shaped for display — see gridMetricLegendStops's header for why this
  // can't just reuse fillColor's MapLibre expression directly.
  if (isGridded) {
    const stops = isPopulation ? populationLegendStops(geojson) : gridMetricLegendStops(geojson, rampForGridMetric(dataset.source_name))
    if (stops) {
      const labelFor = isPopulation ? formatPopulationLabel : formatMetricValueLabel
      exposureLegends.set(dataset.id, {
        id: dataset.id,
        // includeCountry: false — this app currently only ever shows one
        // country's map at a time, so "(Türkiye)" here is redundant context
        // clutter, not disambiguation (user-reported 2026-08-05; same
        // reasoning coarseResolutionNote's caller already applies elsewhere).
        label: friendlyDatasetLabel(t, dataset, { includeCountry: false }),
        stops: stops.map((s) => ({ color: s.color, from: labelFor(s.from), to: labelFor(s.to) })),
      })
    }
  }
  map.addSource(sourceId, { type: 'geojson', data: geojson })
  map.addLayer({ id: `${sourceId}-fill`, type: 'fill', source: sourceId, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': fillColor, 'fill-opacity': opacity * (isGridded ? 0.75 : 0.4) } })
  map.addLayer({ id: `${sourceId}-line`, type: 'line', source: sourceId, filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: { 'line-color': isGridded ? '#7f0000' : color, 'line-opacity': opacity * (isGridded ? 0.3 : 1), 'line-width': isGridded ? 0.5 : 2 } })
  map.addLayer({ id: `${sourceId}-point`, type: 'circle', source: sourceId, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': color, 'circle-opacity': opacity, 'circle-radius': 5 } })

  // Value labels — a separate, non-interactive symbol layer (not part of
  // EXPOSURE_SUB_LAYER_SUFFIXES's click-to-inspect loop below, so clicking a
  // number still opens the same popup the underlying fill/point would).
  // Always visible=true — gated purely by VALUE_LABEL_MINZOOM, no manual
  // toggle (per-cell numbers only make sense once zoomed in close enough to
  // tell cells apart; at country-wide zoom this stays off automatically).
  map.addLayer({
    id: `${sourceId}-labels`,
    type: 'symbol',
    source: sourceId,
    minzoom: VALUE_LABEL_MINZOOM,
    layout: {
      'text-field': ['get', '__metricValueLabel'],
      // Live-verified 2026-07-23: without an explicit text-font, MapLibre's
      // default font stack request doesn't match anything this app's map
      // styles' glyphs endpoint (tiles.openfreemap.org/fonts/{fontstack})
      // actually serves — the layer registers with no console error at all,
      // it just silently never draws any text. "Noto Sans Regular" is the
      // stack both bundled styles (dark/liberty, tiles.openfreemap.org)
      // confirmed to use for their own labels. Not fixable for the
      // ESRI_SATELLITE_STYLE raster style (getBaseStyle()) — that style has
      // no `glyphs` URL at all, a separate pre-existing limitation of using
      // a bare raster-tile style, not something this layer can work around.
      'text-font': ['Noto Sans Regular'],
      // Zoom-interpolated, not fixed: a constant pixel size stays visually
      // tiny relative to how much closer the user has zoomed in, reading as
      // "shrinking" even though it's technically constant. Grows from 14px
      // at VALUE_LABEL_MINZOOM (8) to 23px by zoom 14 (~30% bigger than the
      // original 11-18 range, per live legibility feedback 2026-07-23).
      // osm-buildings' labels are facility NAMES (longer strings than every
      // other source's short numeric label) — live-testing finding,
      // user-reported: at the very close zoom this app's 3D-building view
      // encourages, the same 23px cap read as oversized next to small
      // building footprints, so this source gets its own gentler curve
      // (caps lower and tapers back down instead of staying flat past z14).
      'text-size': dataset.source_name === 'osm-buildings'
        ? ['interpolate', ['linear'], ['zoom'], VALUE_LABEL_MINZOOM, 11, 14, 15, 18, 12]
        : ['interpolate', ['linear'], ['zoom'], VALUE_LABEL_MINZOOM, 14, 14, 23],
      'text-allow-overlap': false,
      visibility: 'visible',
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#000000',
      'text-halo-width': 2,
      'text-halo-blur': 0.5,
    },
  })

  for (const suffix of EXPOSURE_SUB_LAYER_SUFFIXES) {
    map.on('click', `${sourceId}${suffix}`, (e) => {
      const f = e.features?.[0]
      if (!f) return
      const { __metricValue, __metricValueLabel, __haloSeverity, ...properties } = f.properties ?? {}
      if (exposurePopup) exposurePopup.remove()
      exposurePopup = new maplibregl.Popup({ offset: 12, className: 'modern-popup-container', maxWidth: '320px', closeButton: false })
        .setLngLat(e.lngLat)
        .setHTML(buildFeaturePopupHtml(t, dataset, __metricValue, properties, __haloSeverity))
      // Must run before .addTo(map): MapLibre fires 'open' synchronously
      // inside addTo() itself, so registering the listener after it (as
      // this used to) missed that event entirely — the cascade offset
      // never applied and, worse, the custom close button's click handler
      // (also wired on 'open') never got attached, so the × visibly
      // rendered but did nothing (live-testing finding, 2026-07-31).
      registerPopupCascade(exposurePopup)
      exposurePopup.addTo(map)
    })
  }

  // spec 050 US2: this dataset's points may need to render already-colored
  // by distance from a currently-selected event (e.g. the user toggled the
  // critical-infrastructure layer on AFTER already selecting an event).
  if (dataset.source_name === 'osm-buildings') {
    updateCriticalInfraSeverityColoring()
    applyCriticalInfraCategoryFilter()
  }
}

function removeExposureLayerRendering(dataset) {
  if (!map) return
  exposureLegends.delete(dataset.id)
  const sourceId = exposureSourceId(dataset)
  for (const suffix of [...EXPOSURE_SUB_LAYER_SUFFIXES, '-labels']) {
    if (map.getLayer(sourceId + suffix)) map.removeLayer(sourceId + suffix)
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId)

  // spec 046 US2: also tear down any active region-view rendering (province
  // and/or district — both may be on at once, see below) and reset back to
  // defaults (hexagon on, province/district off) — re-toggling this dataset
  // on later always starts fresh regardless of what was active.
  for (const level of REGION_LEVELS) {
    const regSourceId = regionSourceId(dataset, level)
    for (const suffix of ['-fill', '-line', '-label']) {
      if (map.getLayer(regSourceId + suffix)) map.removeLayer(regSourceId + suffix)
    }
    if (map.getSource(regSourceId)) map.removeSource(regSourceId)
  }
  if (dataset.id in regionViewActive.value) {
    const next = { ...regionViewActive.value }
    delete next[dataset.id]
    regionViewActive.value = next
  }
}

// ── Region-level population view (spec 046 US2, extended for ADM2) ─────────
// Hexagons / Provinces / Districts are three INDEPENDENT toggles per
// dataset, not a single mutually-exclusive mode — turning Provinces on/off
// must never affect Districts and vice versa (live user request: "ikisini
// aynı anda çalıştırabilmeliyim", any combination can render at once).
// Distinct, manually-toggled per-dataset display state; independent of the
// automatic zoom-based hex resolution and spec 045's manual resolution
// slider (data-model.md's State additions / spec.md Assumptions).
// 'province' = ADM1 (il/state), 'district' = ADM2 (ilçe) — same rendering/
// aggregation path for both, just a different bundled boundary source
// (src/data/boundaries/index.js's `level` param) and layer-id suffix.
// Coarsest to finest — used both for the toggle set and to derive each
// level's border prominence (coarser = thicker/more opaque border, always
// rendered above finer levels' fills; see enforceRegionLayerOrder()).
const REGION_LEVELS = ['province', 'district', 'village']
const DEFAULT_REGION_VIEW_STATE = { hexagon: true, province: false, district: false, village: false }

// { [datasetId]: { hexagon, province, district: boolean } }
const regionViewActive = ref({})
// { [level]: { [countryCode]: loadRegionBoundaries() result | null } } —
// null once confirmed unavailable, absent key = not checked yet this session.
// shallowRef, not ref: this holds real GeoJSON FeatureCollections that get
// posted to the worker (runRegionAggregation). A deep ref() wraps nested
// values in reactive Proxies on read, and repeated {...prev, [key]: x}
// merges (one per ensureRegionBoundaryChecked call, e.g. province then
// district for the same country) end up permanently storing a Proxy as the
// actual data for whichever sibling key wasn't touched in that merge —
// toRaw() on the outer object only strips one layer, not that baked-in
// nested Proxy, and postMessage's structured clone throws DataCloneError on
// it (found via live testing: worked once, then failed once both levels had
// been populated). shallowRef never wraps nested data, so every reassigned
// value here stays a plain, clonable object — no toRaw() needed anywhere.
const regionBoundaryCache = shallowRef({ province: {}, district: {} })
// Whether the worker-computed aggregation is currently in flight — keyed
// per dataset *and* level (not just dataset) so turning both Provinces and
// Districts on back-to-back gets two independent loading states instead of
// one clobbering the other. Drives the toggle buttons' disabled/label state
// so the wait reads as "working", not a frozen UI (live user feedback:
// without this the switch felt like it hung, then "suddenly" popped in).
const regionViewLoading = ref({})

function regionSourceId(dataset, level) {
  return `${exposureSourceId(dataset)}-${level}`
}

function regionViewLoadingKey(dataset, level) {
  return `${dataset.id}:${level}`
}

function regionViewLoadingFor(dataset, level) {
  return !!regionViewLoading.value[regionViewLoadingKey(dataset, level)]
}

// Dedicated worker (not hexWorker — its lazy-init is tied to the unrelated
// hexbins/"Petek" toggle) running the point-in-polygon aggregation off the
// main thread. See provinceAggregationWorker.js — the aggregation function
// itself is level-agnostic (just sums a metric into whatever boundary
// FeatureCollection it's given), reused unchanged for district level too.
let regionWorker = null
let regionRequestSeq = 0
const regionPendingRequests = new Map() // requestId -> resolve fn

function runRegionAggregation(populationFeatures, regionFeatureCollection, nameProperty) {
  if (!regionWorker) {
    regionWorker = new ProvinceAggregationWorker()
    regionWorker.onmessage = ({ data }) => {
      const resolve = regionPendingRequests.get(data.requestId)
      if (!resolve) return
      regionPendingRequests.delete(data.requestId)
      resolve(data.result)
    }
  }
  const requestId = ++regionRequestSeq
  return new Promise((resolve) => {
    regionPendingRequests.set(requestId, resolve)
    regionWorker.postMessage({ requestId, populationFeatures, provinceFeatureCollection: regionFeatureCollection, nameProperty })
  })
}

function regionViewStateFor(dataset) {
  return regionViewActive.value[dataset.id] ?? DEFAULT_REGION_VIEW_STATE
}

function isRegionLevelActive(dataset, level) {
  return !!regionViewStateFor(dataset)[level]
}

function isRegionViewAvailable(dataset, level) {
  return !!regionBoundaryCache.value[level]?.[dataset.country_code]
}

async function ensureRegionBoundaryChecked(countryCode, level) {
  if (!countryCode) return
  if (countryCode in (regionBoundaryCache.value[level] ?? {})) return
  const boundary = await loadRegionBoundaries(countryCode, level)
  regionBoundaryCache.value = {
    ...regionBoundaryCache.value,
    [level]: { ...regionBoundaryCache.value[level], [countryCode]: boundary },
  }
}

function setHexagonSubLayersVisibility(dataset, visibility) {
  if (!map) return
  const sourceId = exposureSourceId(dataset)
  for (const suffix of [...EXPOSURE_SUB_LAYER_SUFFIXES, '-labels']) {
    const layerId = sourceId + suffix
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
  }
}

function buildRegionPopupHtml(regionName, totalPopulation) {
  const accent = POPULATION_RAMP[POPULATION_RAMP.length - 1]
  return `
    <div class="disaster-popup-modern" style="--severity-color: ${accent}; --severity-rgba: rgba(203, 24, 29, 0.18);">
      ${POPUP_CLOSE_BTN_HTML}
      <div class="popup-header">
        <span class="chip type-chip" style="background: ${accent}; color: #fff;">${regionName ?? ''}</span>
      </div>
      <div class="popup-body">
        <div class="popup-metrics"><span><b>${t('exposureLayers.regionView.populationLabel')}:</b> ${Number(totalPopulation ?? 0).toLocaleString()}</span></div>
      </div>
    </div>
  `
}

async function enableRegionView(dataset, level) {
  if (!map || regionViewLoadingFor(dataset, level)) return
  const boundary = regionBoundaryCache.value[level]?.[dataset.country_code]
  const populationGeojson = exposureFeatureCache.get(dataset.id)
  if (!boundary || !populationGeojson) return // toggle shouldn't be reachable in this state, but degrade safely (FR-007)

  const sourceId = regionSourceId(dataset, level)
  if (map.getSource(sourceId)) return // already rendered

  const loadingKey = regionViewLoadingKey(dataset, level)
  regionViewLoading.value = { ...regionViewLoading.value, [loadingKey]: true }
  const aggregated = await runRegionAggregation(populationGeojson, boundary.featureCollection, boundary.nameProperty)
  regionViewLoading.value = { ...regionViewLoading.value, [loadingKey]: false }

  // The user may have turned this level back off (or toggled the whole
  // dataset off) while the worker was computing. Don't render a stale
  // result over whatever state they're in now — note this only checks
  // *this* level; Provinces/Districts are independent, so the other
  // level's state is irrelevant here.
  if (!map || !isRegionLevelActive(dataset, level) || map.getSource(sourceId)) return

  const opacity = getLayerOpacity(exposureLayerKey(dataset))
  map.addSource(sourceId, { type: 'geojson', data: aggregated })

  // A coarser level's border must read as the "official" outline finer
  // levels sit inside of (live feedback: turning Provinces and Districts on
  // together made it impossible to tell which district belongs to which
  // province, because the district fill completely covered the province's
  // own border line) — border prominence scales with coarseness: Provinces
  // draw the thickest/most opaque (white) border, Districts a medium one,
  // Villages the original thin/subtle style. Actual stacking (so the
  // thicker border isn't itself covered by a finer level's fill) is
  // enforced separately via enforceRegionLayerOrder() below, regardless of
  // which order the user clicks the toggles in.
  const REGION_LINE_PAINT = {
    province: { 'line-color': '#ffffff', 'line-opacity': Math.max(opacity, 0.85), 'line-width': 2.5 },
    district: { 'line-color': '#7f0000', 'line-opacity': Math.max(opacity * 0.3, 0.5), 'line-width': 1.5 },
    village: { 'line-color': '#7f0000', 'line-opacity': opacity * 0.3, 'line-width': 1 },
  }
  map.addLayer({
    id: `${sourceId}-fill`,
    type: 'fill',
    source: sourceId,
    // populationFillExpression() reads __metricValue, which
    // aggregatePopulationByProvince() also injects alongside
    // totalPopulation — same graduated ramp/logic as hexagons (FR-005),
    // scaled to this collection's own min/max, zero new color code.
    paint: { 'fill-color': populationFillExpression(aggregated), 'fill-opacity': opacity * 0.75 },
  })
  map.addLayer({
    id: `${sourceId}-line`,
    type: 'line',
    source: sourceId,
    paint: REGION_LINE_PAINT[level],
  })
  // Always-on name + population label (live feedback: names weren't visible
  // at all before, only on click) — district level can run into the
  // hundreds of features (Turkey: 973), still far fewer than the hexagon
  // grid's tens of thousands, so no zoom-gating needed the way
  // VALUE_LABEL_MINZOOM is for that layer; MapLibre's own
  // text-allow-overlap:false thins out crowded small districts at low zoom.
  map.addLayer({
    id: `${sourceId}-label`,
    type: 'symbol',
    source: sourceId,
    layout: {
      'text-field': ['get', '__provinceLabel'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 13,
      'text-allow-overlap': false,
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.5 },
  })
  enforceRegionLayerOrder(dataset)

  map.on('click', `${sourceId}-fill`, (e) => {
    const f = e.features?.[0]
    if (!f) return
    if (exposurePopup) exposurePopup.remove()
    exposurePopup = new maplibregl.Popup({ offset: 12, className: 'modern-popup-container', maxWidth: '320px', closeButton: false })
      .setLngLat(e.lngLat)
      .setHTML(buildRegionPopupHtml(f.properties?.provinceName, f.properties?.totalPopulation))
    registerPopupCascade(exposurePopup)
    exposurePopup.addTo(map)
  })
}

// Any combination of Provinces/Districts/Villages can be on at once
// (independent toggles), and each addLayer() call by default just stacks on
// top of whatever's already there — so the *order* toggles were clicked in
// would otherwise decide what's visible, not what should be. This enforces
// one fixed, sensible order every time any level's layers change: fills
// coarsest-to-finest at the bottom (a finer level's fill, added later in
// this list, ends up on top of a coarser one's — it's the more detailed
// layer, its colors should read clearly), then borders finest-to-coarsest
// (so Provinces' thick border ends up on top of *everything*, never
// obscured by Districts'/Villages' fill — the actual bug this fixes; a
// medium Districts border likewise stays above Villages'), then labels in
// that same finest-to-coarsest order. moveLayer(id) with no beforeId moves
// that layer to the very top; calling it in this exact sequence leaves
// every listed layer in exactly this relative order at the top of the
// stack, above hexagon's layers (never touched, so implicitly stay lowest).
function enforceRegionLayerOrder(dataset) {
  if (!map) return
  const coarseToFine = REGION_LEVELS
  const fineToCoarse = [...REGION_LEVELS].reverse()
  const order = [
    ...coarseToFine.map((level) => `${regionSourceId(dataset, level)}-fill`),
    ...fineToCoarse.map((level) => `${regionSourceId(dataset, level)}-line`),
    ...fineToCoarse.map((level) => `${regionSourceId(dataset, level)}-label`),
  ]
  for (const id of order) {
    if (map.getLayer(id)) map.moveLayer(id)
  }
}

function disableRegionView(dataset, level) {
  if (!map) return
  const sourceId = regionSourceId(dataset, level)
  for (const suffix of ['-fill', '-line', '-label']) {
    if (map.getLayer(sourceId + suffix)) map.removeLayer(sourceId + suffix)
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

// Each of Hexagons/Provinces/Districts is an independent on/off toggle, not
// a mutually-exclusive mode — toggling one never turns another off (live
// user request: turning Provinces on/off must leave Districts exactly as
// it was, and vice versa; any combination can be active at once).
function toggleRegionLevel(dataset, level) {
  if (level !== 'hexagon' && !isRegionViewAvailable(dataset, level)) return // FR-007: disabled option is not clickable-through
  if (level !== 'hexagon' && regionViewLoadingFor(dataset, level)) return // ignore re-click while its own load is in flight

  const current = regionViewStateFor(dataset)
  const next = { ...current, [level]: !current[level] }
  regionViewActive.value = { ...regionViewActive.value, [dataset.id]: next }
  if (!mapLoaded) return

  if (level === 'hexagon') setHexagonSubLayersVisibility(dataset, next.hexagon ? 'visible' : 'none')
  else if (next[level]) enableRegionView(dataset, level)
  else disableRegionView(dataset, level)
}

// Only the currently selected country's own exposure datasets — the panel
// used to list every served country's datasets at once (Malaysia/Madagascar/
// Turkey all mixed together regardless of which country was selected), which
// made toggling a layer for the "wrong" country trivially easy. `null` when
// no country is selected, matching visibleExposureDatasets being empty then.
const visibleExposureDatasets = computed(() =>
  exposureLayersStore.datasets.filter((d) => d.country_code === selectedCountryCode.value),
)

// Turns off (and un-renders) any currently-visible exposure dataset that
// does not belong to `countryCode` — called on every country
// selection/deselection so switching countries never leaves a
// no-longer-listed layer silently still rendered on the map.
function hideExposureLayersNotForCountry(countryCode) {
  for (const dataset of exposureLayersStore.datasets) {
    if (dataset.country_code === countryCode) continue
    const key = exposureLayerKey(dataset)
    if (!isLayerVisible(key)) continue
    if (mapLoaded) removeExposureLayerRendering(dataset)
    layerVisibility.value = { ...layerVisibility.value, [key]: false }
  }
}

function toggleExposureLayer(dataset) {
  const key = exposureLayerKey(dataset)
  const next = !isLayerVisible(key)
  layerVisibility.value = { ...layerVisibility.value, [key]: next }
  if (!mapLoaded) return
  if (next) addExposureLayer(dataset)
  else removeExposureLayerRendering(dataset)
}

function setExposureLayerOpacity(dataset, value) {
  const key = exposureLayerKey(dataset)
  layerOpacity.value = { ...layerOpacity.value, [key]: value }
  if (!map || !isLayerVisible(key)) return
  const sourceId = exposureSourceId(dataset)
  const isGridded = isPopulationSource(dataset.source_name) || isGridMetricSource(dataset.source_name)
  if (map.getLayer(`${sourceId}-fill`)) map.setPaintProperty(`${sourceId}-fill`, 'fill-opacity', value * (isGridded ? 0.75 : 0.4))
  if (map.getLayer(`${sourceId}-line`)) map.setPaintProperty(`${sourceId}-line`, 'line-opacity', value * (isGridded ? 0.3 : 1))
  if (map.getLayer(`${sourceId}-point`)) map.setPaintProperty(`${sourceId}-point`, 'circle-opacity', value)
}

// Impact Analysis (spec 008): selected event for the split-view side panel,
// set from marker clicks below — independent of the existing popup behavior.
const selectedImpactEvent = ref(null)

// Impact halo (spec 050 US1/US2): a translucent circle at the selected
// event's existing defaultBufferRadiusKm() radius, plus distance-graded
// severity coloring for critical-infrastructure points inside it. Purely
// client-side — no new network round-trip, reuses data already loaded for
// the map (SC-001/SC-002 in spec.md).
const haloOpacity = ref(0.6) // 0-1, driven by ImpactPanel's vertical slider
// ImpactPanel is the source of truth for the radius actually in use (it
// accounts for the user's manual "Yarıçap geçersiz kılma" override, spec 050
// US1 follow-up) — falls back to the raw defaultBufferRadiusKm() only
// before ImpactPanel has had a chance to report in (e.g. the instant an
// event is first selected).
const externalHaloRadiusKm = ref(null)
const haloRadiusKm = computed(() => {
  if (!selectedImpactEvent.value) return null
  return externalHaloRadiusKm.value ?? defaultBufferRadiusKm(selectedImpactEvent.value)
})

function updateImpactHalo() {
  if (!map || !mapLoaded || !map.getSource('impact-halo')) return
  const event = selectedImpactEvent.value
  if (!event || haloRadiusKm.value == null) {
    map.getSource('impact-halo').setData({ type: 'FeatureCollection', features: [] })
    map.setPaintProperty('impact-halo-fill', 'fill-opacity', 0)
    map.setPaintProperty('impact-halo-line', 'line-opacity', 0)
    updateCriticalInfraSeverityColoring()
    return
  }
  const polygon = circlePolygon(event.lat, event.lng, haloRadiusKm.value)
  map.getSource('impact-halo').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: polygon, properties: {} }] })
  map.setPaintProperty('impact-halo-fill', 'fill-opacity', haloOpacity.value * 0.25)
  map.setPaintProperty('impact-halo-line', 'line-opacity', haloOpacity.value)
  updateCriticalInfraSeverityColoring()
}

// A feature's representative point for distance purposes — its own
// coordinate for a Point, otherwise a simple average of the outer ring's
// vertices (good enough at halo-radius scale; not a true area centroid, but
// osmBuildingsFetch.ts's `nwr[...]` Overpass query returns some critical
// facilities as ways/polygons (e.g. a whole hospital/campus compound), not
// just point nodes — live-testing finding, user-reported: a large campus
// polygon rendered with the flat fixed color, never picking up US2's
// distance grading at all, because only the Point sub-layer was recolored).
function representativePoint(geometry) {
  if (geometry.type === 'Point') return geometry.coordinates
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0] : null
  if (!ring || ring.length === 0) return null
  const sum = ring.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0])
  return [sum[0] / ring.length, sum[1] / ring.length]
}

// US2: recolors the already-loaded osm-buildings (critical-infrastructure)
// exposure layer's points AND polygons by distance from the selected event,
// IF that layer happens to be toggled visible on the map. Mutates the
// cached GeoJSON's feature properties in place (no re-fetch) and re-sets
// the source data + paint expressions; clears back to the fixed violet
// color when no event is selected or the layer isn't on.
function updateCriticalInfraSeverityColoring() {
  if (!map) return
  const criticalInfraDataset = exposureLayersStore.datasets.find((d) => d.source_name === 'osm-buildings')
  if (!criticalInfraDataset) return
  const sourceId = exposureSourceId(criticalInfraDataset)
  const source = map.getSource(sourceId)
  const geojson = exposureFeatureCache.get(criticalInfraDataset.id)
  if (!source || !geojson) return

  const event = selectedImpactEvent.value
  const radius = haloRadiusKm.value
  const pointLayerId = `${sourceId}-point`
  const fillLayerId = `${sourceId}-fill`
  if (!map.getLayer(pointLayerId)) return

  const fixedColor = colorForDataset(criticalInfraDataset)
  if (!event || radius == null) {
    for (const feature of geojson.features) delete feature.properties.__haloSeverity
    source.setData(geojson)
    map.setPaintProperty(pointLayerId, 'circle-color', fixedColor)
    if (map.getLayer(fillLayerId)) map.setPaintProperty(fillLayerId, 'fill-color', fixedColor)
    return
  }

  for (const feature of geojson.features) {
    const point = representativePoint(feature.geometry)
    if (!point) continue
    const [lng, lat] = point
    const d = distanceKm(event.lat, event.lng, lat, lng)
    feature.properties.__haloSeverity = d <= radius ? 1 - Math.min(d / radius, 1) : null
  }
  source.setData(geojson)
  const severityColorExpression = [
    'case',
    ['==', ['get', '__haloSeverity'], null], fixedColor,
    ['interpolate', ['linear'], ['get', '__haloSeverity'],
      0, HALO_SEVERITY_RAMP[0],
      1, HALO_SEVERITY_RAMP[HALO_SEVERITY_RAMP.length - 1]],
  ]
  map.setPaintProperty(pointLayerId, 'circle-color', severityColorExpression)
  if (map.getLayer(fillLayerId)) map.setPaintProperty(fillLayerId, 'fill-color', severityColorExpression)
}

watch(selectedImpactEvent, () => {
  externalHaloRadiusKm.value = null // avoid briefly reusing the previous event's override radius
  updateImpactHalo()
})
watch(haloOpacity, () => updateImpactHalo())
watch(externalHaloRadiusKm, () => updateImpactHalo())

// Critical-infrastructure category filter (user-requested follow-up to
// spec 050): "deprem gece oldu, okulları düşünmemize gerek yok, sağlık
// ocaklarını düşünmeliyiz" — lets an operator show/hide facility
// categories independently (e.g. hide schools at night, hide a category
// once its buildings are known to be destroyed), same visual pattern as
// the population layer's hexagon/province/district/village toggle row,
// but purely a client-side MapLibre filter — no new fetch, the points are
// already loaded.
const CRITICAL_INFRA_CATEGORIES = ['critical_infrastructure_health', 'critical_infrastructure_education', 'critical_infrastructure_emergency']
const criticalInfraCategoryFilter = ref(Object.fromEntries(CRITICAL_INFRA_CATEGORIES.map((c) => [c, true])))

function isCriticalInfraCategoryActive(category) {
  return criticalInfraCategoryFilter.value[category] !== false
}

function toggleCriticalInfraCategory(category) {
  criticalInfraCategoryFilter.value = { ...criticalInfraCategoryFilter.value, [category]: !isCriticalInfraCategoryActive(category) }
  applyCriticalInfraCategoryFilter()
}

function applyCriticalInfraCategoryFilter() {
  if (!map) return
  const criticalInfraDataset = exposureLayersStore.datasets.find((d) => d.source_name === 'osm-buildings')
  if (!criticalInfraDataset) return
  const sourceId = exposureSourceId(criticalInfraDataset)
  const activeCategories = CRITICAL_INFRA_CATEGORIES.filter((c) => isCriticalInfraCategoryActive(c))
  const categoryFilter = ['in', ['get', 'asset_category'], ['literal', activeCategories]]

  const fillLayerId = `${sourceId}-fill`
  const lineLayerId = `${sourceId}-line`
  const pointLayerId = `${sourceId}-point`
  if (map.getLayer(fillLayerId)) map.setFilter(fillLayerId, ['all', ['==', ['geometry-type'], 'Polygon'], categoryFilter])
  if (map.getLayer(lineLayerId)) map.setFilter(lineLayerId, ['all', ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], categoryFilter])
  if (map.getLayer(pointLayerId)) map.setFilter(pointLayerId, ['all', ['==', ['geometry-type'], 'Point'], categoryFilter])
}

function onLocationSelected(location) {
  if (!map) return
  map.flyTo({ center: [location.lng, location.lat], zoom: location.zoom || 10 })
}

/**
 * Fixes antimeridian wrapping and winding order for GeoJSON features.
 * Prevents horizontal line artifacts (common in Russia/Fiji) and polygon gaps.
 */
function fixGeometry(geojson) {
  if (!geojson) return geojson

  const processFeature = (f) => {
    if (!f.geometry) return f
    const geom = f.geometry

    if (geom.type === 'Polygon') {
      geom.coordinates = geom.coordinates.map((ring) => fixRing(ring))
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates = geom.coordinates.map((poly) => poly.map((ring) => fixRing(ring)))
    }
    return f
  }

  const fixRing = (ring) => {
    if (!ring || ring.length < 3) return ring
    let lastLng = ring[0][0]
    const newRing = [ring[0]]

    for (let i = 1; i < ring.length; i++) {
      let lng = ring[i][0]
      const lat = ring[i][1]

      // Detect wrap-around jumps (> 180 degrees)
      if (lng - lastLng > 180) lng -= 360
      else if (lng - lastLng < -180) lng += 360

      newRing.push([lng, lat])
      lastLng = lng
    }

    // Ensure ring is closed and has minimal valid geometry
    if (newRing.length > 2) {
      const last = newRing[newRing.length - 1]
      const first = newRing[0]
      if (last[0] !== first[0] || last[1] !== first[1]) {
        newRing.push([first[0], first[1]])
      }
    }
    return newRing
  }

  if (geojson.type === 'FeatureCollection') {
    return { ...geojson, features: geojson.features.map(processFeature) }
  } else if (geojson.type === 'Feature') {
    return processFeature(geojson)
  }
  return geojson
}

const { t } = useI18n()
const router = useRouter()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()

const mapContainer = ref(null)
let map = null
let mapLoaded = false
let styleLoadVersion = 0
// MapLibre never learns about a container resize on its own — it keeps
// rendering at whatever pixel size it was last told about. Nothing in this
// file called map.resize() after the initial mount, so any layout change to
// mapContainer's actual box (not just floating panels drawn on top of it,
// which don't affect this) left the WebGL canvas's own framebuffer stale
// relative to its now-different CSS box: a live-testing regression,
// 2026-08-03 (selectCountry()'s flyTo landing while some layout shift was
// mid-flight visibly detached the canvas from its container, most of the
// viewport gone black). One observer for the container's whole lifetime,
// disconnected on unmount.
let mapResizeObserver = null
let markerObjects = []
let popupZIndexCounter = 1000 // bring-to-front stacking order for open popups

// "İskambil kağıdı" fan-out (user-reported, 2026-07-30): the earlier bring-
// to-front z-index fix only decides which popup is ON TOP when two overlap
// — it does nothing when they sit at the exact same screen point (a marker
// popup and a population-hex-click popup opened in roughly the same spot
// is the exact reported case), which just fully hides the back one with no
// way to even click it. This nudges each additional simultaneously-open
// popup a bit further from its true anchor (MapLibre's own `setOffset`,
// not a CSS transform — a raw transform would fight MapLibre's own
// position-tracking transform on the same element) so they fan out like a
// spread hand of cards and every one stays reachable.
let openPopups = []

function registerPopupCascade(popup) {
  popup.on('open', () => {
    if (!openPopups.includes(popup)) openPopups.push(popup)
    const idx = openPopups.indexOf(popup)
    popup.setOffset([12 + idx * 22, 12 + idx * 22])
    popup.getElement()?.querySelector('.popup-close-x')?.addEventListener('click', () => popup.remove())
  })
  popup.on('close', () => {
    openPopups = openPopups.filter((p) => p !== popup)
  })
}
let shelterMarkerObjects = []
let drillEventMarkerObjects = []
let userMarkerObj = null
const styleCache = {}
let hexWorker = null
let interactionsSetUp = false

// ── Static Mesh cache: resolution → Feature[] ────────────────────────────────
const hexGridCache = new Map()

// Resolution stored in DB via backfill (res 7)
const DB_HEX_RES = 7

// Hex color used to just be its own hardcoded map (critical=purple, unlike
// everywhere else critical=red) — inconsistent with the sidebar's own
// Yoğunluk Ölçeği legend and every marker's own color, and purple reading
// as "most severe" isn't intuitive the way red does (user-reported,
// 2026-07-30). Reuses getSeverityHex() (already the single source of truth
// for markers/legend) instead of a second color table to keep in sync by
// hand — also picks up colorblind-mode automatically as a side effect.
const SEVERITY_OPACITY = { critical: 0.72, high: 0.58, moderate: 0.42, low: 0.28, minimal: 0.18 }
const SEV_ORDER = ['minimal', 'low', 'moderate', 'high', 'critical']

// Country focus state
let selectedCountryBounds = null // LngLatBounds of selected country
let countryHexRes = null // resolution of country grid features
let countryHexFeatures = null // raw Feature[] from FILL_GRID (geometry only, for re-injection)
// Captured once from the real map on first load (see the 'load' handler in
// initMap) so clearCountrySelection() can fly back to the actual starting
// view instead of a guessed/hardcoded zoom — whatever the base style's own
// default center/zoom happens to be.
let defaultCameraState = null
// Whatever Durum/Petek/Isı mode was active right before selectCountry()
// forces 'hexagon' on — restored by clearCountrySelection() so pressing the
// country badge's ✕ goes back to what the user actually had (including
// 'off'/null), instead of clearCountrySelection() hardcoding 'heatmap'
// regardless (user-reported, 2026-08-04: leaving a country selection always
// left Isı on even if it had been off before selecting).
let mapModeBeforeCountrySelection = null

// 0 = Açık (liberty), 1 = Koyu (dark), 2 = Uydu
const mapStyleIndex = ref(0)
const currentZoom = ref(3)

// Collapses the exposure-layers panel down to a small layers-icon square
// anchored at its own top-right corner — current full size is the max, it
// never grows past that.
const exposureLayersPanelCollapsed = ref(false)

// Same collapse behavior as exposureLayersPanelCollapsed above, but for the
// shelters/community-reports toggle panel on the left — collapses down to a
// small pin-icon square anchored at its own top-left corner.
const sheltersLayerPanelCollapsed = ref(false)

// Briefly simulates a hover on the (now auto-collapsed) shelters/exposure
// panels right after a double-click zoom lands, so their collapsed icons
// don't just silently sit there unexplained — see zoomToCountry()'s
// map.once('moveend', ...) below, which flips this true then back false
// ~3s later. Rendered via <Teleport to="body"> at real getBoundingClientRect()
// coordinates (sheltersHintAnchorEl/exposureHintAnchorEl, computed into
// sheltersHintPos/exposureHintPos below) rather than positioned relative to
// the collapsed panel itself — both panels sit inside ancestors with their
// own overflow/scroll rules (needed for the panels' own collapse animation
// and, for the right one, .layer-panel-stack's vertical scrolling), which
// silently clipped an absolutely-positioned bubble poking out past their
// box (live-testing finding: worked on the left, not on the right — same
// bug, just one ancestor chain happened to avoid it). Teleporting to body
// sidesteps every ancestor's CSS entirely.
const showCollapsedPanelHints = ref(false)
let collapsedPanelHintTimer = null
const sheltersHintAnchorEl = ref(null)
const exposureHintAnchorEl = ref(null)
const sheltersHintPos = ref(null)
const exposureHintPos = ref(null)

// sheltersHintAnchorEl/exposureHintAnchorEl can resolve to either a plain
// DOM element (native tag) or a Vue component's public instance (shadcn's
// <Button>, which doesn't call defineExpose but still gets a default `$el`
// pointing at its rendered root) — this normalizes both to a real element.
function anchorElement(ref) {
  return ref?.$el ?? ref
}

watch(showCollapsedPanelHints, (visible) => {
  if (!visible) return
  nextTick(() => {
    if (sheltersHintAnchorEl.value) {
      const r = anchorElement(sheltersHintAnchorEl.value).getBoundingClientRect()
      sheltersHintPos.value = { top: r.top + r.height / 2, left: r.right + 10 }
    }
    if (exposureHintAnchorEl.value) {
      const r = anchorElement(exposureHintAnchorEl.value).getBoundingClientRect()
      exposureHintPos.value = { top: r.top + r.height / 2, right: window.innerWidth - r.left + 10 }
    }
  })
})

// ── Country interaction state ────────────────────────────────────────────────
let hoveredFeatureId = null
let selectedFeatureId = null
let hoveredFeatureSource = 'world-countries'
let selectedFeatureSource = 'world-countries'
const hoveredCountryName = ref(null)
const hoveredCountryPoint = ref({ x: 0, y: 0 })
const selectedCountryName = ref(null)
// ISO2 code of the currently selected country (alpha-2, lowercase) — drives
// exposure-layer panel filtering below so a user only ever sees the
// selected country's own datasets, never every served country's mixed
// together.
const selectedCountryCode = ref(null)
const _symbolFilterCache = new Map()
// Pre-compute all country features once for geometry lookups
const _allCountryFeatures = [
  ...feature(countriesTopo, countriesTopo.objects.countries).features.map((f) => ({
    ...f,
    source: 'world-countries',
  })),
  ...CUSTOM_TERRITORIES.features.map((f) => ({ ...f, source: 'custom-territories' })),
]

// Each step = ~1.5 zoom levels = ~3× magnification → each hex splits into 7 children (H3 hierarchy)
function hexResForZoom(z) {
  if (z < 5)  return 3  // dünya / kıta
  if (z < 7)  return 4  // ülke
  if (z < 9)  return 5  // bölge
  return 6              // zoom 9+ donuk (şehir seviyesi)
}
const currentHexRes = computed(() => hexResForZoom(currentZoom.value))

watch(currentHexRes, (newRes) => {
  if (!mapLoaded) return
  // Clear cached grid for new resolution so worker recomputes
  hexGridCache.delete(newRes)
  updateHexbins()

  // Refresh country hex grid at new resolution if a country is selected —
  // but never override a manually-set resolution (spec 045 FR-005): a
  // zoom-bucket crossing must not silently revert the user's own choice.
  // (Regressed 2026-07-30 "ui fix" commit, restored 2026-07-31 — user
  // reported the selected country's hex grid no longer tracked zoom, so
  // it visually drifted out of alignment while zooming in/out.)
  if (uiStore.manualHexResolution == null && selectedFeatureId && hexWorker) {
    const f = _allCountryFeatures.find((cf) => cf.id === selectedFeatureId)
    if (f) {
      const gridRes = Math.min(newRes, 6)
      countryHexRes = gridRes + 1
      hexWorker.postMessage({ type: 'FILL_GRID', geometry: f.geometry, resolution: gridRes })
    }
  }
})

watch(
  () => currentZoom.value,
  (newZoom, oldZoom) => {
    // Only re-run marker update if crossing the threshold (8)
    if ((oldZoom < 8 && newZoom >= 8) || (oldZoom >= 8 && newZoom < 8)) {
      scheduleUpdateMarkers()
    }
  },
)

// ── Static Mesh + Dynamic Signal helpers ─────────────────────────────────────

/**
 * Build a signal map keyed at min(displayRes, DB_HEX_RES).
 * Returns { sigMap, sigRes } where sigRes is the effective key resolution.
 */
function buildSignalMap(displayRes) {
  const sigRes = Math.min(displayRes, DB_HEX_RES)
  const sigMap = new Map()
  for (const ev of disasterStore.h3Events) {
    // Resolve h3_id: use stored value or compute from coordinates
    let h3id = ev.h3_id
    if (!h3id && ev.lat != null && ev.lng != null) {
      try {
        h3id = latLngToCell(Number(ev.lat), Number(ev.lng), DB_HEX_RES)
      } catch {
        continue
      }
    }
    if (!h3id) continue

    let key = h3id
    try {
      const evRes = getResolution(h3id)
      if (evRes > sigRes) key = cellToParent(h3id, sigRes)
      else if (evRes < sigRes) continue
    } catch {
      continue
    }

    const ex = sigMap.get(key)
    if (!ex) {
      sigMap.set(key, { count: ev.count || 1, maxSeverity: ev.maxSeverity || 'minimal' })
    } else {
      ex.count += ev.count || 1
      if (SEV_ORDER.indexOf(ev.maxSeverity) > SEV_ORDER.indexOf(ex.maxSeverity))
        ex.maxSeverity = ev.maxSeverity
    }
  }
  return { sigMap, sigRes }
}

/** Inject event signal colors into the cached viewport grid → update disaster-hex source. */
function applySignalToGrid() {
  if (!map || !mapLoaded) return
  const res = currentHexRes.value
  const cached = hexGridCache.get(res)
  if (!cached?.length) return

  const { sigMap, sigRes } = buildSignalMap(res)

  const features = []
  for (const f of cached) {
    let lookupId = f.properties.h3_id
    if (res > sigRes) {
      try {
        lookupId = cellToParent(f.properties.h3_id, sigRes)
      } catch {
        continue
      }
    }
    const sig = sigMap.get(lookupId)
    if (!sig) continue
    features.push({
      ...f,
      properties: {
        ...f.properties,
        color: getSeverityHex(sig.maxSeverity),
        opacity: SEVERITY_OPACITY[sig.maxSeverity] || 0.18,
        eventCount: sig.count,
        maxSeverity: sig.maxSeverity,
      },
    })
  }
  map.getSource('disaster-hex')?.setData({ type: 'FeatureCollection', features })
}

/** Inject signal colors into country grid features and update country-hex-grid source. */
function applySignalToCountryGrid(features) {
  if (!map || !mapLoaded || countryHexRes == null) return
  countryHexFeatures = features // cache raw geometry for future re-injection

  const { sigMap, sigRes } = buildSignalMap(countryHexRes)

  const colored = features.map((f) => {
    let lookupId = f.properties.h3_id
    if (countryHexRes > sigRes) {
      try {
        lookupId = cellToParent(f.properties.h3_id, sigRes)
      } catch {
        return f
      }
    }
    const sig = sigMap.get(lookupId)
    if (!sig) return f
    return {
      ...f,
      properties: {
        ...f.properties,
        color: getSeverityHex(sig.maxSeverity),
        opacity: SEVERITY_OPACITY[sig.maxSeverity] || 0.04,
        eventCount: sig.count,
        maxSeverity: sig.maxSeverity,
      },
    }
  })

  map.getSource('country-hex-grid')?.setData({ type: 'FeatureCollection', features: colored })
}

// ── Land cell sets (computed once) ───────────────────────────────────────────
let landCellsRes3 = null // Set of H3 res3 cells covering land

/** Build Set of all H3 res3 cells that cover land using world-atlas TopoJSON. */
function getLandCells() {
  if (landCellsRes3) return landCellsRes3
  landCellsRes3 = new Set()
  const landGeo = feature(landTopo, landTopo.objects.land)
  for (const f of landGeo.features) {
    const geom = f.geometry
    // MultiPolygon: iterate each sub-polygon separately (polygonToCells only accepts Polygon)
    const polygonList =
      geom.type === 'MultiPolygon'
        ? geom.coordinates.map((coords) => ({ type: 'Polygon', coordinates: coords }))
        : [{ type: 'Polygon', coordinates: geom.coordinates }]
    for (const poly of polygonList) {
      try {
        // containmentMode 2 = overlapping: include cells that partially overlap land (better coastal coverage)
        const cells = polygonToCells(poly, 3, 2)
        for (const c of cells) landCellsRes3.add(c)
      } catch (err) {
        console.warn('[Hex] polygonToCells error, skipping polygon:', err?.message ?? err)
      }
    }
  }
  console.log(`[Hex] Land cell set built: ${landCellsRes3.size} res3 cells`)
  return landCellsRes3
}

// ─────────────────────────────────────────────────────────────────────────────

const MAP_STYLES = [
  { label: 'Koyu', url: 'https://tiles.openfreemap.org/styles/dark', preview: 'preview-dark' },
  { label: 'Uydu', url: null, preview: 'preview-satellite' },
  { label: 'Açık', url: 'https://tiles.openfreemap.org/styles/liberty', preview: 'preview-street' },
]

// 3D terrain (satellite view only): free, no-API-key elevation tiles from
// AWS's public "Terrarium"-encoded DEM bucket (ex-Mapzen, still widely used
// by MapLibre demos). Fetched through a custom 'demcache' protocol so
// already-downloaded tiles are served from the Cache Storage API instead of
// re-fetched every time the same area/country is revisited.
const DEM_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const DEM_CACHE_NAME = 'mhews-dem-tiles-v1'
const DEM_TERRAIN_SOURCE_ID = 'terrain-dem'

maplibregl.addProtocol('demcache', async (params, abortController) => {
  const realUrl = params.url.replace('demcache://', '')
  const cache = await caches.open(DEM_CACHE_NAME)
  const cached = await cache.match(realUrl)
  if (cached) {
    return { data: await cached.arrayBuffer() }
  }
  const response = await fetch(realUrl, { signal: abortController.signal })
  if (!response.ok) throw new Error(`DEM tile fetch failed: ${response.status}`)
  // Cache a clone — the original body is still needed below to return data.
  cache.put(realUrl, response.clone())
  return { data: await response.arrayBuffer() }
})

const ESRI_SATELLITE_STYLE = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'esri-satellite-layer', type: 'raster', source: 'esri-satellite' }],
}

const isSatellite = computed(() => mapStyleIndex.value === 1)
const terrain3DEnabled = ref(false)

// Self-hosted vector tiles (docker-compose.yml's tile-builder/tileserver) —
// replaces the public tiles.openfreemap.org dependency for countries we've
// built local .mbtiles for, root cause of the 2026-08-02 "black map" live
// incident (a free, third-party service outside our control). Only Koyu/
// Açık are affected — satellite already uses its own ESRI raster source.
// Countries without a local .mbtiles yet keep using the public API as
// before; add them to this map once `docker compose run --rm tile-builder
// --download --area=<name> --output=/data/<name>.mbtiles` has been run for
// them (see docker-compose.yml's tile-builder service comment).
const TILESERVER_URL = import.meta.env.VITE_TILESERVER_URL || null
// One dark + one light style per self-hosted country (tiles/config.json),
// keyed the same way MAP_STYLES' own index 0/2 slots are — matters because
// brightenDarkLabels()/addSourcesAndLayers()'s dimOpacity both hardcode
// "index 0 = dark basemap" (live-testing finding, 2026-08-03: a single
// light-only self-hosted style under the Koyu slot made brightenDarkLabels
// force every label white against a light background — unreadable, and the
// heavy dark dim overlay meant for a real dark basemap made everything look
// near-black on top). Two real styles keeps that assumption true instead of
// needing special-casing throughout the rest of the file.
const SELF_HOSTED_TILE_COUNTRIES = {
  tr: { dark: 'turkey-dark', light: 'turkey-light' },
  mg: { dark: 'madagascar-dark', light: 'madagascar-light' },
}

// VITE_TILESERVER_URL being *set* doesn't mean the container is actually
// reachable — this dev machine's Docker stack, a teammate's machine
// without it running, and (today) production all share the same build/env,
// so a dumb "if configured, use it" would just trade one single point of
// failure (the public API) for another (a local container nobody but this
// machine can reach) — live-testing ask, 2026-08-03 ("lokalde alamazsa
// canlı apiden alsın, hatasız olsun"). A single one-shot reachability probe
// at startup (tileserver-gl's own /health) decides for the whole session;
// selfHostedStyleUrl() falls back to the public API whenever it's false,
// including "haven't heard back yet".
const tileserverReachable = ref(false)
if (TILESERVER_URL) {
  fetch(`${TILESERVER_URL}/health`, { signal: AbortSignal.timeout(1500) })
    .then((res) => { tileserverReachable.value = res.ok })
    .catch(() => { tileserverReachable.value = false })
}

function selfHostedStyleUrl() {
  if (!TILESERVER_URL || !tileserverReachable.value || isSatellite.value) return null
  const pair = SELF_HOSTED_TILE_COUNTRIES[selectedCountryCode.value]
  if (!pair) return null
  const id = mapStyleIndex.value === 0 ? pair.dark : pair.light
  return `${TILESERVER_URL}/styles/${id}/style.json`
}

function getBaseStyle() {
  const s = MAP_STYLES[mapStyleIndex.value]
  return selfHostedStyleUrl() ?? s.url ?? ESRI_SATELLITE_STYLE
}

function zoomIn() {
  if (!map) return
  map.zoomIn()
}

function zoomOut() {
  if (!map) return
  map.zoomOut()
}

// Draping satellite imagery over an actively-reshaping 3D mesh is
// expensive in WebGL regardless of pitch angle — live-tested to drop as
// low as 6-7 FPS while rotating. Not something a tile-count/pitch tweak
// fixes outright, so instead of silently degrading the experience, the
// first time a browser turns this on it sees an explicit warning; the
// choice is remembered (localStorage) so it doesn't nag on every toggle
// within — or across — sessions.
const TERRAIN_WARNING_ACK_KEY = 'mhews-3d-terrain-warning-ack'
const showTerrainWarning = ref(false)

function toggleTerrain3D() {
  if (!map || !isSatellite.value) return
  if (terrain3DEnabled.value) {
    disableTerrain3D()
    return
  }
  if (localStorage.getItem(TERRAIN_WARNING_ACK_KEY)) {
    enableTerrain3D()
  } else {
    showTerrainWarning.value = true
  }
}

function confirmEnableTerrain3D() {
  localStorage.setItem(TERRAIN_WARNING_ACK_KEY, '1')
  showTerrainWarning.value = false
  enableTerrain3D()
}

// Live tuning knobs (spec-less follow-up, 2026-07-28): pitch and DEM tile
// detail are the two actual performance levers for the drape-over-3D-mesh
// cost discussed above — exposed as sliders next to the 3B button so this
// can be tuned by feel instead of guessing at fixed values. Higher pitch
// looks toward the horizon and needs MORE tiles (not fewer), so this is
// deliberately NOT auto-linked to the detail slider — the two are
// independent, sometimes opposing, levers.
const terrainPitch = ref(60)
const terrainDetailMaxZoom = ref(15)

function enableTerrain3D() {
  if (!map) return
  terrain3DEnabled.value = true
  if (!map.getSource(DEM_TERRAIN_SOURCE_ID)) {
    map.addSource(DEM_TERRAIN_SOURCE_ID, {
      type: 'raster-dem',
      tiles: [`demcache://${DEM_TILE_URL}`],
      tileSize: 256,
      maxzoom: terrainDetailMaxZoom.value,
      encoding: 'terrarium',
    })
  }
  map.setTerrain({ source: DEM_TERRAIN_SOURCE_ID, exaggeration: 1.5 })
  // Straight-down (pitch 0) hides elevation displacement almost entirely —
  // a tilt is what actually makes "raised mountains" visible.
  map.easeTo({ pitch: terrainPitch.value, duration: 800 })
}

function disableTerrain3D() {
  if (!map) return
  terrain3DEnabled.value = false
  map.setTerrain(null)
  map.easeTo({ pitch: 0, duration: 800 })
}

function updateTerrainPitch(value) {
  terrainPitch.value = value
  if (!map || !terrain3DEnabled.value) return
  map.easeTo({ pitch: value, duration: 200 })
}

// Changing a raster-dem source's maxzoom isn't a live-updatable property —
// MapLibre only reads it at source-add time — so this removes and re-adds
// the source (a full tile re-fetch at the new detail level, cached tiles
// notwithstanding) rather than trying to mutate it in place.
function updateTerrainDetail(value) {
  terrainDetailMaxZoom.value = value
  if (!map || !terrain3DEnabled.value) return
  map.setTerrain(null)
  if (map.getSource(DEM_TERRAIN_SOURCE_ID)) map.removeSource(DEM_TERRAIN_SOURCE_ID)
  map.addSource(DEM_TERRAIN_SOURCE_ID, {
    type: 'raster-dem',
    tiles: [`demcache://${DEM_TILE_URL}`],
    tileSize: 256,
    maxzoom: value,
    encoding: 'terrarium',
  })
  map.setTerrain({ source: DEM_TERRAIN_SOURCE_ID, exaggeration: 1.5 })
}

function cycleMapStyle() {
  mapStyleIndex.value = (mapStyleIndex.value + 1) % MAP_STYLES.length
  if (!map) return
  map.setMaxZoom(isSatellite.value ? 17.4 : 20)
  // Leaving satellite: map.setStyle() (inside applyBaseStyle) wipes all
  // sources/layers including the DEM terrain anyway, so this just keeps the
  // toggle's own displayed state truthful instead of showing "3B" as still
  // active on a style where the button is no longer even shown.
  if (!isSatellite.value) terrain3DEnabled.value = false
  applyBaseStyle()
}

function addBuildings3D() {
  if (isSatellite.value) return
  if (map.getLayer('buildings-3d')) return
  try {
    map.addLayer({
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': '#c8d0da',
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          0,
          16,
          ['coalesce', ['get', 'render_height'], ['get', 'height'], 5],
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.8,
      },
    })
  } catch {
    /* source may not exist in satellite mode */
  }
}

/**
 * Returns the id of the first symbol (label) layer in the current style,
 * so we can insert hex/heat layers underneath country names.
 */
function firstSymbolLayerId() {
  const layers = map.getStyle()?.layers ?? []
  return layers.find((l) => l.type === 'symbol')?.id
}

/** In dark mode, boost all label text to near-white so they're readable over hex fills. */
function brightenDarkLabels() {
  if (mapStyleIndex.value !== 0) return // only dark style (index 0)
  const layers = map.getStyle()?.layers ?? []
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue
    try {
      map.setPaintProperty(layer.id, 'text-color', '#e8ecf0')
      map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(0,0,0,0.6)')
      map.setPaintProperty(layer.id, 'text-halo-width', 1.2)
    } catch {
      /* layer may not support these properties */
    }
  }
}

function addSourcesAndLayers() {
  // beforeId = first label layer → our layers render below labels
  const before = firstSymbolLayerId()
  // Dark basemap can take a heavy dim without losing legibility; light/satellite
  // basemaps are already low-contrast so the same overlay reads as near-black.
  const dimOpacity = mapStyleIndex.value === 0 ? 0.55 : 0.18

  map.addSource('disaster-heat', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  // Impact halo (spec 050 US1) — starts fully transparent; updateImpactHalo()
  // drives geometry/opacity once an event is selected.
  map.addSource('impact-halo', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'impact-halo-fill',
    type: 'fill',
    source: 'impact-halo',
    paint: { 'fill-color': '#dc2626', 'fill-opacity': 0 },
  })
  map.addLayer({
    id: 'impact-halo-line',
    type: 'line',
    source: 'impact-halo',
    paint: { 'line-color': '#dc2626', 'line-width': 2, 'line-opacity': 0 },
  })

  map.addSource('disaster-hex', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addSource('hex-world-bg', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addSource('country-hex-grid', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addSource('world-countries', {
    type: 'geojson',
    data: fixGeometry(feature(countriesTopo, countriesTopo.objects.countries)),
  })

  map.addSource('custom-territories', {
    type: 'geojson',
    data: fixGeometry(CUSTOM_TERRITORIES),
    // MapLibre's GeoJSON tiler only preserves a feature's top-level `id` when
    // it's a number (see GeoJSONWrapper) — string ids like 'XKX'/'TRNC' are
    // silently dropped to undefined, which made both custom territories
    // permanently unselectable (selectCountry bails on a null id). promoteId
    // reads the id from a property instead, which has no such numeric-only
    // restriction.
    promoteId: 'numeric',
  })

  // Community reports (spec 036, research.md Decision 6) — MapLibre's native
  // clustering, independent of the disaster-event DOM-marker layer above.
  map.addSource('community-reports', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
  })

  map.addLayer({
    id: 'community-reports-clusters',
    type: 'circle',
    source: 'community-reports',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#f59e0b',
      'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
      'circle-opacity': 0.85,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#7c2d12',
    },
  })

  map.addLayer({
    id: 'community-reports-cluster-count',
    type: 'symbol',
    source: 'community-reports',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 12,
    },
    paint: { 'text-color': '#1c1917' },
  })

  map.addLayer({
    id: 'community-reports-unclustered',
    type: 'circle',
    source: 'community-reports',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#f59e0b',
      'circle-radius': 8,
      'circle-opacity': 0.9,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#7c2d12',
    },
  })

  // Background world grid — faint strokes only, adapts to map style
  const isLight = mapStyleIndex.value === 2
  map.addLayer(
    {
      id: 'hex-bg-stroke',
      type: 'line',
      source: 'hex-world-bg',
      paint: {
        'line-color': isLight ? 'rgba(30,30,30,0.18)' : 'rgba(255,255,255,0.18)',
        'line-width': 0.5,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.25, 12, 0.1],
      },
      layout: { visibility: 'none' },
    },
    before,
  )

  // Antarctica's ring in this topojson is clipped along a near-constant
  // latitude (world-atlas's standard southern cutoff) — filled or bordered
  // like every other country, that flat edge renders as a stray straight
  // line/wedge across the bottom of the view. No disaster data is ever
  // relevant there, so it's excluded from these layers entirely.
  //
  // world-atlas also ships a "Kosovo" feature with no ISO numeric id (Kosovo
  // has none), which crashes map.setFeatureState (id must be non-null) the
  // moment the cursor/click resolves to it instead of our own custom-territories
  // Kosovo polygon (which does have an id) — in practice this made hovering or
  // clicking anywhere near Kosovo silently fail to select it. Excluded here so
  // our custom-territories entry is the only interactive Kosovo shape.
  const excludeAntarctica = [
    'all',
    ['!=', ['get', 'name'], 'Antarctica'],
    ['!=', ['get', 'name'], 'Kosovo'],
  ]

  // Country fills (invisible, for interaction — moved to top after all layers)
  map.addLayer(
    {
      id: 'country-fills',
      type: 'fill',
      source: 'world-countries',
      filter: excludeAntarctica,
      paint: {
        'fill-color': 'rgba(255, 255, 255, 0)',
      },
    },
    before,
  )

  // Hover fill — was a white highlight keyed off feature-state, but a
  // handful of country rings (antimeridian-adjacent ones fixGeometry()
  // doesn't fully normalize) tessellate into a large stray triangle when
  // filled. Not worth it for a subtle highlight — disabled outright.
  map.addLayer(
    {
      id: 'countries-hover-fill',
      type: 'fill',
      source: 'world-countries',
      filter: excludeAntarctica,
      paint: {
        'fill-color': '#ffffff',
        'fill-opacity': 0,
      },
    },
    before,
  )

  // Selected country hex grid — data-driven: shows signal colors when events exist
  map.addLayer(
    {
      id: 'country-hex-fill',
      type: 'fill',
      source: 'country-hex-grid',
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#4ade80'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.04],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'country-hex-stroke',
      type: 'line',
      source: 'country-hex-grid',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#4ade80'],
        'line-width': 0.6,
        'line-opacity': 0.35,
      },
    },
    before,
  )

  // Selected country highlight
  map.addLayer(
    {
      id: 'country-selected',
      type: 'fill',
      source: 'world-countries',
      filter: excludeAntarctica,
      paint: {
        'fill-color': '#4ade80',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.18, 0],
      },
    },
    before,
  )

  // Global country borders - green lines
  map.addLayer(
    {
      id: 'country-borders',
      type: 'line',
      source: 'world-countries',
      filter: excludeAntarctica,
      paint: {
        'line-color': '#4ade80',
        'line-width': 1.2,
        'line-opacity': 0.4,
      },
    },
    before,
  )

  // Custom territories interaction layers
  map.addLayer(
    {
      id: 'custom-territories-fills',
      type: 'fill',
      source: 'custom-territories',
      paint: { 'fill-color': 'rgba(255, 255, 255, 0)' },
    },
    before,
  )
  // Same reasoning as countries-hover-fill above — disabled, not filtered
  // per-feature.
  map.addLayer(
    {
      id: 'custom-hover-fill',
      type: 'fill',
      source: 'custom-territories',
      paint: {
        'fill-color': '#ffffff',
        'fill-opacity': 0,
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'custom-selected-fill',
      type: 'fill',
      source: 'custom-territories',
      paint: {
        'fill-color': '#4ade80',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.18, 0],
      },
    },
    before,
  )
  map.addLayer({
    id: 'custom-dim',
    type: 'fill',
    source: 'custom-territories',
    paint: {
      'fill-color': '#000000',
      'fill-opacity': ['case', ['boolean', ['feature-state', 'dimmed'], false], dimOpacity, 0],
    },
  })

  // Disaster heatmap fill — below labels
  map.addLayer(
    {
      id: 'hex-fill',
      type: 'fill',
      source: 'disaster-hex',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['get', 'opacity'],
      },
      layout: { visibility: 'none' },
    },
    before,
  )

  map.addLayer(
    {
      id: 'hex-stroke',
      type: 'line',
      source: 'disaster-hex',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1,
        'line-opacity': 0.7,
      },
      layout: { visibility: 'none' },
    },
    before,
  )

  map.addLayer(
    {
      id: 'heat-layer',
      type: 'heatmap',
      source: 'disaster-heat',
      paint: {
        'heatmap-weight': ['get', 'weight'],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 9, 60],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0,0,0,0)',
          0.2,
          '#90a4ae',
          0.4,
          '#00e676',
          0.6,
          '#ffd600',
          0.8,
          '#ff9100',
          1.0,
          '#ff1744',
        ],
        'heatmap-opacity': 0.8,
      },
      layout: { visibility: 'none' },
    },
    before,
  )

  // Dim overlay for non-selected countries — no `before` so it renders above symbol layers
  map.addLayer({
    id: 'country-dim',
    type: 'fill',
    source: 'world-countries',
    paint: {
      'fill-color': '#000000',
      'fill-opacity': ['case', ['boolean', ['feature-state', 'dimmed'], false], dimOpacity, 0],
    },
  })

  // interaction layers must be at absolute top to capture all mouse/click events
  map.moveLayer('country-fills')
  map.moveLayer('custom-territories-fills')

  addBuildings3D()
}

// ── Country label filtering: show only selected country's labels ─────────────
function setFocusMode(active, featureGeoJSON = null) {
  if (!map || !mapLoaded) return
  const layers = map.getStyle()?.layers ?? []
  if (active && featureGeoJSON) {
    _symbolFilterCache.clear()
    for (const layer of layers) {
      if (layer.type !== 'symbol') continue
      try {
        const orig = map.getFilter(layer.id)
        _symbolFilterCache.set(layer.id, orig ?? null)
        map.setFilter(
          layer.id,
          orig ? ['all', orig, ['within', featureGeoJSON]] : ['within', featureGeoJSON],
        )
      } catch {
        /* */
      }
    }
  } else {
    for (const layer of layers) {
      if (layer.type !== 'symbol') continue
      try {
        if (_symbolFilterCache.has(layer.id))
          map.setFilter(layer.id, _symbolFilterCache.get(layer.id))
      } catch {
        /* */
      }
    }
    _symbolFilterCache.clear()
    brightenDarkLabels()
  }
}

// Computes a fit-bounds for a country's geometry, correctly handling
// antimeridian-crossing landmasses (Russia's Chukotka Peninsula, Fiji):
// naively extending a LngLatBounds with raw coordinates makes such a
// country's bbox balloon to the full -180..180 width and its center to
// lng 0 (points near +178° and -179° each look like an extreme in
// isolation, live-testing finding for the Russia double-click zoom — it
// flew out to a whole-world view instead of framing Russia). Unwrapping
// each point relative to the running previous one keeps longitude
// continuous across the jump; normalizing the final west/east back into
// range then naturally produces MapLibre's own west>east "wraps through
// the dateline" convention when a country genuinely spans more than half
// the globe (Russia truly does — ~171° of longitude — so its fit will
// still look zoomed-out, just correctly centered instead of centered on
// nothing).
function computeCountryBounds(geom) {
  let refLng = null
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  const processCoords = (coords) => {
    if (typeof coords[0] === 'number') {
      let [lng, lat] = coords
      if (refLng !== null) {
        while (lng - refLng > 180) lng -= 360
        while (lng - refLng < -180) lng += 360
      }
      refLng = lng
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    } else {
      coords.forEach(processCoords)
    }
  }
  processCoords(geom.coordinates)
  if (!isFinite(minLng)) return new maplibregl.LngLatBounds()
  const normalize = (lng) => (((lng + 180) % 360) + 360) % 360 - 180
  return new maplibregl.LngLatBounds([normalize(minLng), minLat], [normalize(maxLng), maxLat])
}

// The filter sidebar (left) and Etki Analizi/impact panel (right) sit as
// overlays ON TOP of the map canvas rather than shrinking it, so a fixed
// 100px padding badly undersells how much of the canvas is actually hidden
// behind them (each can run 250-360px wide) — a wide country's east/west
// edges end up tucked behind the panels instead of framed in the visible
// gap between them (live-testing finding: Turkey/Russia's sides got cropped
// while compact countries like Madagascar looked fine, since there's
// nothing wide enough to reach the panels for those).
function getVisibleMapPadding() {
  const padding = { top: 100, bottom: 100, left: 100, right: 100 }
  const sidebarWidth = document.querySelector('.sidebar')?.getBoundingClientRect().width
  if (sidebarWidth) padding.left = Math.max(padding.left, sidebarWidth + 40)
  const impactWidth = document.querySelector('.impact-panel')?.getBoundingClientRect().width
  if (impactWidth) padding.right = Math.max(padding.right, impactWidth + 40)
  return padding
}

async function zoomToCountry(f) {
  if (!map || !mapLoaded) return
  const fid = f.id

  // Get full feature geometry
  const fullFeature = _allCountryFeatures.find((cf) => String(cf.id) === String(fid)) ?? f
  const geom = fullFeature.geometry
  if (!geom) return

  const bounds = computeCountryBounds(geom)
  if (bounds.isEmpty()) return

  const cameraOptions = map.cameraForBounds(bounds, {
    padding: getVisibleMapPadding(),
    maxZoom: 6,
  })
  if (!cameraOptions) return

  // Lets a country_admin override the raw bbox-fit with a curated zoom for
  // countries where it looks poor regardless (e.g. Russia's true extent —
  // even correctly framed — is still a near-global view) — the same
  // default_zoom escape hatch applyCountryLockedCamera() already offers
  // country-locked sessions (spec 044), now also available to this anon/
  // global double-click navigation path.
  const code =
    fullFeature.source === 'custom-territories' ? (fid === 'XKX' ? 'xk' : null) : numericToAlpha2(fid)
  let zoom = cameraOptions.zoom
  if (code) {
    const { data } = await supabase
      .from('country_boundaries')
      .select('default_zoom')
      .eq('country_code', code)
      .maybeSingle()
    if (data?.default_zoom != null) zoom = data.default_zoom
  }

  map.flyTo({
    ...cameraOptions,
    zoom,
    duration: 3500,
    curve: 2.0,
    speed: 0.5,
    // Flat top-down, not a tilted/rotated shot (live-testing finding,
    // 2026-07-30): the old pitch:15/bearing:-5 tilt exposed the map's blank
    // edge beyond the poles for high-latitude countries like Russia, and
    // re-applied itself every time regardless of how the user had already
    // rotated the camera — resetting to 0/0 is the one value that's never
    // wrong here, since a flat Mercator view has no "outside the map" edge.
    pitch: 0,
    bearing: 0,
    essential: true,
  })

  // Once the fly-to lands, briefly simulate a hover on the shelters/exposure
  // panels (both auto-collapsed to icons on selection) so the user notices
  // they're there instead of discovering them by accident.
  map.once('moveend', () => {
    clearTimeout(collapsedPanelHintTimer)
    showCollapsedPanelHints.value = true
    collapsedPanelHintTimer = setTimeout(() => {
      showCollapsedPanelHints.value = false
    }, 3000)
  })
}

// spec 044 US1: for a country-locked session, fit the camera to that user's
// own country on load — at its configured default_zoom if an admin has set
// one, otherwise falling back to the same cameraForBounds fit zoomToCountry()
// already uses for anon double-click navigation (research.md §4). No-op for
// anon/global sessions (FR-006).
async function applyCountryLockedCamera() {
  if (!map || !mapLoaded || !auth.isCountryLocked) return
  const code = auth.countryCode
  const fullFeature = _allCountryFeatures.find((cf) => numericToAlpha2(cf.id) === code)
  const geom = fullFeature?.geometry
  if (!geom) return

  const bounds = new maplibregl.LngLatBounds()
  const processCoords = (coords) => {
    if (typeof coords[0] === 'number') {
      bounds.extend(coords)
    } else {
      coords.forEach(processCoords)
    }
  }
  processCoords(geom.coordinates)
  if (bounds.isEmpty()) return

  // A country-locked account never manually clicks its own country (it's
  // already the only thing they can see) — selectCountry()'s activeBbox/
  // loadCountryHistory wiring never fires for them without this, so their
  // event badges/markers would silently stay unscoped (global) forever.
  disasterStore.activeBbox = {
    minLat: bounds.getSouth(),
    maxLat: bounds.getNorth(),
    minLng: bounds.getWest(),
    maxLng: bounds.getEast(),
  }
  disasterStore.loadCountryHistory(disasterStore.activeBbox)

  // Antimeridian-aware bounds (see computeCountryBounds) purely for the
  // camera fit/center — bounds.getCenter() above would put Russia's default-
  // zoom center in the wrong hemisphere (naive bounds compute ~lng 0).
  const cameraOptions = map.cameraForBounds(computeCountryBounds(geom), {
    padding: getVisibleMapPadding(),
    maxZoom: 6,
  })
  if (!cameraOptions) return

  const { data } = await supabase
    .from('country_boundaries')
    .select('default_zoom')
    .eq('country_code', code)
    .maybeSingle()

  map.flyTo({ ...cameraOptions, zoom: data?.default_zoom ?? cameraOptions.zoom, essential: true })
}

// Regenerates the selected country's hex grid (country-hex-grid source) via
// the hex worker, using whichever country is currently selected. Extracted
// so both selectCountry() and the mapMode watch below can trigger it — the
// grid must be regenerated whenever the user switches back to 'hexagon'
// mode (durum/ısı ↔ petek), not only on the initial country selection.
function refreshCountryHexGridFromSelection() {
  if (selectedFeatureId == null) return
  ensureHexWorker()
  const fullFeature = _allCountryFeatures.find((cf) => String(cf.id) === String(selectedFeatureId))
  const geom = fullFeature?.geometry
  if (!geom) return
  // Country hex grid resolution is intentionally NOT zoom-derived (unlike the
  // world-view hexbin grid) — a selected country's petek size should stay
  // put while panning/zooming, only ever changing via the manual slider.
  const gridRes = uiStore.manualHexResolution ?? MIN_HEX_RES
  countryHexRes = gridRes + 1
  hexWorker.postMessage({ type: 'FILL_GRID', geometry: geom, resolution: gridRes })
}

// spec 045 US2: live-regenerate the selected country's hex grid while the
// user drags the manual resolution slider. If petek isn't currently active,
// this is a no-op — the new value is simply stored and picked up the next
// time uiStore.mapMode becomes 'hexagon' (the existing mapMode watch already
// calls refreshCountryHexGridFromSelection() on entering hexagon mode),
// satisfying FR-006's persistence-across-toggle requirement with no extra code.
watch(
  () => uiStore.manualHexResolution,
  (value) => {
    if (value != null && uiStore.mapMode === 'hexagon') refreshCountryHexGridFromSelection()
  },
)

function selectCountry(f) {
  if (!map || !mapLoaded) return
  const fid = f.id
  const source = f.layer?.source || f.source || 'world-countries'
  if (fid == null) return

  const alreadySelected = selectedFeatureId === fid && selectedFeatureSource === source

  // Get full feature geometry
  const fullFeature = _allCountryFeatures.find((cf) => String(cf.id) === String(fid)) ?? f
  const geom = fullFeature.geometry
  if (!geom) {
    console.warn('[Map] No geometry for feature:', fid)
    return
  }

  const bounds = new maplibregl.LngLatBounds()
  const processCoords = (coords) => {
    if (typeof coords[0] === 'number') {
      bounds.extend(coords)
    } else {
      coords.forEach(processCoords)
    }
  }
  processCoords(geom.coordinates)

  if (bounds.isEmpty()) return
  selectedCountryBounds = bounds
  // Scopes disasterStore's own event count/list (sidebar badges, marker
  // rendering, allEvents) to this country — previously only updateHeatmap()
  // applied any country bounding-box filter, so a selected country's "7000
  // depremler" badge/marker count was silently the GLOBAL total for the
  // active date range, not this country's (live-testing finding, user-
  // reported: "ülkeyi seçtiğimde sadece o ülkenin depremleri görünmesi
  // gerekmiyor mu").
  disasterStore.activeBbox = {
    minLat: bounds.getSouth(),
    maxLat: bounds.getNorth(),
    minLng: bounds.getWest(),
    maxLng: bounds.getEast(),
  }
  // Loads this country's full event history once (server-side bbox-scoped,
  // not windowed by the duration slider) so every filter afterward —
  // including duration — is a pure client-side re-filter, never a fetch.
  // See loadCountryHistory's own comment in disaster.js for the full story.
  disasterStore.loadCountryHistory(disasterStore.activeBbox)

  // Visual state (dim/hex-grid/sidebar) only needs updating when selecting
  // a genuinely different country — re-clicking the one already selected is
  // a no-op past this point (including no repeat flyTo below).
  if (alreadySelected) return

  // Only capture on the very first selection (nothing selected yet) —
  // re-selecting a different country while one is already focused must not
  // overwrite this with 'hexagon' (its own forced value), which would lose
  // the actual pre-selection mode for good.
  if (selectedCountryCode.value == null) mapModeBeforeCountrySelection = uiStore.mapMode
  uiStore.mapMode = 'hexagon'
  sheltersLayerPanelCollapsed.value = true
  exposureLayersPanelCollapsed.value = true

  if (selectedFeatureId !== null) {
    map.setFeatureState(
      { source: selectedFeatureSource, id: selectedFeatureId },
      { selected: false, dimmed: false },
    )
  }

  selectedFeatureId = fid
  selectedFeatureSource = source

  if (source === 'custom-territories') {
    selectedCountryName.value = f.properties?.name || f.id
    // Kosovo has no official ISO 3166-1 code, but 'XK' is the de facto
    // user-assigned code widely adopted for exactly this gap (EU, Microsoft,
    // Mastercard, etc.) — using it lets exposure datasets ever registered
    // with country_code 'xk' show up here. KKTC/Northern Cyprus has no
    // similarly-adopted placeholder, so it stays uncoded (FR: exposure panel
    // still shows an accurate "no layers" state rather than a real code).
    selectedCountryCode.value = fid === 'XKX' ? 'xk' : null
  } else {
    const nameKey = String(fid).padStart(3, '0')
    selectedCountryName.value = COUNTRY_NAMES[nameKey] ?? `#${fid}`
    const alpha2 = numericToAlpha2(fid)
    selectedCountryCode.value = alpha2
    if (alpha2) router.push(`/${alpha2}`)
  }
  hideExposureLayersNotForCountry(selectedCountryCode.value)

  map.setFeatureState({ source, id: fid }, { selected: true, dimmed: false })

  refreshCountryHexGridFromSelection()

  _allCountryFeatures.forEach((cf) => {
    if (cf.id != null && cf.id !== fid) {
      map.setFeatureState({ source: cf.source, id: cf.id }, { dimmed: true })
    }
  })

  setFocusMode(true, fullFeature)

  // Zoom-to-fit used to be double-click-only, kept deliberately separate
  // from selection (see zoomToCountry's own history/comments) — combining
  // them here previously broke the map canvas (see mapResizeObserver's
  // comment for the actual cause: nothing ever told MapLibre the container
  // had resized out from under it). With that fixed, single click now both
  // selects AND fits the camera to the country, framed in the visible gap
  // between the left/right panels (getVisibleMapPadding()) — one gesture,
  // no separate double-click step (live-testing ask, 2026-08-03).
  zoomToCountry(f)
}

function clearCountrySelection() {
  selectedCountryName.value = null
  selectedCountryCode.value = null
  hideExposureLayersNotForCountry(null)
  selectedCountryBounds = null
  disasterStore.activeBbox = null
  countryHexRes = null
  countryHexFeatures = null
  uiStore.mapMode = mapModeBeforeCountrySelection
  mapModeBeforeCountrySelection = null
  if (!map || !mapLoaded) return

  map.getSource('country-hex-grid')?.setData({ type: 'FeatureCollection', features: [] })

  if (selectedFeatureId !== null) {
    map.setFeatureState(
      { source: selectedFeatureSource, id: selectedFeatureId },
      { selected: false },
    )
  }
  selectedFeatureId = null
  _allCountryFeatures.forEach((cf) => {
    if (cf.id != null) {
      map.setFeatureState({ source: cf.source, id: cf.id }, { dimmed: false })
    }
  })
  setFocusMode(false)

  // Refreshes the (now country-unscoped) heatmap/marker data even when the
  // restored mapMode isn't 'heatmap' — harmless no-op in that case, but
  // needed when it is (e.g. user had Isı on before ever selecting a country).
  updateHeatmap()

  if (defaultCameraState) {
    map.flyTo({ ...defaultCameraState, essential: true })
  }

  router.push('/')
}

function initMap() {
  if (!mapContainer.value || map) return

  const initialStyle = getBaseStyle()
  // Keeps the selectedCountryCode watcher's "did the resolved style URL
  // actually change" check accurate from the very first load (see that
  // watcher's own comment) — satellite's inline style object has no URL to
  // track, which is fine, selfHostedStyleUrl() already excludes satellite.
  _appliedStyleUrl = typeof initialStyle === 'string' ? initialStyle : null

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: initialStyle,
    center: [30, 20],
    maxZoom: 20,
    attributionControl: false,
    doubleClickZoom: false, // Disable default so we can handle it for zoom-to-fit
    preserveDrawingBuffer: true, // PNG download için gerekli
  })

  // See mapResizeObserver's own declaration for why this exists. ResizeObserver
  // (not a window 'resize' listener) so a layout-only change — sidebar
  // collapse, panel toggle, anything that resizes mapContainer without the
  // browser window itself changing size — is caught too.
  mapResizeObserver = new ResizeObserver(() => map?.resize())
  mapResizeObserver.observe(mapContainer.value)

  // Blank/black map, no console error, all network requests 200 — live-
  // testing finding, production only, 2026-08-03: classic symptom of
  // MapLibre sizing its canvas against the container's layout box at the
  // instant of construction, before CSS has actually finished applying
  // (production serves styles as a separately-loaded, hashed chunk — the
  // container can still be 0×0 or mid-transition when `new Map()` reads
  // its size). Once that first canvas size is wrong, tiles/data loading
  // fine no longer helps — nothing ever tells MapLibre to recompute it.
  // A ResizeObserver on the same container is the standard fix: any size
  // change (including the container settling into its final CSS-driven
  // size a tick after mount) triggers a real map.resize().
  const containerResizeObserver = new ResizeObserver(() => map?.resize())
  containerResizeObserver.observe(mapContainer.value)
  onBeforeUnmount(() => containerResizeObserver.disconnect())

  // Custom vertical zoom bar (template below) replaces the default
  // NavigationControl — [+] / [x N] / [−] stacked to the left of the
  // download/satellite-thumbnail column.

  map.on('error', (e) => {
    console.error('[MapLibre] Error:', e.error)
  })

  // "İki kart üst üste oluyor" (user-reported, 2026-07-30): every marker
  // (disaster event, drill event, community report...) binds its own
  // independent popup — MapLibre has no built-in awareness of one popup
  // sitting behind another, so two nearby markers clicked in sequence just
  // stack in DOM order with no way to bring the back one forward. Rather
  // than auto-closing one when another opens (rejected — "belki ikisini
  // aynı anda görmek istiyorum"), this is a lightweight playing-card-style
  // bring-to-front: clicking anywhere on a popup raises it above its
  // siblings, all of them stay open simultaneously.
  map.getContainer().addEventListener('mousedown', (e) => {
    const popupEl = e.target.closest('.maplibregl-popup')
    if (!popupEl) return
    popupZIndexCounter += 1
    popupEl.style.zIndex = String(popupZIndexCounter)
    popupEl.classList.add('popup-brought-to-front')
    setTimeout(() => popupEl.classList.remove('popup-brought-to-front'), 200)
  })

  let _hexZoomTimer = null
  map.on('zoom', () => {
    currentZoom.value = Math.round(map.getZoom() * 10) / 10
    // Debounced viewport hex refresh during scroll (150ms after last scroll tick)
    if (uiStore.mapMode === 'hexagon') {
      clearTimeout(_hexZoomTimer)
      _hexZoomTimer = setTimeout(() => {
        hexGridCache.delete(currentHexRes.value)
        updateViewportGrid()
      }, 150)
    }
  })
  // Keeps the zoom-control-bar readout synced through any programmatic
  // camera change (flyTo/easeTo), not just user gestures.
  map.on('moveend', () => {
    currentZoom.value = Math.round(map.getZoom() * 10) / 10
  })

  map.on('load', () => {
    mapLoaded = true
    // Sync the zoom-control-bar readout to the map's real zoom as soon as it
    // exists. Accounts without a country lock never trigger a flyTo (see
    // applyCountryLockedCamera's early return below), so without this the
    // readout would sit at currentZoom's ref() default forever.
    currentZoom.value = Math.round(map.getZoom() * 10) / 10
    defaultCameraState = { center: map.getCenter(), zoom: map.getZoom() }
    addSourcesAndLayers()
    brightenDarkLabels()
    updateMarkers()
    updateShelterMarkers()
    updateCommunityReportMarkers()
    updateDrillEventMarkers()
    updateHeatmap()
    updateHexbins()
    updateUserMarker()

    setupMapInteractions()
    applyCountryLockedCamera()

    // Viewport grid refresh after pan or zoom ends (clear cache so new bounds are used)
    map.on('moveend', () => {
      if (uiStore.mapMode === 'hexagon') {
        clearTimeout(_hexZoomTimer)
        hexGridCache.delete(currentHexRes.value)
        updateViewportGrid()
      }
    })
  })
}

function setupMapInteractions() {
  if (!map || interactionsSetUp) return
  interactionsSetUp = true

  const interactionLayers = ['country-fills', 'custom-territories-fills']

  // ── Country hover tracking ──
  map.on('mousemove', interactionLayers, (e) => {
    if (!e.features?.length) return
    const f = e.features[0]
    const source = f.source
    // setFeatureState throws if id is null/undefined (e.g. a world-atlas
    // feature with no ISO numeric id) — bail rather than crash the handler.
    if (f.id == null) return

    if (
      hoveredFeatureId !== null &&
      (hoveredFeatureId !== f.id || hoveredFeatureSource !== source)
    ) {
      map.setFeatureState({ source: hoveredFeatureSource, id: hoveredFeatureId }, { hover: false })
    }

    hoveredFeatureId = f.id
    hoveredFeatureSource = source
    map.setFeatureState({ source, id: f.id }, { hover: true })

    if (source === 'custom-territories') {
      hoveredCountryName.value = f.properties.name || f.id
    } else {
      hoveredCountryName.value = COUNTRY_NAMES[String(f.id).padStart(3, '0')] ?? null
    }
    hoveredCountryPoint.value = { x: e.point.x, y: e.point.y }
    map.getCanvas().style.cursor = 'default'
  })

  map.on('mouseleave', interactionLayers, () => {
    if (hoveredFeatureId !== null) {
      map.setFeatureState({ source: hoveredFeatureSource, id: hoveredFeatureId }, { hover: false })
    }
    hoveredFeatureId = null
    hoveredCountryName.value = null
    map.getCanvas().style.cursor = ''
  })

  // ── Single-click: select country ──
  map.on('click', interactionLayers, (e) => {
    // Don't trigger country select if clicking on an event hex popup target
    const hexFeats = map.queryRenderedFeatures(e.point, { layers: ['hex-fill'] })
    if (hexFeats.length > 0) return

    if (e.features.length > 0) {
      selectCountry(e.features[0])
    }
  })

  // ── Empty click: clear selection ──
  map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: interactionLayers })
    const hexFeats = map.queryRenderedFeatures(e.point, { layers: ['hex-fill'] })
    if (features.length === 0 && hexFeats.length === 0) {
      clearCountrySelection()
    }
  })

  // ── Double-click on a country: removed (2026-08-03) ──
  // Used to call zoomToCountry() (camera flyTo, no selection) here, separate
  // from single-click's selectCountry() (selection, no camera move) — two
  // gestures with two different, inconsistent effects (live-testing
  // complaint: double-click "worked" but never showed as selected).
  // Combining them into one gesture (either click count) broke the map
  // canvas itself (visibly detached from its container) — live-testing
  // finding, 2026-08-03: same combination, single- or double-click, both
  // regressed. Rather than ship either broken combination, double-click on
  // a country now does nothing; single-click's own selectCountry() (below)
  // is the only supported way to select — already working well on its own.
  // zoomToCountry() itself is kept (still referenced by its own comments/
  // history) but no longer wired to any input.

  map.on('dblclick', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: interactionLayers })
    if (features.length === 0) {
      map.zoomIn({ around: e.lngLat })
    }
  })

  // Hex-fill click handling
  let hexClickTimer = null
  map.on('click', 'hex-fill', (e) => {
    if (!e.features || !e.features.length) return
    // Disambiguate from a double-click (used to zoom-to-fit the country
    // underneath the hex grid): opening a popup right on the first click
    // plants a DOM element under the cursor that can swallow the second
    // click, making the zoom gesture flaky. Wait one tick — a second click
    // within the window cancels the popup and lets dblclick zoom instead.
    if (hexClickTimer) {
      clearTimeout(hexClickTimer)
      hexClickTimer = null
      return
    }
    hexClickTimer = setTimeout(() => {
      hexClickTimer = null
      openHexPopup(e)
    }, 250)
  })

  function openHexPopup(e) {
    const props = e.features[0].properties
    const h3Id = props.h3_id
    const count = props.eventCount || 1

    // Parse topEvents if it exists
    let eventsHtml = ''
    if (props.topEvents) {
      try {
        const events = JSON.parse(props.topEvents)
        eventsHtml = `
          <div class="hex-events-list">
            ${events
              .map(
                (ev) => `
              <div class="hex-event-item">
                <div class="hex-event-dot" style="background: ${getSeverityHex(ev.severity)}"></div>
                <div class="hex-event-content">
                  <div class="hex-event-title">${ev.title}</div>
                  <div class="hex-event-meta-row">
                    <span class="hex-event-time">${new Date(ev.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span class="hex-event-details">
                      ${ev.magnitude ? `M${Number(ev.magnitude).toFixed(1)}` : ''}
                      ${ev.depth ? `• ${Math.round(ev.depth)}km` : ''}
                      ${ev.source ? `• ${ev.source}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        `
      } catch (err) {
        console.error('Error parsing topEvents:', err)
      }
    }

    const popupHtml = `
      <div class="hex-popup" style="--severity-color: ${getSeverityHex(props.maxSeverity)}">
        ${POPUP_CLOSE_BTN_HTML}
        <div class="hex-popup-header">
          <span class="hex-id">${h3Id}</span>
          <span class="hex-count">${count} Olay</span>
        </div>
        ${eventsHtml}
        <div class="hex-popup-footer">
          <span>Yoğunluk: %${Math.round((props.intensity ?? 0) * 100)}</span>
        </div>
      </div>
    `

    const hexPopup = new maplibregl.Popup({ className: 'hex-popup-container', offset: 10, maxWidth: '320px', closeButton: false })
      .setLngLat(e.lngLat)
      .setHTML(popupHtml)
    registerPopupCascade(hexPopup)
    hexPopup.addTo(map)
  }

  map.on('mouseenter', 'hex-fill', () => {
    map.getCanvas().style.cursor = 'default'
  })
  map.on('mouseleave', 'hex-fill', () => {
    map.getCanvas().style.cursor = ''
  })

  // Community report clusters (spec 036, US3): click a cluster to zoom into
  // it (MapLibre's standard expansion-zoom pattern); click an individual
  // point to open a detail popup.
  map.on('click', 'community-reports-clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['community-reports-clusters'] })
    const clusterId = features[0]?.properties?.cluster_id
    if (clusterId == null) return
    map.getSource('community-reports').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return
      map.easeTo({ center: features[0].geometry.coordinates, zoom })
    })
  })

  map.on('click', 'community-reports-unclustered', (e) => {
    if (!e.features || !e.features.length) return
    const props = e.features[0].properties
    const photoHtml = props.photo_path
      ? `<a href="${supabase.storage.from('community-report-photos').getPublicUrl(props.photo_path).data.publicUrl}" target="_blank" rel="noopener">${t('communityReport.moderation.viewPhoto')}</a>`
      : ''
    const audioHtml = props.audio_path
      ? `<audio controls src="${supabase.storage.from('community-report-audio').getPublicUrl(props.audio_path).data.publicUrl}" aria-label="${t('communityReport.moderation.playAudio')}"></audio>`
      : ''
    const communityReportPopup = new maplibregl.Popup({ offset: 12, className: 'modern-popup-container', maxWidth: '320px', closeButton: false })
      .setLngLat(e.features[0].geometry.coordinates)
      .setHTML(
        `
        <div class="community-report-popup-modern">
          ${POPUP_CLOSE_BTN_HTML}
          <div class="popup-body">
            <h4 class="popup-title">${hazardDisplayNameForMap(props.hazard_type)}</h4>
            <p>${props.description}</p>
            <span>${new Date(props.created_at).toLocaleString()}</span>
            ${photoHtml}
            ${audioHtml}
          </div>
        </div>
      `,
      )
    registerPopupCascade(communityReportPopup)
    communityReportPopup.addTo(map)
  })

  map.on('mouseenter', 'community-reports-clusters', () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', 'community-reports-clusters', () => {
    map.getCanvas().style.cursor = ''
  })
  map.on('mouseenter', 'community-reports-unclustered', () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', 'community-reports-unclustered', () => {
    map.getCanvas().style.cursor = ''
  })
}

function updateViewportGrid() {
  if (!map || !mapLoaded || !hexWorker) return
  if (uiStore.mapMode !== 'hexagon') return

  const res = currentHexRes.value

  // Cache hit → reuse geometry, just re-inject signal
  if (hexGridCache.has(res)) {
    map.getSource('hex-world-bg')?.setData({
      type: 'FeatureCollection',
      features: hexGridCache.get(res),
    })
    applySignalToGrid()
    return
  }

  const bounds = map.getBounds()
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()

  let minLng = sw.lng
  let maxLng = ne.lng
  while (minLng < -180) minLng += 360
  while (minLng > 180) minLng -= 360
  while (maxLng < -180) maxLng += 360
  while (maxLng > 180) maxLng -= 360

  hexWorker.postMessage({
    type: 'FILL_VIEWPORT',
    bounds: [
      [minLng, sw.lat],
      [maxLng, ne.lat],
    ],
    resolution: res,
  })
}

function clearMarkers() {
  markerObjects.forEach((m) => m.remove())
  markerObjects = []
}

// Shelter marker layer (spec 027) — parallel to the disaster-event marker
// functions above, but deliberately NOT subject to the zoom-based hide rule
// those follow (FR-005): shelter locations are always safety-relevant, not
// an aggregated density signal like hexbin/heatmap mode.
function clearShelterMarkers() {
  shelterMarkerObjects.forEach((m) => m.remove())
  shelterMarkerObjects = []
}

function formatShelterStatusLabel(status) {
  if (status === 'open' || status === 'full' || status === 'closed') {
    return t(`shelters.statusOptions.${status}`)
  }
  return status
}

function updateShelterMarkers() {
  if (!map || !mapLoaded) return

  clearShelterMarkers()

  if (!uiStore.showShelters) return

  sheltersStore.shelters
    // confidence_level 1-3 (amenity=shelter's low/unclassifiable-confidence
    // OSM rows — see the shelters_confidence_level migration) are visible in
    // the admin list but excluded from the map by default: at 4-5 the
    // popup's "bu bir sığınak" implication is trustworthy, below that it's
    // as likely a bus-stop shelter as a real one.
    .filter(
      (shelter) =>
        shelter.is_active &&
        shelter.lat != null &&
        shelter.lng != null &&
        (shelter.confidence_level ?? 5) >= 4,
    )
    .forEach((shelter) => {
      const color = getShelterMarkerColor(shelter.status)

      const el = document.createElement('div')
      el.className = 'shelter-marker'
      el.innerHTML = `
        <div class="shelter-marker-dot" style="background:${color};box-shadow:0 0 10px ${color};">
          <span class="shelter-marker-icon">${getShelterMarkerIcon()}</span>
        </div>
      `

      const pct = occupancyPercentage(shelter)
      const linkedNote = shelter.linked_incident_id
        ? `<p class="shelter-popup-linked">${t('shelters.map.linkedIncident') || 'İlgili bir olaya bağlı'}</p>`
        : ''

      const popup = new maplibregl.Popup({ offset: 12, className: 'modern-popup-container', maxWidth: '320px', closeButton: false }).setHTML(
        `
        <div class="shelter-popup-modern" style="--severity-color: ${color};">
          ${POPUP_CLOSE_BTN_HTML}
          <div class="popup-body">
            <h4 class="popup-title">${shelter.name}</h4>
            <div class="popup-metrics">
              <span><b>${t('shelters.map.occupancy') || 'Doluluk'}:</b> ${shelter.capacity_occupied ?? 0}/${shelter.capacity_total ?? 0} (%${pct})</span>
              <span><b>${t('shelters.map.status') || 'Durum'}:</b> ${formatShelterStatusLabel(shelter.status)}</span>
            </div>
            ${linkedNote}
          </div>
        </div>
      `,
      )
      registerPopupCascade(popup)

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([shelter.lng, shelter.lat])
        .setPopup(popup)
        .addTo(map)

      shelterMarkerObjects.push(marker)
    })
}

// Community report cluster layer (spec 036) — unlike the shelter/disaster
// marker functions above, this uses MapLibre's native GeoJSON clustering
// (research.md Decision 6): visibility is toggled via layer layout
// properties rather than adding/removing individual Marker objects.
function updateCommunityReportMarkers() {
  if (!map || !mapLoaded) return
  const source = map.getSource('community-reports')
  if (!source) return

  const features = communityReportsStore.reports.map((report) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [report.lng, report.lat] },
    properties: {
      id: report.id,
      hazard_type: report.hazard_type,
      description: report.description,
      created_at: report.created_at,
      photo_path: report.photo_path,
      audio_path: report.audio_path,
    },
  }))
  source.setData({ type: 'FeatureCollection', features })

  const visibility = uiStore.showCommunityReports ? 'visible' : 'none'
  ;['community-reports-clusters', 'community-reports-cluster-count', 'community-reports-unclustered'].forEach(
    (layerId) => map.setLayoutProperty(layerId, 'visibility', visibility),
  )
}

function hazardDisplayNameForMap(code) {
  return hazardTypesStore.hazardTypes.find((h) => h.code === code)?.display_name ?? code
}

// hazard_types.icon (20260727000000 migration) drives marker icons for any
// hazard type, including ones added after this file was last deployed — the
// hardcoded getDisasterIcon() map (DisasterEvent.js) is now only a fallback
// for the brief window before hazardTypesStore has loaded.
function hazardIconForMap(code) {
  return hazardTypesStore.hazardTypes.find((h) => h.code === code)?.icon
}

// Drill injected event marker layer (spec 037) — mirrors the shelter
// DOM-Marker+Popup approach (research.md Decision 2, no native clustering
// needed at this scale). RLS's authenticated_read_active_drill_events policy
// already guarantees fetchForActiveDrill() returns nothing once a drill is
// 'completed', so no extra "is this drill still active" check is needed here.
function clearDrillEventMarkers() {
  drillEventMarkerObjects.forEach((m) => m.remove())
  drillEventMarkerObjects = []
}

function updateDrillEventMarkers() {
  if (!map || !mapLoaded) return

  clearDrillEventMarkers()

  drillInjectedEventsStore.events.forEach((ev) => {
    const el = document.createElement('div')
    el.className = 'drill-event-marker'
    el.innerHTML = `
      <div class="drill-event-marker-dot">
        <span class="drill-event-marker-icon">🎯</span>
      </div>
    `

    const popup = new maplibregl.Popup({ offset: 12, className: 'modern-popup-container', maxWidth: '320px', closeButton: false }).setHTML(
      `
      <div class="drill-event-popup-modern">
        ${POPUP_CLOSE_BTN_HTML}
        <div class="popup-body">
          <div class="drill-event-badge">${t('drillInjection.map.badge')}</div>
          <h4 class="popup-title">${hazardDisplayNameForMap(ev.hazard_type)}</h4>
          <p>${ev.description}</p>
          <span><b>${t('drillInjection.map.severity')}:</b> ${ev.severity}</span>
        </div>
      </div>
    `,
    )
    registerPopupCascade(popup)

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([ev.lng, ev.lat])
      .setPopup(popup)
      .addTo(map)

    drillEventMarkerObjects.push(marker)
  })
}

async function loadActiveDrillEvents() {
  const countryCode = auth.isSuperAdmin ? null : (auth.countryCode || null)
  let query = supabase.from('drill_sessions').select('id').eq('status', 'active').limit(1)
  if (countryCode) query = query.eq('country_code', countryCode)
  const { data } = await query
  const activeDrillId = data?.[0]?.id
  if (activeDrillId) {
    await drillInjectedEventsStore.fetchForActiveDrill(activeDrillId)
  } else {
    drillInjectedEventsStore.events = []
  }
  updateDrillEventMarkers()
}

function formatPopupDetails(event) {
  const details = []
  if (event.lat != null && event.lng != null) {
    details.push(
      `<span><b>Konum:</b> ${Number(event.lat).toFixed(2)}, ${Number(event.lng).toFixed(2)}</span>`,
    )
  }
  if (event.magnitude != null && event.magnitude !== '' && !isNaN(event.magnitude)) {
    details.push(`<span><b>Büyüklük:</b> M${Number(event.magnitude).toFixed(1)}</span>`)
  }
  if (event.depth != null && event.depth !== '' && !isNaN(event.depth)) {
    details.push(`<span><b>Derinlik:</b> ${Math.round(Number(event.depth))} km</span>`)
  }
  return details.join('')
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) || 0
  const g = parseInt(h.substring(2, 4), 16) || 0
  const b = parseInt(h.substring(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Rendering every marker in a multi-year/all-type view (potentially tens of
// thousands of events) would both look like solid noise and cause real
// jank creating that many DOM marker nodes — so `updateMarkers()` below
// keeps the render count near MARKER_COMFORTABLE_COUNT, filling
// strongest-severity-first (critical → high → moderate → low → minimal).
//
// Live-testing finding (severity: high — real regression): an earlier
// version of this function dropped an entire tier wholesale once the
// count exceeded budget. That's a cliff: for a long time range, the
// server-side fetch (fetchRecentDisasters) already applies a magnitude
// floor (>365 days → M5.5+), so almost everything left client-side is
// already 'high' severity — dropping 'high' entirely collapsed a
// legitimate ~3000-event view down to the 1-2 true 'critical' (M7+)
// events, making the map look broken/empty instead of merely trimmed.
// Fixed by filling PARTIALLY from a tier when it doesn't fully fit the
// remaining budget, instead of all-or-nothing per tier — a tier is only
// ever reported as "hidden" in the UI note when zero of its events made
// it through, not when it was merely truncated like everything else.
const MARKER_COMFORTABLE_COUNT = 1500
const MARKER_RENDER_CAP = 2500
const SEVERITY_TIERS_STRONGEST_FIRST = ['critical', 'high', 'moderate', 'low', 'minimal']

function selectEventsForMarkers(events, comfortableCount, hardCap) {
  const total = events.length
  if (total <= comfortableCount) return { shown: events, total, hiddenTiers: [] }

  const buckets = { critical: [], high: [], moderate: [], low: [], minimal: [] }
  const unrecognized = []
  for (const event of events) {
    (buckets[event.severity] ?? unrecognized).push(event)
  }

  let shown = []
  const hiddenTiers = []
  for (const tier of SEVERITY_TIERS_STRONGEST_FIRST) {
    const bucket = buckets[tier]
    if (bucket.length === 0) continue
    const room = comfortableCount - shown.length
    if (room <= 0) {
      hiddenTiers.push(tier) // zero of this tier made it through — genuinely hidden
    } else if (bucket.length <= room) {
      shown = shown.concat(bucket)
    } else {
      shown = shown.concat(bucket.slice(0, room)) // partial fill — truncated, not "hidden"
    }
  }
  if (unrecognized.length > 0) {
    const room = comfortableCount - shown.length
    if (room > 0) shown = shown.concat(unrecognized.slice(0, room))
  }

  // Safety net: comfortableCount is always <= hardCap by construction
  // (see updateMarkers' call site), so this should never actually trigger.
  if (shown.length > hardCap) shown = shown.slice(0, hardCap)

  return { shown, total, hiddenTiers }
}

const markerTruncation = ref(null) // null | { shown: number, total: number, hiddenTiers: string[] }
const markerHiddenTiersLabel = computed(() => {
  const tiers = markerTruncation.value?.hiddenTiers ?? []
  return tiers.map((tier) => t(`severity.${tier}`)).join(', ')
})

// Shared debounce for every updateMarkers() trigger (zoom-threshold cross,
// mapMode toggle, disasterStore.allEvents change...) — user-reported,
// 2026-07-30: clicking a marker's popup open, it would visibly reload/
// re-fly-in 1-2 times right after. Root cause: several independent watchers
// each called updateMarkers() directly, un-coordinated — e.g. selectCountry()
// setting uiStore.mapMode='hexagon' (its own watcher fires immediately) landing
// within the same ~400ms window as loadCountryHistory's fetch resolving
// (the allEvents watcher, separately debounced) meant TWO full clear+rebuild
// cycles back to back, each one destroying and recreating (then
// re-opening, per the earlier popup-preservation fix) the same popup —
// two re-open animations in quick succession read as "loading twice" /
// "flying in from a weird spot". Routing every caller through one shared
// timer means whichever call happens last is the only one that actually
// runs.
let _markerUpdateTimer = null
function scheduleUpdateMarkers(delay = 150) {
  clearTimeout(_markerUpdateTimer)
  _markerUpdateTimer = setTimeout(updateMarkers, delay)
}

function updateMarkers() {
  if (!map || !mapLoaded) return

  // Durum/Petek/Isı all off (uiStore.mapMode === null, the map's true
  // "nothing pressed" state) means nothing shows at all — individual
  // markers used to fall back to visible here since they're Durum's own
  // rendering, but that read as "Durum is still active" even though the
  // button itself correctly wasn't lit (live-testing screenshot,
  // 2026-08-03: "sol tarafta hiçbir şey basılı değil ama yine de durumun
  // markaları duruyor"). In aggregated mode at low zoom, markers are
  // likewise hidden in favor of the hex/heatmap overlay — only clear if
  // some exist.
  if (uiStore.mapMode == null || ((uiStore.showHeatmap || uiStore.showHexbins) && currentZoom.value < 8)) {
    if (markerObjects.length > 0) clearMarkers()
    return
  }

  // Preserve a currently-open popup across this rebuild — live-testing
  // finding, user-reported: clicking a marker opened its popup, then it
  // silently closed itself under a second later. Root cause: this function
  // re-runs (debounced 400ms) on every disasterStore.allEvents change — a
  // realtime push, loadCountryHistory's own fetch, anything — and
  // clearMarkers() below destroys every marker DOM node/popup instance
  // from scratch each time, popup included, even mid-interaction.
  let openEventId = null
  for (const m of markerObjects) {
    const p = m.getPopup()
    if (p && p.isOpen()) {
      openEventId = m.__eventId
      break
    }
  }

  clearMarkers()

  const { shown, total, hiddenTiers } = selectEventsForMarkers(
    disasterStore.allEvents, MARKER_COMFORTABLE_COUNT, MARKER_RENDER_CAP,
  )
  markerTruncation.value = total > shown.length ? { shown: shown.length, total, hiddenTiers } : null

  shown.forEach((event) => {
    const color = getSeverityHex(event.severity)
    const rgbaColor = hexToRgba(color, 0.5)
    const isPulse = event.severity === 'critical'

    const el = document.createElement('div')
    el.className = `disaster-marker${isPulse ? ' marker-pulse' : ''}`
    el.innerHTML = `
      <div class="marker-dot" style="background:${color};box-shadow:0 0 10px ${color};">
        <span class="marker-icon">${hazardIconForMap(event.type) || event.icon || getDisasterIcon(event.type)}</span>
      </div>
    `

    const typeText = hazardDisplayNameForMap(event.type)

    const popup = new maplibregl.Popup({ offset: 12, className: 'modern-popup-container', maxWidth: '320px', closeButton: false }).setHTML(
      `
      <div class="disaster-popup-modern" style="--severity-color: ${color}; --severity-rgba: ${rgbaColor};">
        ${POPUP_CLOSE_BTN_HTML}
        <div class="popup-header">
          <span class="chip type-chip" style="background: ${color}; color: #000;">${typeText.toUpperCase()}</span>
        </div>
        <div class="popup-body">
          <h4 class="popup-title">${event.title}</h4>
          <div class="popup-metrics">
            ${formatPopupDetails(event)}
          </div>
        </div>
        <div class="popup-footer">
          <span class="popup-date">${new Date(event.time).toLocaleString('tr-TR')}</span>
          <div class="source-chip-group">
            ${disasterSourceBadges(event).map((b) => `<span class="chip source-chip">${b.label}</span>`).join('') || '<span class="chip source-chip">Bilinmiyor</span>'}
          </div>
        </div>
      </div>
    `,
    )

    registerPopupCascade(popup)
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([event.lng, event.lat])
      .setPopup(popup)
      .addTo(map)
    marker.__eventId = event.id

    // Impact Analysis (spec 008): drive the split-view side panel independently
    // of the existing popup toggle behavior.
    el.addEventListener('click', () => {
      selectedImpactEvent.value = event
    })

    markerObjects.push(marker)
    if (event.id != null && event.id === openEventId) marker.togglePopup()
  })
}

function updateHeatmap() {
  if (!map || !mapLoaded) return

  const showHeat = uiStore.showHeatmap
  map.setLayoutProperty('heat-layer', 'visibility', showHeat ? 'visible' : 'none')

  if (!showHeat) return

  let events = disasterStore.allEvents

  // Filter to selected country's bounding box when focused
  if (selectedFeatureId && selectedCountryBounds) {
    events = events.filter(
      (e) => e.lat != null && e.lng != null && selectedCountryBounds.contains([e.lng, e.lat]),
    )
  }

  const intensityMap = { critical: 1.0, high: 0.8, moderate: 0.6, low: 0.3, minimal: 0.1 }
  const features = events.map((e) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
    properties: { weight: intensityMap[e.severity] || 0.1 },
  }))

  map.getSource('disaster-heat').setData({ type: 'FeatureCollection', features })
}

// Lazily creates the hex worker — split out from updateHexbins() (spec: map
// now defaults to 'heatmap' mode, not 'hexagon') so the worker isn't only
// ever created the first time the world-view hexbin layer turns on. Without
// this, selecting a country while already in heatmap/normal mode called
// refreshCountryHexGridFromSelection() against a hexWorker that had never
// been instantiated — its `if (!hexWorker) return` guard silently no-opped
// and the country's own petek grid never rendered (live-testing finding).
function ensureHexWorker() {
  if (hexWorker) return
  hexWorker = new HexWorker()
  hexWorker.onmessage = ({ data }) => {
    if (!map || !mapLoaded) return

    if (data.type === 'FILL_GRID') {
      // Country grid: apply signal colors then render
      applySignalToCountryGrid(data.features)
    } else if (data.type === 'FILL_VIEWPORT') {
      // Cache static mesh for this resolution
      const res = data.res ?? currentHexRes.value
      hexGridCache.set(res, data.features)
      map.getSource('hex-world-bg')?.setData({
        type: 'FeatureCollection',
        features: data.features,
      })
      // Inject signal onto the cached mesh
      applySignalToGrid()
    }
  }
  const landCells = Array.from(getLandCells())
  hexWorker.postMessage({ type: 'INIT_LAND', landCells })
}

function updateHexbins() {
  if (!map || !mapLoaded) return

  const showHex = uiStore.showHexbins
  const vis = showHex ? 'visible' : 'none'
  map.setLayoutProperty('hex-fill', 'visibility', vis)
  map.setLayoutProperty('hex-stroke', 'visibility', vis)
  map.setLayoutProperty('hex-bg-stroke', 'visibility', vis)

  if (!showHex) {
    map.getSource('disaster-hex')?.setData({ type: 'FeatureCollection', features: [] })
    return
  }

  ensureHexWorker()
  updateViewportGrid()
}

function updateUserMarker() {
  if (!map || !mapLoaded) return

  if (geoStore.hasLocation) {
    const coords = [geoStore.userLng, geoStore.userLat]
    if (userMarkerObj) {
      userMarkerObj.setLngLat(coords)
    } else {
      const el = document.createElement('div')
      el.className = 'user-location-marker'
      el.innerHTML = `
        <div class="user-pin">
          <div class="pin-head"></div>
          <div class="pin-pulse"></div>
        </div>
      `
      userMarkerObj = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText('Konumunuz'))
        .addTo(map)
    }
  } else if (userMarkerObj) {
    userMarkerObj.remove()
    userMarkerObj = null
  }
}

// A self-hosted country's .mbtiles only covers that country's own bounding
// box (e.g. Turkey's tile-builder extract: lng 25.5–44.9, lat 35.7–43.1) —
// swapping the base style to it outright meant everything outside that
// box requested tiles that simply don't exist there, rendering solid black
// (live-testing finding, 2026-08-03: neighboring countries/sea went black
// the moment Turkey's self-hosted style became active). Both styles use the
// same OpenMapTiles vector schema (self-hosted is Planetiler-built,
// specifically OpenMapTiles-schema-compatible), so instead of swapping,
// this layers the self-hosted country's own 'openmaptiles' layers on top of
// the public style's — self-hosted renders wherever it actually has tiles
// (higher zoom/detail, no third-party dependency), and the public layers
// underneath keep showing through everywhere else in the same viewport, no
// area-detection logic needed: an out-of-bounds vector tile request just
// comes back empty.
function buildHybridStyle(publicStyle, selfHostedStyle) {
  const selfHostedSource = selfHostedStyle.sources?.openmaptiles
  if (!selfHostedSource) return publicStyle // unexpected shape — don't guess, just use the public style as-is

  const hybridSourceId = 'openmaptiles-selfhosted'
  const selfHostedLayers = (selfHostedStyle.layers ?? [])
    .filter((layer) => layer.source === 'openmaptiles') // background/other sources, if any, stay public-only
    .map((layer) => ({ ...layer, id: `${layer.id}-selfhosted`, source: hybridSourceId }))

  return {
    ...publicStyle,
    sources: { ...publicStyle.sources, [hybridSourceId]: selfHostedSource },
    // Appended after the public layers so self-hosted detail draws on top
    // of (not underneath) the public basemap it's overlaying.
    layers: [...publicStyle.layers, ...selfHostedLayers],
  }
}

async function resolveStyle() {
  const s = MAP_STYLES[mapStyleIndex.value]
  if (!s.url) return ESRI_SATELLITE_STYLE
  const selfHostedUrl = selfHostedStyleUrl()
  const url = selfHostedUrl ?? s.url
  if (styleCache[url]) {
    _appliedStyleUrl = url
    return styleCache[url]
  }
  try {
    if (selfHostedUrl) {
      const [selfHostedRes, publicRes] = await Promise.all([fetch(selfHostedUrl), fetch(s.url)])
      if (!selfHostedRes.ok) throw new Error(`self-hosted style fetch ${selfHostedRes.status}`)
      if (!publicRes.ok) throw new Error(`public style fetch ${publicRes.status}`)
      const [selfHostedJson, publicJson] = await Promise.all([selfHostedRes.json(), publicRes.json()])
      styleCache[s.url] = publicJson // reused as-is if a later switch drops back to public-only
      const hybrid = buildHybridStyle(publicJson, selfHostedJson)
      styleCache[url] = hybrid
      _appliedStyleUrl = url
      return hybrid
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`style fetch ${res.status}`)
    const json = await res.json()
    styleCache[url] = json
    _appliedStyleUrl = url
    return json
  } catch (e) {
    // The startup /health probe said reachable, but the container went
    // away mid-session (or a race let this slip through before the probe
    // resolved) — same "never let a bad self-hosted URL blank the map"
    // guarantee as the reachability gate itself, just for this later case.
    if (!selfHostedUrl) throw e
    console.warn('[MapView] Self-hosted tile style unreachable, falling back to public API:', e)
    tileserverReachable.value = false
    if (styleCache[s.url]) {
      _appliedStyleUrl = s.url
      return styleCache[s.url]
    }
    const res = await fetch(s.url)
    const json = await res.json()
    styleCache[s.url] = json
    _appliedStyleUrl = s.url
    return json
  }
}

async function applyBaseStyle() {
  if (!map) return
  mapLoaded = false
  interactionsSetUp = false
  const version = ++styleLoadVersion

  let style
  try {
    style = await resolveStyle()
  } catch (e) {
    console.warn('[MapView] Failed to fetch style:', e)
    mapLoaded = true
    return
  }
  if (version !== styleLoadVersion) return // superseded while fetching

  map.setStyle(style)

  function onStyleReady() {
    if (version !== styleLoadVersion || mapLoaded) return
    mapLoaded = true
    map.doubleClickZoom.disable()
    addSourcesAndLayers()
    setupMapInteractions()
    brightenDarkLabels()
    if (selectedFeatureId !== null) {
      map.setFeatureState({ source: 'world-countries', id: selectedFeatureId }, { selected: true })
      _allCountryFeatures.forEach((cf) => {
        if (cf.id !== selectedFeatureId)
          map.setFeatureState({ source: 'world-countries', id: cf.id }, { dimmed: true })
      })
      const selF = _allCountryFeatures.find((cf) => cf.id === selectedFeatureId)
      if (selF) setFocusMode(true, selF)
    }
    updateMarkers()
    updateShelterMarkers()
    updateCommunityReportMarkers()
    updateDrillEventMarkers()
    updateHeatmap()
    updateHexbins()
    updateUserMarker()
  }

  // Fallback: inline style objects (e.g. satellite) may not fire style.load
  const fallbackTimer = setTimeout(onStyleReady, 800)

  map.once('style.load', () => {
    clearTimeout(fallbackTimer)
    onStyleReady()
  })
}

function flyToRegion(lat, lng, zoom) {
  if (!map) return
  map.flyTo({ center: [lng, lat], zoom, duration: 1500, essential: true })
}

function downloadMap() {
  if (!map || !mapLoaded) return
  map.getCanvas().toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gews-map-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.png`
    a.click()
    URL.revokeObjectURL(url)
  })
}

watch(
  () => uiStore.selectedRegion,
  (region) => {
    if (region && map) flyToRegion(region.lat, region.lng, region.zoom)
  },
)

// Reloads the base style when selecting/deselecting a country flips
// selfHostedStyleUrl()'s answer (e.g. entering/leaving Turkey or
// Madagascar) — compares against the URL actually resolved for the style
// already applied, not just selectedCountryCode itself, so switching
// between two non-self-hosted countries doesn't trigger a pointless full
// style reload (addSourcesAndLayers() etc. all re-run on every reload).
let _appliedStyleUrl = null
// Also watches tileserverReachable: the startup /health probe (see its own
// declaration) is async and usually still pending when a locked account's
// initial style loads, so a country that turns out to be self-hosted needs
// a second chance to upgrade once the probe actually answers — not just on
// the next country selection.
watch([selectedCountryCode, tileserverReachable], () => {
  if (!map || !mapLoaded) return
  const s = MAP_STYLES[mapStyleIndex.value]
  const nextUrl = selfHostedStyleUrl() ?? s.url
  if (nextUrl === _appliedStyleUrl) return
  _appliedStyleUrl = nextUrl
  applyBaseStyle()
})

let _mapUpdateTimer = null
watch(
  () => [disasterStore.allEvents, disasterStore.aggregatedH3Data],
  () => {
    clearTimeout(_mapUpdateTimer)
    _mapUpdateTimer = setTimeout(() => {
      scheduleUpdateMarkers(0) // shares the marker-rebuild timer with every other trigger
      updateHeatmap()
      // Signal injection: re-inject colors without recomputing geometry
      if (mapLoaded && uiStore.showHexbins) {
        applySignalToGrid()
        if (selectedFeatureId && countryHexFeatures?.length) {
          applySignalToCountryGrid(countryHexFeatures)
        }
      } else {
        updateHexbins()
      }
    }, 400)
  },
)

watch(
  () => uiStore.mapMode,
  () => {
    scheduleUpdateMarkers()
    updateHeatmap()
    updateHexbins()
    // When switching to heatmap on a focused country, filter immediately
    if (uiStore.showHeatmap && selectedFeatureId) updateHeatmap()

    // durum/petek/ısı (normal/hexagon/heatmap) are mutually exclusive for
    // the selected country's own hex grid — it must only be visible in
    // 'hexagon' mode, not linger underneath 'normal'/'heatmap' once a user
    // switches away from petek (this was previously left rendered
    // indefinitely, since only clearCountrySelection() ever cleared it).
    if (!map || !mapLoaded) return
    if (uiStore.mapMode === 'hexagon') {
      refreshCountryHexGridFromSelection()
    } else {
      map.getSource('country-hex-grid')?.setData({ type: 'FeatureCollection', features: [] })
    }
  },
)

watch(
  () => geoStore.userCoords,
  () => {
    updateUserMarker()
  },
  { deep: true },
)

// spec 027 (US2): toggling the shelter layer visibility shows/hides markers
// instantly without re-fetching
watch(
  () => uiStore.showShelters,
  () => {
    updateShelterMarkers()
  },
)

watch(
  () => sheltersStore.shelters,
  () => {
    updateShelterMarkers()
  },
)

// spec 036 (US3): same toggle/refetch-driven update pattern as shelters above
watch(
  () => uiStore.showCommunityReports,
  () => {
    updateCommunityReportMarkers()
  },
)

watch(
  () => communityReportsStore.reports,
  () => {
    updateCommunityReportMarkers()
  },
)

// spec 037: re-render whenever the active drill's injected events change
// (e.g. an admin injects/removes one in another tab/session)
watch(
  () => drillInjectedEventsStore.events,
  () => {
    updateDrillEventMarkers()
  },
)

// Dark/light mode UI değişikliği harita stilini ETKİLEMEZ
// Harita stili sadece layer switcher butonuyla değişir

// ── Keyboard shortcuts: 1=Normal 2=Hexagon 3=Heatmap ────────────────────────
const MODES = ['normal', 'hexagon', 'heatmap']

function handleMapModeKey(e) {
  // Ignore when user is typing in an input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  // Same toggle-off-if-already-active behavior as the Durum/Petek/Isı
  // buttons themselves (1/2/3 are documented as their keyboard equivalents
  // in the buttons' own tooltips) — 2026-08-03 feedback.
  if (e.key === '1') uiStore.toggleMapMode('normal')
  else if (e.key === '2') uiStore.toggleMapMode('hexagon')
  else if (e.key === '3') uiStore.toggleMapMode('heatmap')
  else if (e.key === 'Tab') {
    e.preventDefault()
    const idx = MODES.indexOf(uiStore.mapMode)
    uiStore.mapMode = MODES[(idx + 1) % MODES.length]
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleMapModeKey)
  // spec 012 T020: always re-fetch here too (idempotent-safe) so a layer
  // deactivated by an admin is absent from the panel on this map's next
  // mount, even if App.vue's boot-time fetch is stale from an earlier session.
  mapLayersStore.fetchMapLayers()
  // spec 042: exposure_datasets layers — same idempotent-refetch rationale
  exposureLayersStore.fetchExposureLayers()
  // spec 027: shelters are fetched here too (idempotent-safe, same rationale
  // as the map_layers re-fetch above); updateShelterMarkers() is invoked from
  // initMap()'s style-load handlers once the map itself is ready.
  sheltersStore.fetchShelters().then(() => updateShelterMarkers())
  // spec 036: same idempotent-refetch rationale as shelters above
  communityReportsStore.fetchApproved().then(() => updateCommunityReportMarkers())
  // spec 037: whichever drill is active in the viewer's own country (any,
  // for super_admin) — no-op if none is active
  loadActiveDrillEvents()
  if (!hazardTypesStore.loaded) hazardTypesStore.fetchHazardTypes()
  requestAnimationFrame(function tryInit() {
    if (!mapContainer.value) return
    const { offsetWidth, offsetHeight } = mapContainer.value
    if (!offsetWidth || !offsetHeight) {
      requestAnimationFrame(tryInit)
      return
    }
    initMap()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleMapModeKey)
  clearTimeout(collapsedPanelHintTimer)
  clearMarkers()
  clearShelterMarkers()
  if (userMarkerObj) {
    userMarkerObj.remove()
    userMarkerObj = null
  }
  mapResizeObserver?.disconnect()
  mapResizeObserver = null
  if (map) {
    map.remove()
    map = null
    mapLoaded = false
  }
})
</script>

<template>
  <div
    class="map-view-wrapper"
    :class="{ 'impact-panel-collapsed': uiStore.impactPanelCollapsed }"
  >
    <div ref="mapContainer" class="map-leaflet"></div>
    <div class="zoom-control-bar">
      <button class="zoom-btn" :disabled="currentZoom >= (isSatellite ? 17.4 : 20)" @click="zoomIn">+</button>
      <span class="zoom-value">x {{ currentZoom }}</span>
      <button class="zoom-btn" :disabled="currentZoom <= 0" @click="zoomOut">−</button>
    </div>

    <LoadingOverlay
      :visible="!!loadingExposureLayer"
      :message="loadingExposureLayer ? t('exposureLayers.loadingLayer', { name: friendlyDatasetLabel(t, loadingExposureLayer) }) : ''"
      @cancel="cancelExposureLayerLoading"
    />

    <ConfirmDialog
      v-if="showTerrainWarning"
      :title="t('map.terrain3DWarningTitle')"
      :message="t('map.terrain3DWarningMessage')"
      :confirm-label="t('map.terrain3DWarningConfirm')"
      :cancel-label="t('map.terrain3DWarningCancel')"
      @confirm="confirmEnableTerrain3D"
      @cancel="showTerrainWarning = false"
    />

    <!-- All bottom-left-anchored legends live in one flex group so they lay
         out side-by-side (wide screens) or stack (narrow, see the
         .map-legend-group media query) instead of overlapping — user-
         reported 2026-08-05: toggling a gridded exposure layer (e.g.
         rainfall) changed the map's colors with no legend explaining them,
         while the event-severity legend below stayed on unrelated to it. -->
    <div class="map-legend-group" :class="{ 'legend-sidebar-collapsed': uiStore.sidebarCollapsed }">
      <!-- Heatmap legend -->
      <div v-if="uiStore.showHeatmap" class="map-legend">
        <div class="legend-title">Yoğunluk</div>
        <div class="legend-gradient heat-gradient"></div>
        <div class="legend-labels">
          <span>Düşük</span>
          <span>Yüksek</span>
        </div>
      </div>

      <!-- Hexbin / marker severity legend -->
      <div v-else-if="uiStore.showHexbins || (!uiStore.showHeatmap && !uiStore.showHexbins)" class="map-legend">
        <div class="legend-title">Şiddet</div>
        <div class="legend-severity-rows">
          <div class="sev-row">
            <span class="sev-dot" style="background: var(--color-minimal)"></span><span>Minimal</span>
          </div>
          <div class="sev-row">
            <span class="sev-dot" style="background: var(--color-low)"></span><span>Düşük</span>
          </div>
          <div class="sev-row">
            <span class="sev-dot" style="background: var(--color-moderate)"></span><span>Orta</span>
          </div>
          <div class="sev-row">
            <span class="sev-dot" style="background: var(--color-high)"></span><span>Yüksek</span>
          </div>
          <div class="sev-row">
            <span class="sev-dot" style="background: var(--color-critical)"></span><span>Kritik</span>
          </div>
        </div>
        <p v-if="markerTruncation && markerTruncation.hiddenTiers.length > 0" class="marker-truncation-note">
          {{ t('map.markerTruncationTiered', { shown: markerTruncation.shown, total: markerTruncation.total, tiers: markerHiddenTiersLabel }) }}
        </p>
        <p v-else-if="markerTruncation" class="marker-truncation-note">
          {{ t('map.markerTruncation', { shown: markerTruncation.shown, total: markerTruncation.total }) }}
        </p>
      </div>

      <!-- Gridded exposure layer legends (population, rainfall/CHIRPS, drought,
           river discharge, etc.) — one card per active layer, each showing
           the actual value range behind every color band on the map. -->
      <div v-for="legend in activeExposureLegends" :key="legend.id" class="map-legend exposure-legend">
        <div class="legend-title">{{ legend.label }}</div>
        <div class="exposure-legend-rows">
          <div v-for="(stop, i) in legend.stops" :key="i" class="exposure-legend-row">
            <span class="exposure-legend-swatch" :style="{ background: stop.color }"></span>
            <span class="exposure-legend-range">{{ stop.from }}–{{ stop.to }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Live pitch/detail tuning (spec-less follow-up, 2026-07-28): only
         while 3D terrain is actually on — tuning knobs for a feature that's
         off are meaningless clutter. -->
    <div v-if="isSatellite && terrain3DEnabled" class="terrain-tuning-panel">
      <label class="terrain-tuning-row">
        <span class="terrain-tuning-label">{{ t('map.terrainPitchLabel') }} {{ terrainPitch }}°</span>
        <input
          type="range" min="30" max="60" step="5"
          :value="terrainPitch"
          @input="updateTerrainPitch(Number($event.target.value))"
          class="terrain-tuning-slider"
        />
      </label>
      <label class="terrain-tuning-row">
        <span class="terrain-tuning-label">{{ t('map.terrainDetailLabel') }} {{ terrainDetailMaxZoom }}</span>
        <input
          type="range" min="5" max="15" step="1"
          :value="terrainDetailMaxZoom"
          @change="updateTerrainDetail(Number($event.target.value))"
          class="terrain-tuning-slider"
        />
      </label>
    </div>

    <button
      v-if="isSatellite"
      type="button"
      class="terrain-toggle-btn"
      :class="{ active: terrain3DEnabled }"
      :title="terrain3DEnabled ? t('map.terrain2D') : t('map.terrain3D')"
      :aria-label="terrain3DEnabled ? t('map.terrain2D') : t('map.terrain3D')"
      @click="toggleTerrain3D"
    >
      {{ terrain3DEnabled ? t('map.terrain2DShort') : t('map.terrain3DShort') }}
    </button>

    <button
      class="map-download-btn"
      type="button"
      :title="t('impact.downloadMap')"
      :aria-label="t('impact.downloadMap')"
      @click="downloadMap"
    >
      <svg class="map-download-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2" />
      </svg>
      <span class="sr-only">{{ t('impact.downloadMap') }}</span>
    </button>

    <div class="layer-switcher" @click="cycleMapStyle">
      <div
        class="layer-preview"
        :class="MAP_STYLES[(mapStyleIndex + 1) % MAP_STYLES.length].preview"
      >
        <span class="layer-label">{{
          MAP_STYLES[(mapStyleIndex + 1) % MAP_STYLES.length].label
        }}</span>
      </div>
    </div>

    <!-- Country hover tooltip -->
    <Transition name="hover-label">
      <div
        v-if="hoveredCountryName"
        class="country-hover-label"
        :style="{ left: (hoveredCountryPoint.x + 18) + 'px', top: hoveredCountryPoint.y + 'px' }"
      >{{ hoveredCountryName }}</div>
    </Transition>

    <!-- Selected country badge -->
    <Transition name="country-badge">
      <div v-if="selectedCountryName" class="country-badge">
        <span class="country-badge-name">{{ selectedCountryName }}</span>
        <div class="country-badge-close" @click="clearCountrySelection" title="Temizle">✕</div>
      </div>
    </Transition>

    <!-- Impact Analysis (spec 008): geocoding search + split-view side panel -->
    <!-- Top controls row (UX follow-up): shelters/reports, geocoding search,
         and WMS/exposure layers used to be three independently absolute-
         positioned boxes with a hand-tuned calc() trying to keep the search
         bar centered between whatever the other two happened to be. A
         three-column grid (1fr auto 1fr) makes that centering exact instead
         of approximate — the search bar sits in the auto-sized middle
         column, and the two 1fr side columns are always equal width by
         definition, regardless of how wide the shelters panel or layer
         stack currently are (collapsed vs. expanded). -->
    <div class="top-controls-row" :class="{ 'legend-sidebar-collapsed': uiStore.sidebarCollapsed }">
      <!-- Shelter map layer toggle (spec 027) — always visible, independent of WMS/WFS layers. -->
      <div
        class="shelters-layer-panel"
        :class="{ 'shelters-layer-panel--collapsed': sheltersLayerPanelCollapsed }"
      >
        <Button
          v-if="sheltersLayerPanelCollapsed"
          ref="sheltersHintAnchorEl"
          type="button"
          variant="ghost"
          size="icon"
          class="shelters-layer-collapse-btn shelters-layer-collapse-btn--collapsed"
          :aria-label="t('shelters.map.panelExpand')"
          :title="t('shelters.map.panelExpand')"
          @click="sheltersLayerPanelCollapsed = false"
        >
          <svg class="shelters-layer-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z" />
            <circle cx="12" cy="9" r="2.6" fill="rgba(0,0,0,.35)" />
          </svg>
        </Button>
        <template v-else>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="shelters-layer-collapse-btn"
            :aria-label="t('shelters.map.panelCollapse')"
            :title="t('shelters.map.panelCollapse')"
            @click="sheltersLayerPanelCollapsed = true"
          >
            <svg class="shelters-layer-arrow" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 17 L7 7 M7 7 H15 M7 7 V15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </Button>
          <h4 class="map-layers-title shelters-layer-title">{{ t('shelters.map.panelTitle') }}</h4>
          <label class="map-layer-toggle">
            <Checkbox :model-value="uiStore.showShelters" @update:model-value="uiStore.toggleShelters()" />
            <span>{{ t('shelters.map.toggleLabel') }}</span>
          </label>
          <label class="map-layer-toggle">
            <Checkbox
              :model-value="uiStore.showCommunityReports"
              @update:model-value="uiStore.toggleCommunityReports()"
            />
            <span>{{ t('communityReport.map.toggleLabel') }}</span>
          </label>
        </template>
      </div>

      <GeocodingSearch @location-selected="onLocationSelected" />

      <!-- Layer panel stack: WMS/WFS (spec 012) + Exposure layers (spec 042) share one
           positioned column so neither overlaps the other when both are present. -->
      <div class="layer-panel-stack">
        <!-- OGC WMS/WFS Map Layers (spec 012): toggle + opacity, session-only state -->
        <div v-if="mapLayersStore.activeMapLayers.length" class="map-layers-panel">
          <h4 class="map-layers-title">{{ t('mapLayers.panelTitle') }}</h4>
          <div v-for="layer in mapLayersStore.activeMapLayers" :key="layer.id" class="map-layer-row">
            <label class="map-layer-toggle">
              <Checkbox :model-value="isLayerVisible(layer.id)" @update:model-value="toggleMapLayer(layer)" />
              <span>{{ layer.display_name }}</span>
              <span class="map-layer-type">{{ layer.source_type.toUpperCase() }}</span>
            </label>
            <input
              v-if="isLayerVisible(layer.id)"
              type="range" min="0" max="1" step="0.05"
              :value="getLayerOpacity(layer.id)"
              @input="setMapLayerOpacity(layer, Number($event.target.value))"
              class="map-layer-opacity"
            />
          </div>
        </div>

        <!-- Exposure layers (spec 042): roads/population/rivers/basins etc, generic
             geometry-driven rendering + click-to-inspect. Toggle + opacity share the
             same session-only state shape as the WMS/WFS panel above. -->
        <div
          v-if="exposureLayersStore.loaded"
          class="map-layers-panel exposure-layers-panel"
          :class="{ 'exposure-layers-panel--collapsed': exposureLayersPanelCollapsed }"
        >
          <Button
            v-if="exposureLayersPanelCollapsed"
            ref="exposureHintAnchorEl"
            type="button"
            variant="ghost"
            size="icon"
            class="exposure-layers-collapse-btn exposure-layers-collapse-btn--collapsed"
            :aria-label="t('exposureLayers.expand')"
            :title="t('exposureLayers.expand')"
            @click="exposureLayersPanelCollapsed = false"
          >
            <svg class="exposure-layers-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2 L2 7 L12 12 L22 7 Z" />
              <path d="M2 12 L12 17 L22 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M2 17 L12 22 L22 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </Button>
          <template v-else>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="exposure-layers-collapse-btn"
              :aria-label="t('exposureLayers.collapse')"
              :title="t('exposureLayers.collapse')"
              @click="exposureLayersPanelCollapsed = true"
            >
              <svg class="exposure-layers-arrow" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 17 L17 7 M17 7 H9 M17 7 V15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </Button>
            <h4 class="map-layers-title">{{ t('exposureLayers.panelTitle') }}</h4>
            <!-- Gated on selectedCountryName, not selectedCountryCode: a custom
                 territory (e.g. KKTC) can be genuinely selected with no country
                 code at all, and should read as "no layers for this place" —
                 not as if nothing were selected yet. -->
            <p v-if="!selectedCountryName" class="exposure-layers-empty">{{ t('exposureLayers.selectCountryPrompt') }}</p>
            <p v-else-if="visibleExposureDatasets.length === 0" class="exposure-layers-empty">{{ t('exposureLayers.emptyState') }}</p>
            <div v-for="dataset in visibleExposureDatasets" :key="dataset.id" class="map-layer-row exposure-layer-row">
            <label class="map-layer-toggle">
              <Checkbox :model-value="isLayerVisible(`exposure-dataset-${dataset.id}`)" @update:model-value="toggleExposureLayer(dataset)" />
              <span class="exposure-layer-swatch" :style="{ background: colorForDataset(dataset) }"></span>
              <span class="exposure-layer-name" :title="friendlyDatasetLabel(t, dataset)">{{ friendlyDatasetLabel(t, dataset) }}</span>
              <span class="map-layer-type exposure-layer-count" v-if="dataset.feature_count">{{ t('exposureLayers.featureCount', { count: dataset.feature_count.toLocaleString() }) }}</span>
            </label>
            <input
              v-if="isLayerVisible(`exposure-dataset-${dataset.id}`)"
              type="range" min="0" max="1" step="0.05"
              :value="getLayerOpacity(`exposure-dataset-${dataset.id}`)"
              @input="setExposureLayerOpacity(dataset, Number($event.target.value))"
              class="map-layer-opacity"
              :style="{ accentColor: colorForDataset(dataset) }"
            />
            <!-- spec 046 US2: hexagon vs. province (ADM1) vs. district (ADM2)
                 population view — only for population sources, and only once
                 the layer itself is on (region aggregation reads its
                 already-fetched hex data). -->
            <div
              v-if="isPopulationSource(dataset.source_name) && isLayerVisible(`exposure-dataset-${dataset.id}`)"
              class="population-view-toggle"
            >
              <button
                type="button"
                class="population-view-btn"
                :class="{ active: isRegionLevelActive(dataset, 'hexagon') }"
                @click="toggleRegionLevel(dataset, 'hexagon')"
              >{{ t('exposureLayers.regionView.hexagonOption') }}</button>
              <button
                type="button"
                class="population-view-btn"
                :class="{ active: isRegionLevelActive(dataset, 'province'), loading: regionViewLoadingFor(dataset, 'province') }"
                :disabled="!isRegionViewAvailable(dataset, 'province') || regionViewLoadingFor(dataset, 'province')"
                :title="isRegionViewAvailable(dataset, 'province') ? '' : t('exposureLayers.regionView.unavailableTooltip')"
                @click="toggleRegionLevel(dataset, 'province')"
              >{{ regionViewLoadingFor(dataset, 'province') ? t('exposureLayers.loading') : t('exposureLayers.regionView.provinceOption') }}</button>
              <button
                type="button"
                class="population-view-btn"
                :class="{ active: isRegionLevelActive(dataset, 'district'), loading: regionViewLoadingFor(dataset, 'district') }"
                :disabled="!isRegionViewAvailable(dataset, 'district') || regionViewLoadingFor(dataset, 'district')"
                :title="isRegionViewAvailable(dataset, 'district') ? '' : t('exposureLayers.regionView.unavailableTooltip')"
                @click="toggleRegionLevel(dataset, 'district')"
              >{{ regionViewLoadingFor(dataset, 'district') ? t('exposureLayers.loading') : t('exposureLayers.regionView.districtOption') }}</button>
              <button
                type="button"
                class="population-view-btn"
                :class="{ active: isRegionLevelActive(dataset, 'village'), loading: regionViewLoadingFor(dataset, 'village') }"
                :disabled="!isRegionViewAvailable(dataset, 'village') || regionViewLoadingFor(dataset, 'village')"
                :title="isRegionViewAvailable(dataset, 'village') ? '' : t('exposureLayers.regionView.unavailableTooltip')"
                @click="toggleRegionLevel(dataset, 'village')"
              >{{ regionViewLoadingFor(dataset, 'village') ? t('exposureLayers.loading') : t('exposureLayers.regionView.villageOption') }}</button>
            </div>
            <!-- spec 050 follow-up: category filter for critical infrastructure
                 (schools/health/emergency) — e.g. hide schools for a
                 night-time event, or after a category's buildings are known
                 destroyed. Pure client-side filter, no new fetch. -->
            <div
              v-if="dataset.source_name === 'osm-buildings' && isLayerVisible(`exposure-dataset-${dataset.id}`)"
              class="population-view-toggle"
            >
              <button
                v-for="category in CRITICAL_INFRA_CATEGORIES"
                :key="category"
                type="button"
                class="population-view-btn"
                :class="{ active: isCriticalInfraCategoryActive(category) }"
                @click="toggleCriticalInfraCategory(category)"
              >{{ t('assetCategory.' + category, category) }}</button>
            </div>
          </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Collapsed shelters/exposure-layers panel hints (see
         showCollapsedPanelHints's own comment) — teleported to <body> and
         positioned at the anchor button's real getBoundingClientRect(),
         independent of either panel's own overflow/scroll ancestors. -->
    <Teleport to="body">
      <Transition name="hover-label">
        <span
          v-if="sheltersLayerPanelCollapsed && showCollapsedPanelHints && sheltersHintPos"
          class="collapsed-panel-hint"
          :style="{ top: sheltersHintPos.top + 'px', left: sheltersHintPos.left + 'px' }"
        >{{ t('shelters.map.panelExpand') }}</span>
      </Transition>
      <Transition name="hover-label">
        <span
          v-if="exposureLayersPanelCollapsed && showCollapsedPanelHints && exposureHintPos"
          class="collapsed-panel-hint"
          :style="{ top: exposureHintPos.top + 'px', right: exposureHintPos.right + 'px' }"
        >{{ t('exposureLayers.expand') }}</span>
      </Transition>
    </Teleport>

    <div class="impact-panel-dock" :class="{ collapsed: uiStore.impactPanelCollapsed }">
      <!-- Persistent header — always here regardless of which face
           (Impact Analysis / Settings) is flipped up, so the collapse
           toggle has a real, stable menu bar to anchor to (top:100%/
           left:100%, same technique as .sidebar-header in
           SidebarPanel.vue) instead of a guessed pixel value. -->
      <div class="dock-header">
        <span class="dock-header-title">
          {{ uiStore.settingsPanelOpen ? `⚙️ ${t('settings.title')}` : '📊 Etki Analizi' }}
        </span>
        <Button
          v-if="uiStore.settingsPanelOpen"
          type="button"
          variant="ghost"
          size="icon"
          class="dock-header-close"
          @click="uiStore.toggleSettings()"
        >
          ✕
        </Button>
        <div class="panel-collapse-toggle-slot">
          <PanelCollapseToggle
            mirrored
            :collapsed="uiStore.impactPanelCollapsed"
            :title="uiStore.impactPanelCollapsed ? t('impact.panel.expand') : t('impact.panel.collapse')"
            @click="uiStore.toggleImpactPanel()"
          />
        </div>
      </div>
      <!-- Settings (gear icon in the sidebar) takes over this same dock
           instead of opening its own separate panel — flips in place so it
           reads as "the same right-hand panel changed pages", not two
           competing panels stacking on top of each other. Both faces stay
           mounted; CSS rotateY + backface-visibility decide what's shown. -->
      <div
        v-show="!uiStore.impactPanelCollapsed"
        class="dock-flip"
        :class="{ flipped: uiStore.settingsPanelOpen }"
      >
        <div class="dock-face dock-face-front">
          <ImpactPanel
            :selected-event="selectedImpactEvent"
            :country-code="selectedCountryCode"
            :halo-opacity="haloOpacity"
            @update:halo-opacity="haloOpacity = $event"
            @update:halo-radius-km="externalHaloRadiusKm = $event"
          />
        </div>
        <div class="dock-face dock-face-back">
          <SettingsPanel hide-header />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-view-wrapper {
  --impact-panel-width: 320px;
  --map-control-offset: calc(var(--impact-panel-width) + 16px);
  width: 100%;
  height: 100vh;
  position: relative;
  z-index: 1;
  isolation: isolate;
}

.map-view-wrapper.impact-panel-collapsed {
  --impact-panel-width: 48px;
  --map-control-offset: calc(var(--impact-panel-width) + 12px);
}

.map-leaflet {
  width: 100%;
  height: 100vh;
}

.top-controls-row {
  /* Shelters/reports (left) + geocoding search (center) + WMS/exposure
     layers (right), as one 3-column grid instead of three independently
     absolute-positioned boxes. The two outer 1fr tracks are always equal
     width, so the auto-sized middle column (the search bar) sits exactly
     centered in the row regardless of how wide the two side panels
     currently are — collapsed vs. expanded, sidebar open vs. closed. */
  position: absolute;
  top: 16px;
  left: calc(var(--sidebar-width, 280px) + 12px);
  right: calc(var(--map-control-offset) + 12px);
  z-index: 20;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 12px;
  transition: left 0.35s ease, right 0.2s ease;
  /* This row's own box is auto-height = its tallest child (the exposure
     layers panel, 600px+ when expanded) — align-items:start only keeps each
     CHILD sized to its own content, it does nothing for the row's own empty
     space below the shorter children (the search bar). That empty space was
     still a real, hit-testable part of this absolutely-positioned div, so it
     silently ate every click meant for the map/popups underneath across the
     row's full width (live-testing finding, 2026-08-03: close-button clicks
     and zoom scroll landing here rather than the map). Click-through on the
     row itself, opted back in per real child below, fixes it without
     touching any of their own layout. */
  pointer-events: none;
}
.top-controls-row > * {
  pointer-events: auto;
}

.top-controls-row.legend-sidebar-collapsed {
  left: calc(var(--sidebar-collapsed, 56px) + 12px);
}

.layer-panel-stack {
  /* Right-hand column of .top-controls-row's 3-col grid — hugs the row's
     right edge via justify-self, doesn't position itself independently. */
  justify-self: end;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  max-height: calc(100% - 32px);
  overflow-y: auto;
}
.map-layers-panel {
  background: rgba(15,17,23,.9);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px;
  padding: 14px 16px 42px;
  min-width: 220px;
  max-width: 280px;
  color: #e2e8f0;
  font-size: .8rem;
}
.exposure-layers-panel {
  position: relative;
  max-width: 420px;
  /* Current full size is the ceiling — collapsing shrinks it down to a
     small layers-icon square anchored at its own top-right corner
     (.layer-panel-stack's align-items: flex-end keeps that corner fixed
     while the box's own width/height animate), never grows past this. */
  transition: width 0.35s ease, min-width 0.35s ease, max-width 0.35s ease, height 0.35s ease, padding 0.35s ease;
  overflow: hidden;
}
.exposure-layers-panel.exposure-layers-panel--collapsed {
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  height: 44px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.exposure-layers-collapse-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: #e2e8f0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.exposure-layers-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}
.exposure-layers-collapse-btn--collapsed {
  position: static;
  width: 100%;
  height: 100%;
  border-radius: 10px;
  background: transparent;
}
.exposure-layers-collapse-btn--collapsed:hover {
  background: rgba(255, 255, 255, 0.08);
}
.exposure-layers-arrow {
  width: 14px;
  height: 14px;
}
.exposure-layers-icon {
  width: 22px;
  height: 22px;
  fill: #4da3ff;
}
.map-layers-title { margin: 0 0 10px; font-size: .8rem; font-weight: 700; }
.exposure-layers-panel .map-layers-title { margin-right: 28px; }
.map-layer-row { margin-bottom: 8px; }
.map-layer-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.map-layer-type { margin-left: auto; font-size: .68rem; color: var(--color-text-muted,#94a3b8); }
.map-layer-opacity { width: 100%; margin-top: 4px; }
.exposure-layers-empty { margin: 0; font-size: .72rem; line-height: 1.45; color: var(--color-text-muted,#94a3b8); font-style: italic; }
.exposure-layer-row {
  padding: 6px 8px;
  border-radius: 8px;
  transition: background .15s ease;
}
.exposure-layer-row:hover { background: rgba(255,255,255,.05); }
.population-view-toggle {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}
.population-view-btn {
  flex: 1;
  font-size: .68rem;
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,.15);
  background: transparent;
  color: var(--color-text-muted,#94a3b8);
  cursor: pointer;
}
.population-view-btn.active {
  background: rgba(203, 24, 29, .25);
  border-color: rgba(203, 24, 29, .6);
  color: #fff;
}
.population-view-btn:disabled {
  opacity: .4;
  cursor: not-allowed;
}
.population-view-btn.loading {
  opacity: .8;
  animation: population-view-loading-pulse 1s ease-in-out infinite;
}
@keyframes population-view-loading-pulse {
  0%, 100% { opacity: .5; }
  50% { opacity: .9; }
}
.exposure-layer-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(255,255,255,.15);
}
.exposure-layer-name {
  font-weight: 600;
  color: #e8edf4;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exposure-layer-count {
  font-variant-numeric: tabular-nums;
  background: rgba(255,255,255,.08);
  padding: 2px 7px;
  border-radius: 10px;
  /* Fixed width instead of hugging the digit count — otherwise each row's
     badge is a different size ("115 kayıt" vs "65.010 kayıt") and, even
     though all are right-aligned via margin-left:auto, their left edges
     land at different x-positions, reading as an uneven, scattered list. */
  min-width: 72px;
  text-align: right;
  flex-shrink: 0;
}

.shelters-layer-panel {
  /* Left-hand column of .top-controls-row's 3-col grid — hugs the row's
     left edge via justify-self, doesn't position itself independently
     (the row handles clearing the sidebar). Still position:relative so
     .shelters-layer-collapse-btn (absolute) anchors to this box, not the
     grid row. */
  position: relative;
  justify-self: start;
  background: rgba(15,17,23,.9);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px;
  padding: 10px 12px;
  color: #e2e8f0;
  font-size: .8rem;
  min-width: 200px;
  /* Same collapse mechanic as .exposure-layers-panel on the right — full
     size is the ceiling, collapsing only ever shrinks toward the icon
     square, anchored at this box's own top-left corner. */
  transition: width 0.35s ease, min-width 0.35s ease, max-width 0.35s ease, height 0.35s ease, padding 0.35s ease;
  overflow: hidden;
}

.shelters-layer-panel.shelters-layer-panel--collapsed {
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  height: 44px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shelters-layer-collapse-btn {
  /* Same-row-as-title layout as .exposure-layers-collapse-btn, just mirrored
     to the left edge since this panel sits on the left side of the screen. */
  position: absolute;
  top: 6px;
  left: 6px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: #e2e8f0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.shelters-layer-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}
.shelters-layer-collapse-btn--collapsed {
  position: static;
  width: 100%;
  height: 100%;
  border-radius: 10px;
  background: transparent;
}
.shelters-layer-collapse-btn--collapsed:hover {
  background: rgba(255, 255, 255, 0.08);
}
.shelters-layer-arrow {
  width: 14px;
  height: 14px;
}
.shelters-layer-icon {
  width: 22px;
  height: 22px;
  fill: #e0453f;
}
.shelters-layer-title { margin-left: 28px; }

.shelter-marker-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.shelter-marker-icon { font-size: .85rem; line-height: 1; }
.shelter-popup-linked { margin: 6px 0 0; font-size: .75rem; color: var(--color-text-muted,#94a3b8); }

.drill-event-marker-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #f59e0b;
  box-shadow: 0 0 10px #f59e0b;
  border: 2px dashed #7c2d12;
}
.drill-event-marker-icon { font-size: .9rem; line-height: 1; }
.drill-event-badge {
  display: inline-block;
  background: #f59e0b;
  color: #1c1917;
  font-weight: 700;
  font-size: .7rem;
  letter-spacing: .05em;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 6px;
}

/* Vertical zoom control — [+] / [x N] / [−] stacked top-to-bottom, sitting
   just to the left of the download button + satellite-thumbnail column
   (same right edge minus that column's own width + a gap) so the two read
   as one aligned cluster instead of the zoom control floating alone at the
   opposite corner. Same dark semi-transparent pill used by the rest of this
   map's floating UI (matches .map-download-btn etc.) — reads fine over
   dark, satellite, or light base styles without needing per-style
   conditional colors. */
.zoom-control-bar {
  position: absolute;
  bottom: 20px; /* aligns with .layer-switcher's own bottom offset */
  right: calc(var(--map-control-offset) + 74px); /* 64px thumbnail + 10px gap */
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 40px;
  /* Matches the stacked download-btn + layer-switcher column's total height
     (64px + 12px gap + 22px) so its top edge lines up with .map-download-btn's
     top edge and its bottom edge lines up with .layer-switcher's bottom edge. */
  height: 98px;
  background: rgba(20, 24, 33, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  overflow: hidden;
}

.zoom-btn {
  background: transparent;
  border: none;
  color: #ffffff;
  width: 100%;
  height: 32px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.zoom-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}
.zoom-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.zoom-value {
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 0;
  width: 100%;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-family: 'Inter', monospace;
  white-space: nowrap;
}

/* Pitch/detail tuning sliders — sits directly above the 2B/3B button,
   widened past the 64px column since two labeled sliders don't fit that
   narrow; right-aligned to the same column edge so it still reads as part
   of the same stack rather than a floating, unrelated panel. */
.terrain-tuning-panel {
  position: absolute;
  bottom: 158px; /* .terrain-toggle-btn's bottom(126) + height(22) + 10px gap */
  right: var(--map-control-offset);
  z-index: 10;
  /* Spans exactly from .zoom-control-bar's left edge to .map-download-btn's
     right edge (both share this same right offset) — 40px zoom bar + 74px
     gap-to-column = 114px total, so the panel reads as capping that column
     instead of floating at an arbitrary width. */
  width: 114px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(20, 24, 33, 0.96);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.terrain-tuning-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.terrain-tuning-label {
  font-size: 10px;
  color: #cbd5e1;
  white-space: nowrap;
}
.terrain-tuning-slider {
  width: 100%;
  accent-color: #4da3ff;
  cursor: pointer;
}

/* 2B/3B terrain toggle — satellite view only, sits directly above the
   download button in the same right-hand control column (same 64px width),
   so the two read as one stacked group. */
.terrain-toggle-btn {
  position: absolute;
  bottom: 126px; /* .map-download-btn's bottom(96) + height(22) + 8px gap */
  right: var(--map-control-offset);
  z-index: 10;
  width: 64px;
  height: 22px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(20, 24, 33, 0.96);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transition: background 0.15s, border-color 0.15s;
}
.terrain-toggle-btn:hover {
  background: #164f7a;
  border-color: #75bfff;
}
.terrain-toggle-btn.active {
  background: rgba(77, 163, 255, 0.28);
  border-color: #4da3ff;
}
.terrain-toggle-btn:focus-visible {
  outline: 2px solid #75bfff;
  outline-offset: 2px;
}

/* Wide, short bar sitting above the satellite thumbnail (.layer-switcher):
   same 64px width, about a third of its height — reads as a header strip
   for the square below it rather than a separate floating icon. */
.map-download-btn {
  position: absolute;
  bottom: 96px;
  right: var(--map-control-offset);
  z-index: 10;
  width: 64px;
  height: 22px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid rgba(77, 163, 255, 0.65);
  background: rgba(20, 24, 33, 0.96);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transition: background 0.15s, border-color 0.15s;
}
.map-download-btn:hover {
  background: #164f7a;
  border-color: #75bfff;
}
.map-download-btn:focus-visible {
  outline: 2px solid #75bfff;
  outline-offset: 2px;
}
.map-download-icon {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.layer-switcher {
  position: absolute;
  bottom: 20px;
  right: var(--map-control-offset);
  z-index: 10;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  width: 64px;
  height: 64px;
}

.layer-preview {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 4px;
}

.preview-satellite {
  background-image: url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/4');
}

.preview-street {
  background: linear-gradient(135deg, #b8d4e8 0%, #d4e8b8 40%, #e8e8d4 70%, #c8d8e8 100%);
}

.preview-dark {
  background: linear-gradient(135deg, #1a2030 0%, #252d3a 50%, #1e2535 100%);
}

.layer-label {
  font-size: 10px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.3px;
}

/* ── Map Legend ── */
/* Positions the whole legend stack; individual .map-legend cards below are
   plain flex children (no position of their own) so they line up side-by-
   side here on wide screens, wrapping to stack above on narrow ones (see
   this class's media-query override further down). The heatmap/severity
   card is always first in the DOM and stays put at the left edge (user
   preference, 2026-08-05: it's the one legend that's always present, so it
   anchors the group); any exposure-layer legend added on top of it appears
   to its RIGHT, in DOM/toggle order. align-items: stretch keeps every card
   the same height (top AND bottom edges level) instead of only matching
   bottoms — was flex-end, which let a taller exposure legend hang above a
   shorter severity card with mismatched tops. */
.map-legend-group {
  position: fixed;
  bottom: 38px;
  left: calc(var(--sidebar-width, 280px) + 12px);
  transition: left 0.35s ease;
  z-index: 10;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 10px;
  max-width: calc(100vw - var(--sidebar-width, 280px) - 24px);
}

.map-legend-group.legend-sidebar-collapsed {
  left: calc(var(--sidebar-collapsed, 56px) + 12px);
  max-width: calc(100vw - var(--sidebar-collapsed, 56px) - 24px);
}

.map-legend {
  background: rgba(20, 24, 33, 0.82);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
  min-width: 110px;
  pointer-events: none;
}

.marker-truncation-note {
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.68rem;
  line-height: 1.35;
  color: var(--color-text-muted, #94a3b8);
  max-width: 190px;
}

.legend-title {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 6px;
}

.legend-gradient {
  width: 100%;
  height: 10px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.heat-gradient {
  background: linear-gradient(to right, #90a4ae, #00e676, #ffd600, #ff9100, #ff1744);
}

.legend-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.5);
}

.legend-severity-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sev-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.8);
}

.sev-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.exposure-legend {
  max-width: 190px;
}

.exposure-legend-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exposure-legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.exposure-legend-swatch {
  width: 14px;
  height: 9px;
  border-radius: 2px;
  flex-shrink: 0;
}

.exposure-legend-range {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Country hover label: follows the cursor, offset to its right ── */
.country-hover-label {
  position: absolute;
  transform: translateY(-50%);
  background: rgba(20, 24, 33, 0.88);
  color: #e8ecf0;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 20px;
  border: 1px solid rgba(74, 222, 128, 0.35);
  pointer-events: none;
  backdrop-filter: blur(6px);
  white-space: nowrap;
  z-index: 20;
}

.hover-label-enter-active,
.hover-label-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.hover-label-enter-from,
.hover-label-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(4px);
}

/* ── Collapsed shelters/exposure-layers panel hint: simulates a hover for a
   few seconds right after a double-click zoom (see zoomToCountry's
   map.once('moveend', ...)), same look/motion as .country-hover-label.
   Teleported to <body> (see the template) and positioned with real
   getBoundingClientRect() coordinates via inline top/left|right — position
   is therefore fixed, not relative to any ancestor. ── */
.collapsed-panel-hint {
  position: fixed;
  transform: translateY(-50%);
  background: rgba(20, 24, 33, 0.92);
  color: #e8ecf0;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 20px;
  border: 1px solid rgba(74, 222, 128, 0.35);
  pointer-events: none;
  backdrop-filter: blur(6px);
  white-space: nowrap;
  z-index: 1200;
}

/* ── Selected country badge ── */
.country-badge {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--glass-bg);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  padding: 8px 14px 8px 18px;
  border-radius: 100px;
  border: 1px solid var(--glass-border);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06),
    inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1000;
  cursor: default;
  animation: badgeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: auto;
}

@keyframes badgeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

.country-badge-name {
  font-family: var(--font-primary);
  font-weight: 700;
  font-size: 0.9rem;
  color: #4ade80;
  letter-spacing: -0.01em;
  text-shadow: 0 0 12px rgba(74, 222, 128, 0.3);
}

.country-badge-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-secondary);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.country-badge-close:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
  transform: rotate(90deg);
}

.country-badge-enter-active,
.country-badge-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.country-badge-enter-from,
.country-badge-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* Impact Analysis (spec 008): split-view side panel dock */
.impact-panel-dock {
  position: absolute;
  top: 0;
  right: 0;
  width: var(--impact-panel-width);
  height: 100%;
  z-index: 15;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  transition: width 0.22s ease;
}

.impact-panel-dock.collapsed {
  background: rgba(15, 17, 23, 0.64);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

/* Persistent header — present regardless of which dock-face is flipped up,
   so the collapse toggle (nested inside, see .panel-collapse-toggle-slot
   below) always has the same real menu bar to anchor to. Same idea as
   .sidebar-header in SidebarPanel.vue. */
.dock-header {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  /* This panel's content (a single title line) is shorter than
     .sidebar-header's (icon + title + subtitle), so matching padding alone
     undershot — 36px verified live (DevTools) to land the two collapse
     toggles at the same height. Keep in sync with SidebarPanel.vue if
     either header's content changes. */
  padding: 36px 16px;
  background: rgba(15, 17, 23, 0.92);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.dock-header-title {
  font-size: 0.95rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.impact-panel-dock.collapsed .dock-header-title,
.impact-panel-dock.collapsed .dock-header-close {
  display: none;
}

/* Anchored to .dock-header's own bottom-left corner (top:100%/right:100%,
   both relative to the header, then centered on that point) — a genuine
   CSS child of the menu it sits next to, mirroring how
   .panel-collapse-toggle-slot in SidebarPanel.vue anchors to
   .sidebar-header. */
.panel-collapse-toggle-slot {
  position: absolute;
  top: 100%;
  right: 100%;
  z-index: 2;
  transform: translate(50%, -50%);
}

/* Card-flip between Impact Analysis (front) and Settings (back). Both faces
   stay mounted the whole time — only the 3D transform + backface-visibility
   decide which one is interactive/visible, so the flip animation always has
   real content to show mid-rotation instead of a blank face. */
.dock-flip {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  perspective: 1800px;
}

.dock-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  transform: rotateY(0deg);
  pointer-events: auto;
}

.dock-face-back {
  transform: rotateY(180deg);
  /* backface-visibility hides the render but isn't reliable for hit-testing
     across browsers, so pointer-events is set explicitly on both faces. */
  pointer-events: none;
}

.dock-flip.flipped .dock-face-front {
  transform: rotateY(-180deg);
  pointer-events: none;
}

.dock-flip.flipped .dock-face-back {
  transform: rotateY(0deg);
  pointer-events: auto;
}

@media (max-width: 900px) {
  .map-view-wrapper {
    --impact-panel-width: min(320px, 42vw);
    --map-control-offset: calc(var(--impact-panel-width) + 12px);
  }

  .map-layers-panel {
    max-width: 220px;
  }
}

@media (max-width: 768px) {
  .map-view-wrapper {
    --impact-panel-width: 0px;
    --map-control-offset: 10px;
    --impact-panel-mobile-height: 34vh;
  }

  .map-view-wrapper.impact-panel-collapsed {
    --impact-panel-mobile-height: 52px;
  }

  .impact-panel-dock {
    top: auto;
    left: 0;
    width: 100%;
    height: var(--impact-panel-mobile-height);
    min-height: 220px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .impact-panel-dock.collapsed {
    min-height: 52px;
  }

  .panel-collapse-toggle-slot {
    top: -18px;
    left: 50%;
    right: auto;
    margin-right: 0;
    transform: translateX(-50%) rotate(90deg);
  }

  .impact-panel-dock.collapsed .panel-collapse-toggle-slot {
    left: 50%;
  }

  .zoom-control-bar {
    bottom: calc(var(--impact-panel-mobile-height) + 16px);
  }

  .layer-switcher {
    bottom: calc(var(--impact-panel-mobile-height) + 100px);
  }

  .map-download-btn {
    bottom: calc(var(--impact-panel-mobile-height) + 176px);
  }

  .terrain-toggle-btn {
    bottom: calc(var(--impact-panel-mobile-height) + 206px);
  }

  .terrain-tuning-panel {
    bottom: calc(var(--impact-panel-mobile-height) + 238px);
  }

  .country-badge {
    bottom: calc(var(--impact-panel-mobile-height, 0px) + 16px);
  }

  /* The sidebar is a bottom sheet here, not a left rail — --sidebar-width
     doesn't apply, so the calc()-based offset would push these toward the
     right edge (or off narrow screens) for no reason. Pin near the left
     edge regardless of the (desktop-only) collapsed state. Also switch from
     the desktop row-reverse (legends side-by-side to the right) to a
     column-reverse stack (legends ABOVE each other) — a phone-width screen
     has no spare width for a second card next to the severity legend, but
     there's headroom above it. */
  .map-legend-group,
  .map-legend-group.legend-sidebar-collapsed {
    left: 12px;
    max-width: calc(100vw - 24px);
    flex-direction: column-reverse;
    align-items: flex-start;
  }

  /* The 3-column grid (shelters | search | exposure layers) has no room to
     stay side-by-side on a phone-width screen — stack them into one column,
     each full width, instead of squeezing three columns unreadably thin. */
  .top-controls-row,
  .top-controls-row.legend-sidebar-collapsed {
    left: 12px;
    right: 12px;
    grid-template-columns: 1fr;
  }

  .shelters-layer-panel,
  .layer-panel-stack {
    justify-self: stretch;
  }
}
</style>

<style>
/* Modern MapLibre Popup overrides */
/* Bring-to-front feedback (see initMap()'s mousedown listener) — a quick
   shadow pulse so raising a popup above its siblings reads as a deliberate
   "this one's now on top" motion, not just an instant z-index snap.
   Deliberately filter-only, NOT transform: MapLibre itself sets this same
   element's inline `transform` on every render to pin it to its geo-anchor
   (including the popup's very first placement) — transitioning `transform`
   here meant every popup open, and every marker-rebuild-triggered re-open,
   animated smoothly from whatever transform value happened to be on the
   element beforehand (often an off-screen one) to its real position,
   reading as the popup "flying in from the left" and, when a rebuild fired
   twice in quick succession, as if it arrived twice (live-testing finding,
   2026-07-30). */
.modern-popup-container {
  transition: filter 0.15s ease;
}
.modern-popup-container.popup-brought-to-front {
  filter: drop-shadow(0 10px 28px rgba(0, 0, 0, 0.55));
}
.modern-popup-container .maplibregl-popup-content {
  background: transparent !important;
  padding: 0 !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 8px;
}

.modern-popup-container .maplibregl-popup-tip {
  border-top-color: var(--severity-color, #13161c) !important;
  border-bottom-color: var(--severity-color, #13161c) !important;
  opacity: 0.8;
  z-index: 10;
  position: relative;
}

/* Our own close button (see POPUP_CLOSE_BTN_HTML) — a child of each popup's
   own card element, not MapLibre's built-in .maplibregl-popup-close-button.
   Same look everywhere: a plain circular glyph, inset enough (12px) to
   clear the card's own border-radius instead of sitting flush in the
   corner where the curve clips it. */
.popup-close-x {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 22px;
  height: 22px;
  padding: 0;
  color: #ffffff;
  font-size: 15px;
  font-weight: 400;
  line-height: 1;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  transition: background 0.15s ease, color 0.15s ease;
  z-index: 100;
  border: none;
  cursor: pointer;
}

.popup-close-x:hover {
  background: rgba(255, 255, 255, 0.24);
  color: #ffffff;
}

.disaster-marker {
  background: none !important;
  border: none !important;
}

.marker-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.marker-icon {
  font-size: 10px;
}

.marker-pulse .marker-dot::after {
  content: '';
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid currentColor;
  animation: marker-pulse-ring 2s ease-out infinite;
}

@keyframes marker-pulse-ring {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}

/* Redesigned Card */
.disaster-popup-modern {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: 'Inter', 'Segoe UI', sans-serif;
  color: #fff;
  min-width: 270px;
  max-width: 320px;
  background: #11141a;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--severity-color);
  box-shadow:
    inset 0 0 24px var(--severity-rgba),
    0 8px 32px rgba(0, 0, 0, 0.6);
  position: relative;
  z-index: 20;
}

.popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 34px; /* clears the close button (12px inset + 22px wide) */
}

.chip {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.type-chip {
  font-weight: 800;
}

/* Bespoke building_footprints (density) popup card — see
   exposureFeaturePopup.js's own header comment for why this one gets a
   hand-built card instead of the fully generic one. */
.facility-popup-icon {
  font-size: 20px;
  line-height: 1;
}

.density-popup-body {
  align-items: center;
  text-align: center;
  padding: 4px 0;
}

.density-popup-count {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
}

.density-popup-label {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}

.severity-chip {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
}

.source-chip {
  background: rgba(255, 255, 255, 0.1);
  color: #c4c4c4;
  border-radius: 12px;
  padding: 3px 8px;
  font-size: 9px;
  font-weight: 600;
}

.popup-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* These three don't carry their own card background/border/padding like
   .disaster-popup-modern does, but they still need position:relative so the
   custom close button (a child of each) anchors to their own box, not
   MapLibre's outer .maplibregl-popup-content (see POPUP_CLOSE_BTN_HTML's
   own comment for why that ambiguity mattered). */
.shelter-popup-modern,
.drill-event-popup-modern,
.community-report-popup-modern,
.hex-popup {
  position: relative;
  padding-right: 30px;
}

.popup-title {
  font-size: 13.5px;
  font-weight: 600;
  margin: 0;
  color: #ffffff;
  line-height: 1.4;
  letter-spacing: 0.2px;
}

.popup-desc {
  font-size: 12px;
  color: #b0bac5;
  margin: 0;
  line-height: 1.45;
}

.exposure-popup-empty {
  font-style: italic;
}

.popup-halo-disclaimer {
  font-size: 10.5px;
  color: #f59e0b;
  font-style: italic;
  margin: 6px 0 0;
  line-height: 1.4;
}

.popup-metrics {
  display: flex;
  flex-wrap: wrap;
  column-gap: 14px;
  row-gap: 8px;
  font-size: 11px;
  color: #a0aaba;
  background: rgba(0, 0, 0, 0.25);
  padding: 8px 10px;
  border-radius: 6px;
  margin-top: 4px;
}

.popup-metrics span b {
  color: #e2e8f0;
  font-weight: 600;
}

.popup-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 10px;
  margin-top: 4px;
}

.popup-date {
  font-size: 11px;
  color: #8c97a8;
  font-weight: 500;
}

/* Wraps one badge per agency that independently reported the same event
   (e.g. "AFAD M1.2 · EMSC M1.2 · Kandilli M1.2") — plain .chip.source-chip
   styling per badge, just laid out to wrap instead of the single fixed
   chip this footer used to hold. */
.source-chip-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  max-width: 60%;
}

html[data-theme='light'] .disaster-popup-modern {
  background: #ffffff;
  color: #111a2c;
  box-shadow:
    inset 0 0 24px var(--severity-rgba),
    0 8px 32px rgba(0, 0, 0, 0.15);
}

html[data-theme='light'] .popup-close-x {
  color: #111a2c;
  background: rgba(0, 0, 0, 0.06);
}
html[data-theme='light'] .popup-close-x:hover {
  background: rgba(0, 0, 0, 0.12);
  color: #111a2c;
}

html[data-theme='light'] .popup-title {
  color: #111a2c;
}

html[data-theme='light'] .popup-desc,
html[data-theme='light'] .popup-date {
  color: #4a5568;
}

html[data-theme='light'] .popup-metrics {
  background: rgba(0, 0, 0, 0.03);
  color: #334155;
}

html[data-theme='light'] .popup-metrics span b {
  color: #0f172a;
}

html[data-theme='light'] .popup-footer {
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

html[data-theme='light'] .source-chip {
  background: rgba(0, 0, 0, 0.05);
  color: #475569;
}
</style>
