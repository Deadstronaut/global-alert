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

// Bucketed straight from the live disasterStore.earthquakes feed (same
// dataset the map renders from) — no separate query, always in sync with
// whatever's currently loaded.
const hourlyData = computed(() => {
  const now = Date.now()
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    hourIndex: i,
    hourLabel: new Date(now - (23 - i) * 3_600_000).getHours(),
    count: 0,
  }))
  for (const eq of disasterStore.earthquakes) {
    const diffH = Math.floor((now - new Date(eq.time).getTime()) / 3_600_000)
    if (diffH >= 0 && diffH < 24) buckets[23 - diffH].count++
  }
  return buckets
})

const totalCount = computed(() => hourlyData.value.reduce((sum, b) => sum + b.count, 0))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>📊 {{ t('dashboard.charts.hourlyTitle') }}</CardTitle>
      <CardDescription>{{ t('dashboard.charts.last24h') }} · {{ totalCount }} {{ t('dashboard.charts.earthquakes') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer :config="chartConfig" class="aspect-auto h-35 w-full">
        <VisXYContainer :data="hourlyData" :margin="{ left: 4, right: 4 }">
          <VisGroupedBar
            :x="(d) => d.hourIndex"
            :y="(d) => d.count"
            :color="() => 'var(--color-count)'"
            :rounded-corners="2"
          />
          <VisAxis
            type="x"
            :tick-format="(i) => hourlyData[i] !== undefined ? `${hourlyData[i].hourLabel}:00` : ''"
            :num-ticks="6"
            :grid-line="false"
            :domain-line="false"
          />
          <VisCrosshair :template="(d) => `${d.count} ${t('dashboard.charts.earthquakes')} — ${d.hourLabel}:00`" />
          <VisTooltip />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
