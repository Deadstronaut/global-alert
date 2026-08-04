<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisasterStore } from '@/stores/disaster.js'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'
import { VisXYContainer, VisLine, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'

const { t } = useI18n()
const disasterStore = useDisasterStore()

const chartConfig = { avgMagnitude: { label: t('dashboard.charts.avgMagnitudeTitle'), color: '#00e676' } }

const trendData = computed(() => {
  const now = Date.now()
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    hourIndex: i,
    hourLabel: new Date(now - (23 - i) * 3_600_000).getHours(),
    sum: 0,
    count: 0,
  }))
  for (const eq of disasterStore.earthquakes) {
    if (eq.magnitude == null) continue
    const diffH = Math.floor((now - new Date(eq.time).getTime()) / 3_600_000)
    if (diffH >= 0 && diffH < 24) {
      const bucket = buckets[23 - diffH]
      bucket.sum += eq.magnitude
      bucket.count++
    }
  }
  return buckets.map((b) => ({ ...b, avgMagnitude: b.count ? Number((b.sum / b.count).toFixed(1)) : 0 }))
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>📐 {{ t('dashboard.charts.avgMagnitudeTitle') }}</CardTitle>
      <CardDescription>{{ t('dashboard.charts.last24h') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer :config="chartConfig" class="aspect-auto h-35 w-full">
        <VisXYContainer :data="trendData" :margin="{ left: 4, right: 4 }">
          <VisLine
            :x="(d) => d.hourIndex"
            :y="(d) => d.avgMagnitude"
            color="var(--color-avgMagnitude)"
            :line-width="2"
          />
          <VisAxis
            type="x"
            :tick-format="(i) => trendData[i] !== undefined ? `${trendData[i].hourLabel}:00` : ''"
            :num-ticks="4"
            :grid-line="false"
            :domain-line="false"
          />
          <VisCrosshair :template="(d) => `M${d.avgMagnitude} — ${d.hourLabel}:00`" />
          <VisTooltip />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
