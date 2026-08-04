<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisasterStore } from '@/stores/disaster.js'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'
import { VisSingleContainer, VisDonut } from '@unovis/vue'

const { t } = useI18n()
const disasterStore = useDisasterStore()

// Repeating green-family palette (no per-source semantic meaning like
// severity has) — order is stable per render since it's assigned once the
// source list is known, not re-shuffled by count.
const PALETTE = ['#00e676', '#00c853', '#69f0ae', '#1de9b6', '#00bfa5', '#64ffda']

const sourceData = computed(() => {
  const now = Date.now()
  const counts = {}
  for (const eq of disasterStore.earthquakes) {
    if (now - new Date(eq.time).getTime() > 24 * 3_600_000) continue
    const key = eq.source || t('dashboard.charts.unknownSource')
    counts[key] = (counts[key] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }))
})

const chartConfig = computed(() =>
  Object.fromEntries(sourceData.value.map((s) => [s.label, { label: s.label, color: s.color }])),
)

const totalCount = computed(() => sourceData.value.reduce((sum, s) => sum + s.value, 0))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>📡 {{ t('dashboard.charts.sourceTitle') }}</CardTitle>
      <CardDescription>{{ t('dashboard.charts.last24h') }}</CardDescription>
    </CardHeader>
    <CardContent class="flex justify-center">
      <ChartContainer :config="chartConfig" class="aspect-square h-35">
        <VisSingleContainer :data="sourceData">
          <VisDonut
            :value="(d) => d.value"
            :color="(d) => d.color"
            :arc-width="22"
            :corner-radius="3"
            :pad-angle="0.02"
            :central-label="String(totalCount)"
            :central-sub-label="t('dashboard.charts.earthquakes')"
          />
        </VisSingleContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
