<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const { t } = useI18n()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()

// Deliberately independent of the sidebar's own magnitude/depth/date
// filters (disasterStore.allEvents) — this card is meant to answer one
// fixed question at a glance ("how many earthquakes in the last 24h"),
// not shift with whatever filter state the map happens to be in.
const count24h = computed(() => {
  const cutoff = Date.now() - 24 * 3_600_000
  const bbox = disasterStore.activeBbox
  return disasterStore.earthquakes.filter((e) => {
    if (new Date(e.time).getTime() < cutoff) return false
    if (bbox) {
      const lat = Number(e.lat)
      const lng = Number(e.lng)
      if (lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng) return false
    }
    return true
  }).length
})

const scopeLabel = computed(() => {
  const country = uiStore.activeCountryConfig
  return country
    ? t('dashboard.earthquakes24hForCountry', { country: country.nameEn })
    : t('dashboard.earthquakes24hGlobal')
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>🌍 {{ t('dashboard.earthquakes24hTitle') }}</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="text-3xl font-bold">{{ count24h }}</div>
      <p class="text-muted-foreground text-xs">{{ scopeLabel }}</p>
    </CardContent>
  </Card>
</template>
