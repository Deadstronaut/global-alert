<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisasterStore } from '@/stores/disaster.js'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'
import { VisSingleContainer, VisDonut, VisDonutSelectors, VisTooltip } from '@unovis/vue'

const { t } = useI18n()
const disasterStore = useDisasterStore()

// Same red/orange/yellow/green/gray severity palette used everywhere else
// in the app (filters, map markers) — a chart is not the place to invent a
// second color language for the same five buckets.
const SEVERITY_META = [
  { key: 'critical', label: t('severity.critical'), color: 'var(--color-critical)' },
  { key: 'high', label: t('severity.high'), color: 'var(--color-high)' },
  { key: 'moderate', label: t('severity.moderate'), color: 'var(--color-moderate)' },
  { key: 'low', label: t('severity.low'), color: 'var(--color-low)' },
  { key: 'minimal', label: t('severity.minimal'), color: 'var(--color-minimal)' },
]

const chartConfig = Object.fromEntries(
  SEVERITY_META.map((s) => [s.key, { label: s.label, color: s.color }]),
)

const severityData = computed(() => {
  const now = Date.now()
  const counts = Object.fromEntries(SEVERITY_META.map((s) => [s.key, 0]))
  for (const eq of disasterStore.earthquakes) {
    if (now - new Date(eq.time).getTime() > 24 * 3_600_000) continue
    if (counts[eq.severity] !== undefined) counts[eq.severity]++
  }
  return SEVERITY_META.map((s) => ({ ...s, value: counts[s.key] })).filter((s) => s.value > 0)
})

const totalCount = computed(() => severityData.value.reduce((sum, s) => sum + s.value, 0))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>🎯 {{ t('dashboard.charts.severityTitle') }}</CardTitle>
      <CardDescription>{{ t('dashboard.charts.last24h') }}</CardDescription>
    </CardHeader>
    <CardContent class="flex justify-center">
      <ChartContainer :config="chartConfig" class="aspect-square h-35">
        <VisSingleContainer :data="severityData">
          <VisDonut
            :value="(d) => d.value"
            :color="(d) => d.color"
            :arc-width="22"
            :corner-radius="3"
            :pad-angle="0.02"
            :central-label="String(totalCount)"
            :central-sub-label="t('dashboard.charts.earthquakes')"
          />
          <VisTooltip :triggers="{ [VisDonutSelectors.segment]: (d) => `${d.data.label}: ${d.data.value}` }" />
        </VisSingleContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
