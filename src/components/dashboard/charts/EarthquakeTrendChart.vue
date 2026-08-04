<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisasterStore } from '@/stores/disaster.js'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'
import { VisXYContainer, VisArea, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'

const { t } = useI18n()
const disasterStore = useDisasterStore()

const chartConfig = { count: { label: t('dashboard.charts.earthquakes'), color: '#00e676' } }

// Same live disasterStore.earthquakes feed as the other two charts, just
// bucketed by calendar day instead of by hour/severity.
const dailyData = computed(() => {
  const now = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now)
    day.setDate(day.getDate() - (6 - i))
    day.setHours(0, 0, 0, 0)
    return { dayIndex: i, date: day, count: 0 }
  })
  for (const eq of disasterStore.earthquakes) {
    const eqDate = new Date(eq.time)
    eqDate.setHours(0, 0, 0, 0)
    const bucket = days.find((day) => day.date.getTime() === eqDate.getTime())
    if (bucket) bucket.count++
  }
  return days
})

function formatDay(date) {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>📈 {{ t('dashboard.charts.trendTitle') }}</CardTitle>
      <CardDescription>{{ t('dashboard.charts.trendSubtitle') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer :config="chartConfig" class="aspect-auto h-55 w-full">
        <VisXYContainer :data="dailyData" :margin="{ left: 8, right: 8 }">
          <VisArea
            :x="(d) => d.dayIndex"
            :y="(d) => d.count"
            color="var(--color-count)"
            :opacity="0.35"
            line
            line-color="var(--color-count)"
            :line-width="2"
          />
          <VisAxis
            type="x"
            :tick-format="(i) => dailyData[i] !== undefined ? formatDay(dailyData[i].date) : ''"
            :grid-line="false"
            :domain-line="false"
          />
          <VisAxis type="y" :grid-line="true" :domain-line="false" :num-ticks="4" />
          <VisCrosshair :template="(dt) => `${dt.count} ${t('dashboard.charts.earthquakes')} — ${formatDay(dt.date)}`" />
          <VisTooltip />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
