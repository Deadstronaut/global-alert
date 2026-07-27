<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSheltersStore, occupancyPercentage } from '@/stores/shelters.js'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'
import { loadRegionBoundaries } from '@/data/boundaries/index.js'
import { buildRegionIndex, findRegionNameForPoint } from '@/utils/geoPointInPolygon.js'
import ShelterFormModal from './ShelterFormModal.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'

const { t } = useI18n()
const router = useRouter()
const store = useSheltersStore()
const auth = useAuthStore()

// The 12k+ row fetch (see stores/shelters.js's pagination) can take a
// several-second, visibly-blank moment — a full-screen overlay makes that
// wait legible instead of the page just sitting there looking broken.
// ESC is the only way out while it's up (ShelterInfoView.vue's page
// wrapper is the actual "leave" affordance otherwise); it navigates back to
// the map rather than actually aborting the in-flight fetch, since Supabase
// JS has no cheap abort handle wired up here.
function handleCancelLoading() {
  router.push('/')
}

const showForm = ref(false)
const editingShelter = ref(null)
const formError = ref(null)

// FR-006/FR-007: write access is role-based (not spec 018's capability-grant
// system, per research.md Decision 5) — country_admin/org_admin are further
// scoped to their own country by RLS itself, this is only the UI-level
// convenience gate.
const canManage = computed(() =>
  auth.isSuperAdmin || auth.session?.role === 'country_admin' || auth.session?.role === 'org_admin',
)

// FR-008: a viewer (or any account without manage access) only ever sees
// active shelters — inactive/deactivated ones are an admin-management
// concern, not part of the public "current shelter availability" view.
// Admins with write access see both (to be able to reactivate).
const visibleShelters = computed(() =>
  canManage.value ? store.shelters : store.shelters.filter((s) => s.is_active),
)

// T018: resolve linked_incident_id -> title for display, via a simple
// lookup fetched alongside the shelter list (no dedicated incidents store
// exists in this project — IncidentsView.vue queries Supabase directly too).
const incidentTitles = ref({})

async function loadIncidentTitles() {
  const { data } = await supabase.from('incidents').select('id, title')
  incidentTitles.value = Object.fromEntries((data ?? []).map((i) => [i.id, i.title]))
}

// Shelters only carry lat/lng + country_code (20260707230000_shelters.sql
// has no il/ilçe column) — the OSM import that populated most of these rows
// never had that info either. Rather than a schema change, we reuse the
// same admin-boundary polygons spec 046 already bundles for population
// aggregation (src/data/boundaries) to reverse-geocode each shelter's point
// into its containing province/district, entirely client-side.
// shelter.id -> { province: string|null, district: string|null }
const regionNames = ref({})
// country_code (lowercase) -> { province: index|null, district: index|null }
const regionIndexCache = {}

async function regionIndexFor(countryCode) {
  if (regionIndexCache[countryCode]) return regionIndexCache[countryCode]
  const [provinceBoundary, districtBoundary] = await Promise.all([
    loadRegionBoundaries(countryCode, 'province'),
    loadRegionBoundaries(countryCode, 'district'),
  ])
  const index = {
    province: provinceBoundary
      ? buildRegionIndex(provinceBoundary.featureCollection, provinceBoundary.nameProperty)
      : null,
    district: districtBoundary
      ? buildRegionIndex(districtBoundary.featureCollection, districtBoundary.nameProperty)
      : null,
  }
  regionIndexCache[countryCode] = index
  return index
}

// Only resolves shelters not already in regionNames, so calling this again
// after adding/editing one shelter (see handleSave) stays cheap regardless
// of how many hundreds are already resolved.
async function computeRegionNames() {
  const pending = visibleShelters.value.filter(
    (s) => !(s.id in regionNames.value) && Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.country_code,
  )
  if (!pending.length) return

  const countryCodes = [...new Set(pending.map((s) => s.country_code.toLowerCase()))]
  await Promise.all(countryCodes.map((cc) => regionIndexFor(cc)))

  const next = { ...regionNames.value }
  for (const s of pending) {
    const index = regionIndexCache[s.country_code.toLowerCase()]
    const point = [s.lng, s.lat]
    next[s.id] = {
      province: index?.province ? findRegionNameForPoint(point, index.province) : null,
      district: index?.district ? findRegionNameForPoint(point, index.district) : null,
    }
  }
  regionNames.value = next
}

onMounted(async () => {
  await store.fetchShelters()
  loadIncidentTitles()
  computeRegionNames()
})

// ── Sortable columns ─────────────────────────────────────────────────────
// Click a header to sort by that column (ascending); click the same header
// again to reverse. Text columns (name/country/province/district/status)
// sort with Turkish collation so "İl"/"İlçe" order the way a Turkish user
// expects (e.g. clicking İlçe orders Ankara's before Bursa's, not by byte
// value); capacity/occupancy sort numerically.
const sortColumn = ref(null)
const sortDirection = ref('asc')

function setSort(column) {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

function sortIndicator(column) {
  if (sortColumn.value !== column) return ''
  return sortDirection.value === 'asc' ? ' ▲' : ' ▼'
}

function sortValueFor(s, column) {
  switch (column) {
    case 'name':
      return s.name ?? ''
    case 'country':
      return s.country_code ?? ''
    case 'province':
      return regionNames.value[s.id]?.province ?? ''
    case 'district':
      return regionNames.value[s.id]?.district ?? ''
    case 'capacity':
      return s.capacity_total ?? 0
    case 'occupancy':
      return occupancyPercentage(s)
    case 'status':
      return s.status ?? ''
    case 'confidence':
      return s.confidence_level ?? 5
    case 'incident':
      return s.linked_incident_id ? incidentTitles.value[s.linked_incident_id] || '' : ''
    default:
      return ''
  }
}

// ── Excel-style column filters ───────────────────────────────────────────
// A dropdown per filterable column listing every distinct value present
// (checkboxes, like Excel's AutoFilter) — check/uncheck to narrow the
// table. Numeric/free-text columns (capacity, occupancy %, name, linked
// incident) are sortable but not filterable here — a checkbox list isn't
// practical for a near-unique value per row.
const FILTERABLE_COLUMNS = ['country', 'province', 'district', 'status', 'confidence']

// column -> Set of selected raw values. Column absent (or an empty Set) =
// no filter applied for that column, i.e. "show everything".
const columnFilters = ref({})
const openFilterColumn = ref(null)
const filterSearchText = ref('')

function filterLabelFor(column, value) {
  if (column === 'status') return t(`shelters.statusOptions.${value}`)
  if (column === 'confidence') return t(`shelters.confidenceLevels.${value}`)
  if (value === '') return '—'
  if (column === 'country') return String(value).toUpperCase()
  return String(value)
}

// Options are computed from visibleShelters (role-gated, but NOT yet
// narrowed by other active column filters) — matches simple AutoFilter
// behavior: the list of choices for a column doesn't shrink just because
// you filtered a different column, so switching filters never hides an
// option you already picked.
function optionsFor(column) {
  const values = new Set()
  for (const s of visibleShelters.value) values.add(sortValueFor(s, column))
  return [...values].sort((a, b) => String(a).localeCompare(String(b), 'tr'))
}

const filterDropdownOptions = computed(() => {
  if (!openFilterColumn.value) return []
  const column = openFilterColumn.value
  const search = filterSearchText.value.trim().toLowerCase()
  return optionsFor(column)
    .map((value) => ({ value, label: filterLabelFor(column, value) }))
    .filter((o) => !search || o.label.toLowerCase().includes(search))
})

function toggleFilterDropdown(column, event) {
  event.stopPropagation()
  filterSearchText.value = ''
  openFilterColumn.value = openFilterColumn.value === column ? null : column
}

function isFilterActive(column) {
  return !!columnFilters.value[column]?.size
}

function isValueChecked(column, value) {
  const active = columnFilters.value[column]
  // No filter set for this column at all = every value reads as checked
  // (nothing excluded yet).
  return !active || active.has(value)
}

function toggleFilterValue(column, value) {
  const current = columnFilters.value[column] ?? new Set(optionsFor(column))
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  columnFilters.value = { ...columnFilters.value, [column]: next }
}

function selectAllFilterValues(column) {
  const next = { ...columnFilters.value }
  delete next[column]
  columnFilters.value = next
}

function clearAllFilterValues(column) {
  columnFilters.value = { ...columnFilters.value, [column]: new Set() }
}

function handleDocumentClick() {
  openFilterColumn.value = null
}
onMounted(() => document.addEventListener('click', handleDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick))

const filteredShelters = computed(() => {
  const activeColumns = FILTERABLE_COLUMNS.filter((col) => isFilterActive(col))
  if (!activeColumns.length) return visibleShelters.value
  return visibleShelters.value.filter((s) =>
    activeColumns.every((col) => columnFilters.value[col].has(sortValueFor(s, col))),
  )
})

const sortedShelters = computed(() => {
  if (!sortColumn.value) return filteredShelters.value
  const dir = sortDirection.value === 'asc' ? 1 : -1
  return [...filteredShelters.value].sort((a, b) => {
    const va = sortValueFor(a, sortColumn.value)
    const vb = sortValueFor(b, sortColumn.value)
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb), 'tr') * dir
  })
})

// ── Pagination ────────────────────────────────────────────────────────────
// The OSM import now puts this table at 12k+ rows (see the confidence-level
// import) — rendering every row at once made the page noticeably sluggish
// (scrolling/sorting/filtering all got heavier as more DOM nodes piled up).
// Paging keeps the DOM small regardless of how many rows the dataset grows
// to; page size is user-choosable since "how many do I want to scan at
// once" is a judgment call, not a fixed constant.
const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000]
const pageSize = ref(100)
const currentPage = ref(1)

const totalPages = computed(() => Math.max(1, Math.ceil(sortedShelters.value.length / pageSize.value)))

const paginatedShelters = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedShelters.value.slice(start, start + pageSize.value)
})

// Filtering/sorting/resizing the page can easily leave currentPage pointing
// past the new last page (e.g. you're on page 20 of "all", then filter down
// to 3 pages) — snap back to a valid page instead of rendering an empty table.
watch([filteredShelters, pageSize], () => {
  currentPage.value = 1
})
watch(totalPages, (max) => {
  if (currentPage.value > max) currentPage.value = max
})

function goToPage(n) {
  currentPage.value = Math.min(Math.max(1, n), totalPages.value)
}

function openCreate() {
  editingShelter.value = null
  formError.value = null
  showForm.value = true
}

function openEdit(shelter) {
  editingShelter.value = shelter
  formError.value = null
  showForm.value = true
}

async function handleSave(payload) {
  try {
    if (editingShelter.value) {
      await store.updateShelter(editingShelter.value.id, payload)
      // Edited coordinates may have moved the shelter into a different
      // province/district — drop the stale entry so computeRegionNames()
      // (which otherwise only fills in shelters it's never seen) resolves it
      // fresh instead of keeping the old one.
      const next = { ...regionNames.value }
      delete next[editingShelter.value.id]
      regionNames.value = next
    } else {
      await store.createShelter(payload)
    }
    showForm.value = false
    computeRegionNames()
  } catch (err) {
    formError.value = /chk_shelter_capacity_positive/i.test(err.message)
      ? t('shelters.capacityTotalInvalid')
      : /chk_shelter_capacity\b/i.test(err.message)
        ? t('shelters.occupancyExceedsCapacity')
        : err.message
  }
}

async function toggleActive(shelter) {
  if (shelter.is_active) await store.deactivateShelter(shelter.id)
  else await store.reactivateShelter(shelter.id)
}
</script>

<template>
  <div class="shelters-panel">
    <div class="panel-header">
      <h3>{{ t('shelters.tabLabel') }}</h3>
      <button v-if="canManage" class="btn-submit" @click="openCreate">{{ t('shelters.addButton') }}</button>
    </div>

    <div v-if="store.error" class="form-error">{{ store.error }}</div>
    <LoadingOverlay :visible="store.loading" @cancel="handleCancelLoading" />

    <table v-if="!store.loading" class="shelters-table">
      <thead>
        <tr>
          <th class="sortable" @click="setSort('name')">{{ t('shelters.name') }}{{ sortIndicator('name') }}</th>

          <th class="sortable filterable" :class="{ 'filter-active': isFilterActive('country') }">
            <span @click="setSort('country')">{{ t('shelters.country') }}{{ sortIndicator('country') }}</span>
            <button class="filter-btn" @click="toggleFilterDropdown('country', $event)">▾</button>
            <div v-if="openFilterColumn === 'country'" class="filter-dropdown" @click.stop>
              <input v-model="filterSearchText" class="filter-search" :placeholder="t('shelters.filterSearchPlaceholder')" />
              <div class="filter-actions-row">
                <button @click="selectAllFilterValues('country')">{{ t('shelters.filterSelectAll') }}</button>
                <button @click="clearAllFilterValues('country')">{{ t('shelters.filterClearAll') }}</button>
              </div>
              <div class="filter-options-list">
                <label v-for="opt in filterDropdownOptions" :key="opt.value" class="filter-option">
                  <input type="checkbox" :checked="isValueChecked('country', opt.value)" @change="toggleFilterValue('country', opt.value)" />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </div>
          </th>

          <th class="sortable filterable" :class="{ 'filter-active': isFilterActive('province') }">
            <span @click="setSort('province')">{{ t('shelters.province') }}{{ sortIndicator('province') }}</span>
            <button class="filter-btn" @click="toggleFilterDropdown('province', $event)">▾</button>
            <div v-if="openFilterColumn === 'province'" class="filter-dropdown" @click.stop>
              <input v-model="filterSearchText" class="filter-search" :placeholder="t('shelters.filterSearchPlaceholder')" />
              <div class="filter-actions-row">
                <button @click="selectAllFilterValues('province')">{{ t('shelters.filterSelectAll') }}</button>
                <button @click="clearAllFilterValues('province')">{{ t('shelters.filterClearAll') }}</button>
              </div>
              <div class="filter-options-list">
                <label v-for="opt in filterDropdownOptions" :key="opt.value" class="filter-option">
                  <input type="checkbox" :checked="isValueChecked('province', opt.value)" @change="toggleFilterValue('province', opt.value)" />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </div>
          </th>

          <th class="sortable filterable" :class="{ 'filter-active': isFilterActive('district') }">
            <span @click="setSort('district')">{{ t('shelters.district') }}{{ sortIndicator('district') }}</span>
            <button class="filter-btn" @click="toggleFilterDropdown('district', $event)">▾</button>
            <div v-if="openFilterColumn === 'district'" class="filter-dropdown" @click.stop>
              <input v-model="filterSearchText" class="filter-search" :placeholder="t('shelters.filterSearchPlaceholder')" />
              <div class="filter-actions-row">
                <button @click="selectAllFilterValues('district')">{{ t('shelters.filterSelectAll') }}</button>
                <button @click="clearAllFilterValues('district')">{{ t('shelters.filterClearAll') }}</button>
              </div>
              <div class="filter-options-list">
                <label v-for="opt in filterDropdownOptions" :key="opt.value" class="filter-option">
                  <input type="checkbox" :checked="isValueChecked('district', opt.value)" @change="toggleFilterValue('district', opt.value)" />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </div>
          </th>

          <th class="sortable" @click="setSort('capacity')">{{ t('shelters.capacity') }}{{ sortIndicator('capacity') }}</th>
          <th class="sortable" @click="setSort('occupancy')">{{ t('shelters.occupancyPercent') }}{{ sortIndicator('occupancy') }}</th>

          <th class="sortable filterable" :class="{ 'filter-active': isFilterActive('status') }">
            <span @click="setSort('status')">{{ t('shelters.status') }}{{ sortIndicator('status') }}</span>
            <button class="filter-btn" @click="toggleFilterDropdown('status', $event)">▾</button>
            <div v-if="openFilterColumn === 'status'" class="filter-dropdown" @click.stop>
              <div class="filter-actions-row">
                <button @click="selectAllFilterValues('status')">{{ t('shelters.filterSelectAll') }}</button>
                <button @click="clearAllFilterValues('status')">{{ t('shelters.filterClearAll') }}</button>
              </div>
              <div class="filter-options-list">
                <label v-for="opt in filterDropdownOptions" :key="opt.value" class="filter-option">
                  <input type="checkbox" :checked="isValueChecked('status', opt.value)" @change="toggleFilterValue('status', opt.value)" />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </div>
          </th>

          <th class="sortable filterable" :class="{ 'filter-active': isFilterActive('confidence') }">
            <span @click="setSort('confidence')">{{ t('shelters.confidenceLevel') }}{{ sortIndicator('confidence') }}</span>
            <button class="filter-btn" @click="toggleFilterDropdown('confidence', $event)">▾</button>
            <div v-if="openFilterColumn === 'confidence'" class="filter-dropdown" @click.stop>
              <div class="filter-actions-row">
                <button @click="selectAllFilterValues('confidence')">{{ t('shelters.filterSelectAll') }}</button>
                <button @click="clearAllFilterValues('confidence')">{{ t('shelters.filterClearAll') }}</button>
              </div>
              <div class="filter-options-list">
                <label v-for="opt in filterDropdownOptions" :key="opt.value" class="filter-option">
                  <input type="checkbox" :checked="isValueChecked('confidence', opt.value)" @change="toggleFilterValue('confidence', opt.value)" />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </div>
          </th>

          <th class="sortable" @click="setSort('incident')">{{ t('shelters.linkedIncident') }}{{ sortIndicator('incident') }}</th>
          <th v-if="canManage"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in paginatedShelters" :key="s.id" :class="{ inactive: !s.is_active }">
          <td>
            {{ s.name }}
            <span v-if="s.source === 'osm'" class="osm-badge" :title="t('shelters.osmImportedHint')">OSM</span>
          </td>
          <td>{{ s.country_code.toUpperCase() }}</td>
          <td>{{ regionNames[s.id]?.province ?? '—' }}</td>
          <td>{{ regionNames[s.id]?.district ?? '—' }}</td>
          <td>{{ s.capacity_occupied }} / {{ s.capacity_total }}</td>
          <td>{{ occupancyPercentage(s) }}%</td>
          <td>{{ t(`shelters.statusOptions.${s.status}`) }}</td>
          <td>
            <span class="confidence-badge" :class="`confidence-${s.confidence_level ?? 5}`">
              {{ t(`shelters.confidenceLevels.${s.confidence_level ?? 5}`) }}
            </span>
          </td>
          <td>{{ s.linked_incident_id ? (incidentTitles[s.linked_incident_id] || '—') : '—' }}</td>
          <td v-if="canManage" class="row-actions">
            <button class="btn-link" @click="openEdit(s)">{{ t('shelters.edit') }}</button>
            <button class="btn-link" @click="toggleActive(s)">{{ s.is_active ? t('shelters.deactivate') : t('shelters.reactivate') }}</button>
          </td>
        </tr>
        <tr v-if="!visibleShelters.length"><td :colspan="canManage ? 10 : 9" class="empty-row">{{ t('shelters.empty') }}</td></tr>
        <tr v-else-if="!sortedShelters.length"><td :colspan="canManage ? 10 : 9" class="empty-row">{{ t('shelters.filterEmpty') }}</td></tr>
      </tbody>
    </table>

    <div v-if="sortedShelters.length" class="pagination-bar">
      <label class="page-size-select">
        <span>{{ t('shelters.pagination.perPage') }}</span>
        <select v-model.number="pageSize">
          <option v-for="size in PAGE_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>

      <div class="page-nav">
        <button class="page-nav-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">‹</button>
        <span class="page-indicator">
          {{ t('shelters.pagination.pageOf', { page: currentPage, total: totalPages }) }}
        </span>
        <button class="page-nav-btn" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">›</button>
      </div>

      <span class="page-count">
        {{ t('shelters.pagination.rowCount', { count: sortedShelters.length }) }}
      </span>
    </div>

    <ShelterFormModal
      v-if="showForm"
      :shelter="editingShelter"
      @save="handleSave"
      @cancel="showForm = false"
    />
    <div v-if="showForm && formError" class="form-error modal-inline-error">{{ formError }}</div>
  </div>
</template>

<style scoped>
.shelters-panel { padding: 4px 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.panel-header h3 { margin: 0; color: #e2e8f0; }
.shelters-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.shelters-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.shelters-table th.sortable { cursor: pointer; user-select: none; white-space: nowrap; transition: color .15s; }
.shelters-table th.sortable:hover { color: var(--color-text-primary,#e2e8f0); }
.shelters-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.shelters-table tr.inactive td { opacity: .5; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.row-actions { display: flex; gap: 10px; }
.btn-link { background: none; border: none; color: #4aa3ff; cursor: pointer; font-size: .78rem; padding: 0; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.form-error { color: #ef4444; font-size: .8rem; }
.modal-inline-error { margin-top: 8px; }
.osm-badge {
  display: inline-block; margin-left: 6px; padding: 1px 6px; font-size: .68rem; font-weight: 700;
  color: #94a3b8; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); border-radius: 4px;
  vertical-align: middle;
}
.confidence-badge {
  display: inline-block; padding: 2px 8px; font-size: .72rem; font-weight: 600;
  border-radius: 4px; white-space: nowrap;
}
/* 5 (manual) and 4 (narrow OSM tags) are the map-visible tiers (see
   MapView.vue's updateShelterMarkers filter) — green. 3/2 are ambiguous
   OSM data — amber. 1 is known-noise (bus stops etc.) — red, matches the
   confidence_level migration's tiering. */
.confidence-5, .confidence-4 { background: rgba(34,197,94,.15); color: #4ade80; }
.confidence-3, .confidence-2 { background: rgba(251,191,36,.15); color: #fbbf24; }
.confidence-1 { background: rgba(239,68,68,.15); color: #ef4444; }

/* Excel-style column filter dropdowns */
.shelters-table th.filterable { position: relative; padding-right: 22px; }
.filter-btn {
  position: absolute; top: 6px; right: 4px; background: none; border: none;
  color: var(--color-text-muted,#94a3b8); cursor: pointer; font-size: .7rem; padding: 2px 4px; line-height: 1;
}
.filter-btn:hover { color: var(--color-text-primary,#e2e8f0); }
.shelters-table th.filter-active .filter-btn { color: #4aa3ff; }
.filter-dropdown {
  position: absolute; top: 100%; left: 0; z-index: 20; margin-top: 2px;
  width: 220px; max-height: 320px; display: flex; flex-direction: column;
  background: #161b28; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.4); padding: 8px; font-weight: 400; text-transform: none;
}
.filter-search {
  width: 100%; padding: 6px 8px; margin-bottom: 6px; font-size: .78rem;
  background: rgba(15,23,42,.86); border: 1px solid rgba(148,163,184,.18); border-radius: 6px; color: #e2e8f0;
}
.filter-actions-row { display: flex; gap: 8px; margin-bottom: 6px; }
.filter-actions-row button {
  flex: 1; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 6px;
  color: var(--color-text-secondary,#c4cee6); font-size: .72rem; padding: 4px 6px; cursor: pointer;
}
.filter-actions-row button:hover { background: rgba(255,255,255,.12); color: #e2e8f0; }
.filter-options-list { overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.filter-option {
  display: flex; align-items: center; gap: 6px; padding: 3px 4px; font-size: .78rem;
  color: #e2e8f0; cursor: pointer; border-radius: 4px;
}
.filter-option:hover { background: rgba(255,255,255,.06); }
.filter-option input { flex-shrink: 0; }

.pagination-bar {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 12px; padding: 8px 4px; font-size: .8rem; color: var(--color-text-muted,#94a3b8);
}
.page-size-select { display: flex; align-items: center; gap: 6px; }
.page-size-select select {
  background: rgba(15,23,42,.86); border: 1px solid rgba(148,163,184,.18); border-radius: 6px;
  color: #e2e8f0; font-size: .8rem; padding: 4px 8px; color-scheme: dark;
}
.page-nav { display: flex; align-items: center; gap: 10px; }
.page-nav-btn {
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 6px;
  color: #e2e8f0; font-size: .95rem; padding: 2px 10px; cursor: pointer; line-height: 1.4;
}
.page-nav-btn:hover:not(:disabled) { background: rgba(255,255,255,.12); }
.page-nav-btn:disabled { opacity: .35; cursor: not-allowed; }
.page-indicator { min-width: 110px; text-align: center; }
</style>
