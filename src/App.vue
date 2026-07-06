<template>
  <!-- Space Background -->
  <div class="space-background"></div>

  <!-- Loading Screen -->
  <LoadingScreen :visible="isLoading" />

  <!-- Main App -->
  <RouterView v-if="!isLoading" />
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import LoadingScreen from '@/components/LoadingScreen.vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useSopDocumentsStore } from '@/stores/sopDocuments.js'
import { useMapLayersStore } from '@/stores/mapLayers.js'

const disasterStore = useDisasterStore()
const hazardTypesStore = useHazardTypesStore()
const sopDocumentsStore = useSopDocumentsStore()
const mapLayersStore = useMapLayersStore()

// Loading: sadece store gerçekten yükleniyor ve cache yoksa göster
const isLoading = computed(() => disasterStore.isLoading)

onMounted(() => {
  disasterStore.startWebSocket()
  // spec 010: warm the hazard taxonomy registry once at boot so every
  // consumer (6 migrated hazard-type selectors) already has it cached by
  // the time it mounts, instead of each one fetching independently.
  hazardTypesStore.fetchHazardTypes()
  // spec 011: warm the SOP repository once at boot so IncidentsView can
  // show linked procedures immediately on mount.
  sopDocumentsStore.fetchSopDocuments()
  // spec 012: warm the OGC map layer registry once at boot; MapView.vue
  // also re-fetches on its own mount (T020) so a deactivated layer never
  // lingers in an already-open session's layer panel.
  mapLayersStore.fetchMapLayers()
})
</script>

<style scoped>
/* App-level styles handled by main.css */
</style>
