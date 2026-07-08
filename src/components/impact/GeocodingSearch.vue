<script setup>
import { ref } from 'vue'
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

const LOCAL_REGION_COUNTRIES = ['tr', 'my']
const COUNTRY_ALIASES = {
  tr: ['turkiye', 'turkey', 'turkiye cumhuriyeti', 'türkiye'],
  us: ['usa', 'united states', 'america', 'abd', 'amerika'],
  gb: ['uk', 'united kingdom', 'britain', 'ingiltere'],
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

function findLocalCountry(term, partial = false) {
  const codeMatch = countries[term]
  if (codeMatch) return countryResult(term, codeMatch)

  for (const [code, config] of Object.entries(countries)) {
    const candidates = [
      code,
      config.nameEn,
      COUNTRY_NAMES[config.numericCode],
      ...(COUNTRY_ALIASES[code] || []),
    ]
    if (candidates.some((candidate) => matchesCandidate(term, candidate, partial))) {
      return countryResult(code, config)
    }
  }
  return null
}

function collectLngLatPairs(coordinates, pairs = []) {
  if (!Array.isArray(coordinates)) return pairs
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    pairs.push(coordinates)
    return pairs
  }
  coordinates.forEach((item) => collectLngLatPairs(item, pairs))
  return pairs
}

function geometryCenter(geometry) {
  const pairs = collectLngLatPairs(geometry?.coordinates)
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

async function findLocalRegion(term, partial = false) {
  for (const countryCode of LOCAL_REGION_COUNTRIES) {
    let boundary = null
    try {
      boundary = await loadRegionBoundaries(countryCode)
    } catch {
      continue
    }
    const feature = boundary?.featureCollection?.features?.find((item) =>
      matchesCandidate(term, item.properties?.[boundary.nameProperty], partial),
    )
    if (!feature) continue
    const center = geometryCenter(feature.geometry)
    if (!center) continue
    return {
      ...center,
      label: feature.properties[boundary.nameProperty],
      zoom: 8,
      source: 'local-region',
      countryCode,
    }
  }
  return null
}

async function findLocalLocation(rawQuery, partial = false) {
  const coordinates = parseCoordinateQuery(rawQuery)
  if (coordinates) return coordinates

  const term = normalizeSearchText(rawQuery)
  if (!term) return null
  return findLocalCountry(term, partial) || (await findLocalRegion(term, partial))
}

async function search() {
  if (!query.value.trim()) return
  searching.value = true
  error.value = null
  noResults.value = false

  const exactLocalResult = await findLocalLocation(query.value, false)
  if (exactLocalResult) {
    searching.value = false
    emit('location-selected', exactLocalResult)
    return
  }

  const { data, error: invokeError } = await supabase.functions.invoke('geocode-search', {
    body: { query: query.value.trim() },
  })
  searching.value = false
  if (!invokeError && !data?.error) {
    const results = data?.results || []
    if (results.length > 0) {
      emit('location-selected', results[0])
      return
    }
  }

  const localResult = await findLocalLocation(query.value, true)
  if (localResult) {
    emit('location-selected', localResult)
    return
  }

  if (invokeError || data?.error) {
    error.value = data?.error || invokeError?.message || t('impact.geocoding.error')
  } else {
    noResults.value = true
  }
}
</script>

<template>
  <div class="geocoding-search">
    <div class="geocoding-row">
      <input
        v-model="query"
        class="geocoding-input"
        :placeholder="t('impact.geocoding.placeholder')"
        :aria-label="t('impact.geocoding.label')"
        @keyup.enter="search"
      />
      <button class="geocoding-btn" :disabled="searching" @click="search">
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
.geocoding-input {
  width: 280px; padding: 8px 14px; border-radius: 20px 0 0 20px;
  border: 1px solid rgba(255,255,255,.2); background: rgba(15,17,23,.85);
  color: #e2e8f0; font-size: .85rem;
}
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

  .geocoding-input {
    width: 100%;
    min-width: 0;
  }

  .geocoding-help,
  .geocoding-notice {
    text-align: center;
  }
}
</style>
