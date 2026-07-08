<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'
import countries from '@/configs/countries.json'
import { COUNTRY_NAMES } from '@/data/countryNames.js'
import { loadRegionBoundaries } from '@/data/boundaries/index.js'

const { t } = useI18n()
const emit = defineEmits(['location-selected'])

const query = ref('')
const searching = ref(false)
const error = ref(null)
const noResults = ref(false)
const suggestions = ref([])
const open = ref(false)
const activeIndex = ref(-1)

const LOCAL_REGION_COUNTRIES = ['tr', 'my']
const COUNTRY_ALIASES = {
  tr: ['turkiye', 'turkey', 'turkiye cumhuriyeti', 'türkiye'],
  de: ['germany', 'deutschland', 'almanya', 'alamanya', 'alemanya'],
  us: ['usa', 'united states', 'america', 'abd', 'amerika'],
  gb: ['uk', 'united kingdom', 'britain', 'ingiltere'],
}

const LOCAL_PLACE_ALIASES = [
  {
    aliases: ['madrid', 'madrit'],
    label: 'Madrid, Spain',
    lat: 40.4168,
    lng: -3.7038,
    zoom: 10,
    countryCode: 'es',
  },
  {
    aliases: ['london', 'londra'],
    label: 'London, United Kingdom',
    lat: 51.5072,
    lng: -0.1276,
    zoom: 10,
    countryCode: 'gb',
  },
  {
    aliases: ['cairo', 'kahire', 'al qahirah', 'el qahira'],
    label: 'Cairo, Egypt',
    lat: 30.0444,
    lng: 31.2357,
    zoom: 10,
    countryCode: 'eg',
  },
  {
    aliases: ['hesse', 'hessen'],
    label: 'Hesse, Germany',
    lat: 50.65,
    lng: 9.16,
    zoom: 7,
    countryCode: 'de',
  },
]

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function parseCoordinateQuery(value) {
  const match = String(value)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng, label: `${lat}, ${lng}`, zoom: 10, source: 'coordinates' }
}

function countryResult(code, config) {
  return {
    lat: config.centerLat,
    lng: config.centerLng,
    label: config.nameEn,
    zoom: config.defaultZoom || 5,
    source: 'local-country',
    countryCode: code,
  }
}

function matchesCandidate(term, candidate, partial) {
  const normalized = normalizeSearchText(candidate)
  if (!normalized) return false
  return partial ? normalized.includes(term) || term.includes(normalized) : normalized === term
}

// Unlike a single "find the first match" lookup, these collect every partial
// match so the dropdown can offer a real choice (e.g. typing "tur" shouldn't
// silently commit to one interpretation of several possible countries/places).
function collectLocalCountries(term) {
  const results = []
  for (const [code, config] of Object.entries(countries)) {
    const candidates = [
      code,
      config.nameEn,
      COUNTRY_NAMES[config.numericCode],
      ...(COUNTRY_ALIASES[code] || []),
    ]
    if (candidates.some((candidate) => matchesCandidate(term, candidate, true))) {
      results.push(countryResult(code, config))
    }
  }
  return results
}

function collectLocalPlaces(term) {
  return LOCAL_PLACE_ALIASES.filter((item) => item.aliases.some((alias) => matchesCandidate(term, alias, true))).map(
    (place) => ({
      lat: place.lat,
      lng: place.lng,
      label: place.label,
      zoom: place.zoom,
      source: 'local-place',
      countryCode: place.countryCode,
    }),
  )
}

function geometryCenter(geometry) {
  const pairs = []
  const collect = (coordinates) => {
    if (!Array.isArray(coordinates)) return
    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      pairs.push(coordinates)
      return
    }
    coordinates.forEach(collect)
  }
  collect(geometry?.coordinates)
  if (!pairs.length) return null
  const bounds = pairs.reduce(
    (acc, [lng, lat]) => ({
      minLng: Math.min(acc.minLng, lng),
      maxLng: Math.max(acc.maxLng, lng),
      minLat: Math.min(acc.minLat, lat),
      maxLat: Math.max(acc.maxLat, lat),
    }),
    { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity },
  )
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  }
}

async function collectLocalRegions(term, limit) {
  const results = []
  for (const countryCode of LOCAL_REGION_COUNTRIES) {
    if (results.length >= limit) break
    let boundary = null
    try {
      boundary = await loadRegionBoundaries(countryCode)
    } catch {
      continue
    }
    const matches =
      boundary?.featureCollection?.features?.filter((feature) =>
        matchesCandidate(term, feature.properties?.[boundary.nameProperty], true),
      ) ?? []
    for (const feature of matches) {
      if (results.length >= limit) break
      const center = geometryCenter(feature.geometry)
      if (!center) continue
      results.push({
        ...center,
        label: feature.properties[boundary.nameProperty],
        zoom: 8,
        source: 'local-region',
        countryCode,
      })
    }
  }
  return results
}

function dedupeSuggestions(list) {
  const seen = new Set()
  const out = []
  for (const item of list) {
    const key = `${item.label}|${item.lat?.toFixed(2)}|${item.lng?.toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

// Bumped on every new search; a response is only applied if it's still the
// latest one in flight — guards against a slow, superseded request
// overwriting the dropdown with stale results (no AbortController needed).
let requestSeq = 0

async function fetchSuggestions(rawTerm) {
  const seq = ++requestSeq
  const trimmed = rawTerm.trim()
  if (!trimmed) {
    suggestions.value = []
    open.value = false
    noResults.value = false
    error.value = null
    searching.value = false
    return
  }

  searching.value = true
  error.value = null
  noResults.value = false

  const coord = parseCoordinateQuery(trimmed)
  const term = normalizeSearchText(trimmed)

  const local = coord
    ? [coord]
    : [...collectLocalCountries(term), ...collectLocalPlaces(term), ...(await collectLocalRegions(term, 5))]

  if (seq !== requestSeq) return

  let remote = []
  let remoteError = null
  if (!coord) {
    const { data, error: invokeError } = await supabase.functions.invoke('geocode-search', {
      body: { query: trimmed },
    })
    if (seq !== requestSeq) return
    if (invokeError || data?.error) {
      remoteError = data?.error || invokeError?.message || t('impact.geocoding.error')
    } else {
      // Trust the configured provider's own results directly rather than
      // second-guessing them against the raw query text — that filter used
      // to silently discard genuinely correct results whenever the query
      // wording didn't literally appear in the returned label.
      remote = (data?.results || []).map((r) => ({ ...r, source: 'provider' }))
    }
  }

  const merged = dedupeSuggestions([...local, ...remote]).slice(0, 8)
  suggestions.value = merged
  open.value = merged.length > 0
  noResults.value = merged.length === 0 && !remoteError
  error.value = merged.length === 0 ? remoteError : null
  searching.value = false
  activeIndex.value = merged.length ? 0 : -1
}

let debounceTimer = null
watch(query, (value) => {
  clearTimeout(debounceTimer)
  if (!value.trim()) {
    suggestions.value = []
    open.value = false
    noResults.value = false
    error.value = null
    return
  }
  debounceTimer = setTimeout(() => fetchSuggestions(value), 300)
})

function selectSuggestion(item) {
  query.value = item.label
  open.value = false
  suggestions.value = []
  emit('location-selected', item)
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (suggestions.value.length) activeIndex.value = (activeIndex.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (suggestions.value.length) {
      activeIndex.value = (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    clearTimeout(debounceTimer)
    if (open.value && activeIndex.value >= 0 && suggestions.value[activeIndex.value]) {
      selectSuggestion(suggestions.value[activeIndex.value])
    } else {
      fetchSuggestions(query.value)
    }
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

function onFocus() {
  if (suggestions.value.length) open.value = true
}

function onBlur() {
  // Delayed so a click/mousedown on a suggestion below still registers
  // before the dropdown closes.
  setTimeout(() => {
    open.value = false
  }, 150)
}

function clearQuery() {
  clearTimeout(debounceTimer)
  requestSeq++
  query.value = ''
  suggestions.value = []
  open.value = false
  noResults.value = false
  error.value = null
  searching.value = false
}
</script>

<template>
  <div class="geocoding-search">
    <div class="geocoding-row">
      <div class="geocoding-input-wrap">
        <input
          v-model="query"
          class="geocoding-input"
          :placeholder="t('impact.geocoding.placeholder')"
          :aria-label="t('impact.geocoding.label')"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="open"
          @keydown="onKeydown"
          @focus="onFocus"
          @blur="onBlur"
        />
        <button
          v-if="query"
          type="button"
          class="geocoding-clear"
          :aria-label="t('impact.geocoding.clear')"
          @mousedown.prevent="clearQuery"
        >
          ✕
        </button>
        <ul v-if="open && suggestions.length" class="geocoding-suggestions" role="listbox">
          <li
            v-for="(item, index) in suggestions"
            :key="`${item.label}-${item.lat}-${item.lng}`"
            role="option"
            :aria-selected="index === activeIndex"
            class="geocoding-suggestion"
            :class="{ 'geocoding-suggestion--active': index === activeIndex }"
            @mousedown.prevent="selectSuggestion(item)"
            @mouseenter="activeIndex = index"
          >
            {{ item.label }}
          </li>
        </ul>
      </div>
      <button class="geocoding-btn" :disabled="searching" @click="fetchSuggestions(query)">
        {{ searching ? t('impact.geocoding.searching') : t('impact.geocoding.search') }}
      </button>
    </div>
    <p class="geocoding-help">{{ t('impact.geocoding.help') }}</p>
    <p v-if="noResults" class="geocoding-notice">{{ t('impact.geocoding.noResults') }}</p>
    <p v-if="error" class="geocoding-notice geocoding-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.geocoding-search {
  position: absolute; top: 82px; left: 50%; transform: translateX(-50%);
  z-index: 20; display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.geocoding-row { display: flex; }
.geocoding-input-wrap { position: relative; width: 280px; }
.geocoding-input {
  width: 100%; padding: 8px 30px 8px 14px; border-radius: 20px 0 0 20px;
  border: 1px solid rgba(255,255,255,.2); background: rgba(15,17,23,.85);
  color: #e2e8f0; font-size: .85rem; box-sizing: border-box;
}
.geocoding-clear {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  border: none; background: none; color: #94a3b8; cursor: pointer;
  font-size: .8rem; line-height: 1; padding: 4px;
}
.geocoding-clear:hover { color: #e2e8f0; }
.geocoding-suggestions {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  background: rgba(15,17,23,.96); border: 1px solid rgba(255,255,255,.15);
  border-radius: 10px; list-style: none; margin: 0; padding: 4px;
  max-height: 260px; overflow-y: auto; z-index: 30;
}
.geocoding-suggestion {
  padding: 7px 10px; border-radius: 6px; font-size: .8rem; color: #e2e8f0;
  cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.geocoding-suggestion--active,
.geocoding-suggestion:hover { background: rgba(77,163,255,.2); }
.geocoding-btn {
  padding: 8px 16px; border-radius: 0 20px 20px 0; border: 1px solid rgba(255,255,255,.2);
  border-left: none; background: rgba(77,163,255,.25); color: #4da3ff; font-size: .8rem;
  font-weight: 600; cursor: pointer;
}
.geocoding-btn:disabled { opacity: .5; cursor: not-allowed; }
.geocoding-notice {
  background: rgba(15,17,23,.9); padding: 4px 12px; border-radius: 8px;
  font-size: .75rem; color: #94a3b8; margin: 0;
}
.geocoding-help {
  background: rgba(15,17,23,.72); padding: 4px 10px; border-radius: 8px;
  font-size: .7rem; color: #94a3b8; margin: 0;
}
.geocoding-error { color: #ef4444; }

@media (max-width: 768px) {
  .geocoding-search {
    top: 112px;
    left: var(--space-sm);
    right: var(--space-sm);
    transform: none;
    align-items: stretch;
  }

  .geocoding-row {
    width: 100%;
  }

  .geocoding-input-wrap {
    width: 100%;
    min-width: 0;
  }

  .geocoding-help,
  .geocoding-notice {
    text-align: center;
  }
}
</style>
