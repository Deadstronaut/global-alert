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

// Same 0-10/10-35/35-70/70+ km bands as USGS's own depth classification
// (shallow/intermediate/deep) — a familiar breakdown rather than an
// arbitrary one.
const BUCKETS = [
  { label: '0-10', min: -Infinity, max: 10 },
  { label: '10-35', min: 10, max: 35 },
  { label: '35-70', min: 35, max: 70 },
  { label: '70+', min: 70, max: Infinity },
]

const depthData = computed(() => {
  const now = Date.now()
  const counts = BUCKETS.map(() => 0)
  for (const eq of disasterStore.earthquakes) {
    if (now - new Date(eq.time).getTime() > 24 * 3_600_000) continue
    if (eq.depth == null) continue
    const idx = BUCKETS.findIndex((b) => eq.depth >= b.min && eq.depth < b.max)
    if (idx >= 0) counts[idx]++
  }
  return BUCKETS.map((b, i) => ({ bucketIndex: i, label: b.label, count: counts[i] }))
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>⬇️ {{ t('dashboard.charts.depthTitle') }}</CardTitle>
      <CardDescription>{{ t('dashboard.charts.last24h') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer :config="chartConfig" class="aspect-auto h-35 w-full">
        <VisXYContainer :data="depthData" :margin="{ left: 4, right: 4 }">
          <VisGroupedBar
            :x="(d) => d.bucketIndex"
            :y="(d) => d.count"
            :color="() => 'var(--color-count)'"
            :rounded-corners="2"
          />
          <VisAxis
            type="x"
            :tick-format="(i) => depthData[i]?.label ?? ''"
            :grid-line="false"
            :domain-line="false"
          />
          <VisCrosshair :template="(d) => `${d.count} ${t('dashboard.charts.earthquakes')} — ${d.label} km`" />
          <VisTooltip />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
