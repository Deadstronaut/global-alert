<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisasterStore } from '@/stores/disaster.js'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'
import { VisXYContainer, VisGroupedBar, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'

const { t } = useI18n()
const disasterStore = useDisasterStore()

const chartConfig = { count: { label: t('dashboard.charts.earthquakes'), color: '#00e676' } }

const BUCKETS = [
  { label: '<3', min: -Infinity, max: 3 },
  { label: '3-4', min: 3, max: 4 },
  { label: '4-5', min: 4, max: 5 },
  { label: '5-6', min: 5, max: 6 },
  { label: '6+', min: 6, max: Infinity },
]

const magnitudeData = computed(() => {
  const now = Date.now()
  const counts = BUCKETS.map(() => 0)
  for (const eq of disasterStore.earthquakes) {
    if (now - new Date(eq.time).getTime() > 24 * 3_600_000) continue
    if (eq.magnitude == null) continue
    const idx = BUCKETS.findIndex((b) => eq.magnitude >= b.min && eq.magnitude < b.max)
    if (idx >= 0) counts[idx]++
  }
  return BUCKETS.map((b, i) => ({ bucketIndex: i, label: b.label, count: counts[i] }))
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>📏 {{ t('dashboard.charts.magnitudeTitle') }}</CardTitle>
      <CardDescription>{{ t('dashboard.charts.last24h') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer :config="chartConfig" class="aspect-auto h-35 w-full">
        <VisXYContainer :data="magnitudeData" :margin="{ left: 4, right: 4 }">
          <VisGroupedBar
            :x="(d) => d.bucketIndex"
            :y="(d) => d.count"
            :color="() => 'var(--color-count)'"
            :rounded-corners="2"
          />
          <VisAxis
            type="x"
            :tick-format="(i) => magnitudeData[i]?.label ?? ''"
            :grid-line="false"
            :domain-line="false"
          />
          <VisCrosshair :template="(d) => `${d.count} ${t('dashboard.charts.earthquakes')} — M${d.label}`" />
          <VisTooltip />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
