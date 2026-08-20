<script setup>
// Glanceable event-density heatmap for HazardEventsListDialog.vue (user
// request, 2026-08-20: "deprem listesine bklit heatmap ile... ülke bazlı ve
// genel bazlı... efektif bir butondan ziyade tek seferde okunabilecek bilgi
// olarak dizayn et"). Deliberately reuses the SAME `events` the table below
// already shows (dialog's own `filteredEvents` — already respects the
// existing severity chips + country dropdown), so this needs no new
// controls of its own: picking a country in the existing dropdown already
// makes this "ülke bazlı", leaving it on "Tümü" already makes this "genel".
//
// Granularity is derived from the real data's own date span (Constitution
// Principle IV — never invent a fixed window the data doesn't actually
// cover): day-level GitHub-style calendar grid for spans up to ~90 days,
// month-level bars for longer spans (a 3-year SÜRE selection would otherwise
// render an unreadably wide day grid).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  events: { type: Array, default: () => [] }, // same shape as HazardEventsListDialog's filteredEvents (.time/.created_at)
})
const { t, locale } = useI18n()

const DAY_MS = 86_400_000

function eventTime(e) {
  const raw = e.time || e.created_at
  const d = raw ? new Date(raw) : null
  return d && !isNaN(d.getTime()) ? d : null
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const validDates = computed(() => props.events.map(eventTime).filter(Boolean))

const spanDays = computed(() => {
  if (validDates.value.length < 2) return 0
  const times = validDates.value.map((d) => d.getTime())
  return (Math.max(...times) - Math.min(...times)) / DAY_MS
})

// Reference design (user-provided screenshot, 2026-08-20) is a full year of
// day-level cells, GitHub-contribution-graph style — so day mode stays in
// effect up to ~13 months; only a genuinely multi-year SÜRE selection falls
// back to month-level bars (a day grid spanning several years would be
// unreadably wide).
const mode = computed(() => (spanDays.value > 400 ? 'month' : 'day'))

// Mon/Wed/Fri only (weekday index 0=Sun..6=Sat) — same rows the reference
// screenshot labels, not all 7 (Sun/Tue/Thu/Sat left blank, same as GitHub's
// own contribution graph).
const WEEKDAY_LABEL_INDEXES = { 1: 'mon', 3: 'wed', 5: 'fri' }

// ── Day mode: GitHub-style weeks-as-columns grid, from the Sunday on/before
//    the earliest real event through the Saturday on/after the latest one —
//    the grid's own edges are anchored to the real data, not a fixed count
//    of weeks back from "today" (a hazard type with only old events
//    shouldn't render a grid full of empty recent weeks). Month labels are
//    placed above the first week where that month's 1st-7th falls, same
//    heuristic GitHub's own graph uses. ─────────────────────────────────
const dayCells = computed(() => {
  if (mode.value !== 'day' || !validDates.value.length) return { weeks: [], monthLabels: [], max: 0 }
  const counts = new Map()
  for (const d of validDates.value) {
    const k = dayKey(d)
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  const times = validDates.value.map((d) => d.getTime())
  const start = new Date(Math.min(...times))
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay()) // back up to that week's Sunday
  const end = new Date(Math.max(...times))
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + (6 - end.getDay())) // forward to that week's Saturday

  const weeks = []
  const monthLabels = []
  let cursor = new Date(start)
  let week = []
  let max = 0
  let lastLabeledMonth = null
  while (cursor <= end) {
    if (week.length === 0) {
      const monthToken = cursor.getFullYear() * 12 + cursor.getMonth()
      if (cursor.getDate() <= 7 && monthToken !== lastLabeledMonth) {
        monthLabels.push({ week: weeks.length, label: monthShortFmt.value.format(cursor) })
        lastLabeledMonth = monthToken
      }
    }
    const k = dayKey(cursor)
    const count = counts.get(k) || 0
    if (count > max) max = count
    week.push({ key: k, date: new Date(cursor), count, weekday: cursor.getDay() })
    if (week.length === 7) { weeks.push(week); week = [] }
    cursor = new Date(cursor.getTime() + DAY_MS)
  }
  if (week.length) weeks.push(week)
  return { weeks, monthLabels, max }
})

// ── Month mode: one bar per real calendar month in the data's own span. ───
const monthCells = computed(() => {
  if (mode.value !== 'month' || !validDates.value.length) return { months: [], max: 0 }
  const counts = new Map()
  for (const d of validDates.value) {
    const k = monthKey(d)
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  const times = validDates.value.map((d) => d.getTime())
  const start = new Date(Math.min(...times))
  start.setDate(1)
  const end = new Date(Math.max(...times))
  end.setDate(1)

  const months = []
  let cursor = new Date(start)
  let max = 0
  while (cursor <= end) {
    const k = monthKey(cursor)
    const count = counts.get(k) || 0
    if (count > max) max = count
    months.push({ key: k, date: new Date(cursor), count })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return { months, max }
})

// 5-step intensity, quantile-scaled against this dataset's own max (not a
// fixed absolute threshold — a quiet hazard type's "busiest day" should
// still read as the deepest color, same as a busy one's).
function levelFor(count, max) {
  if (count === 0 || max === 0) return 0
  const ratio = count / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  if (ratio < 1) return 4
  return 5
}

const dayFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
const monthShortFmt = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'short' }))
const monthFmt = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'short', year: '2-digit' }))
const monthFullFmt = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' }))
const weekdayLabels = computed(() =>
  Object.entries(WEEKDAY_LABEL_INDEXES).map(([weekday, key]) => ({
    weekday: Number(weekday),
    label: t(`hazardEventsList.heatmap.${key}`),
  })),
)
</script>

<template>
  <div v-if="validDates.length" class="hazard-heatmap">
    <template v-if="mode === 'day'">
      <!-- Month labels row — a fixed-width spacer matching the weekday-label
           column below, then one fixed-width (overflow-visible) cell per
           week so each label spills rightward from its own week's column,
           the same alignment trick GitHub's own contribution graph uses. -->
      <div class="hazard-heatmap-month-row">
        <span
          v-for="(week, i) in dayCells.weeks"
          :key="`m-${i}`"
          class="hazard-heatmap-month-label-cell"
        >{{ dayCells.monthLabels.find((m) => m.week === i)?.label ?? '' }}</span>
      </div>
      <div class="hazard-heatmap-body">
        <div class="hazard-heatmap-weekday-col">
          <span v-for="wd in 7" :key="wd" class="hazard-heatmap-weekday-label">
            {{ weekdayLabels.find((l) => l.weekday === wd - 1)?.label ?? '' }}
          </span>
        </div>
        <div class="hazard-heatmap-days">
          <div v-for="week in dayCells.weeks" :key="week[0].key" class="hazard-heatmap-week">
            <span
              v-for="cell in week"
              :key="cell.key"
              class="hazard-heatmap-cell"
              :class="`level-${levelFor(cell.count, dayCells.max)}`"
              :title="`${dayFmt.format(cell.date)} — ${cell.count} ${t('hazardEventsList.heatmap.eventsUnit')}`"
            />
          </div>
        </div>
      </div>
    </template>
    <div v-else class="hazard-heatmap-months">
      <div
        v-for="m in monthCells.months"
        :key="m.key"
        class="hazard-heatmap-month"
        :title="`${monthFullFmt.format(m.date)} — ${m.count} ${t('hazardEventsList.heatmap.eventsUnit')}`"
      >
        <span
          class="hazard-heatmap-month-bar"
          :class="`level-${levelFor(m.count, monthCells.max)}`"
          :style="{ height: m.count && monthCells.max ? `${Math.max(8, (m.count / monthCells.max) * 100)}%` : '2px' }"
        />
        <span class="hazard-heatmap-month-label">{{ monthFmt.format(m.date) }}</span>
      </div>
    </div>
    <div class="hazard-heatmap-legend hazard-heatmap-legend--right">
      <span>{{ t('hazardEventsList.heatmap.less') }}</span>
      <span class="hazard-heatmap-cell level-0" />
      <span class="hazard-heatmap-cell level-1" />
      <span class="hazard-heatmap-cell level-2" />
      <span class="hazard-heatmap-cell level-3" />
      <span class="hazard-heatmap-cell level-4" />
      <span class="hazard-heatmap-cell level-5" />
      <span>{{ t('hazardEventsList.heatmap.more') }}</span>
    </div>
  </div>
</template>

<style scoped>
.hazard-heatmap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  overflow-x: auto;
}

/* Month labels row — spacer must match .hazard-heatmap-weekday-col's own
   width + the .hazard-heatmap-body gap exactly, and each label cell's
   width+gap must match .hazard-heatmap-week's, or the labels drift out of
   alignment with the columns they're meant to sit above. */
.hazard-heatmap-month-row {
  display: flex;
  gap: 3px;
  padding-left: calc(24px + 6px);
}
.hazard-heatmap-month-label-cell {
  width: 11px;
  flex-shrink: 0;
  font-size: 0.62rem;
  color: #64748b;
  white-space: nowrap;
  overflow: visible;
}

.hazard-heatmap-body {
  display: flex;
  gap: 6px;
}
.hazard-heatmap-weekday-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 24px;
  flex-shrink: 0;
}
.hazard-heatmap-weekday-label {
  height: 11px;
  font-size: 0.62rem;
  line-height: 11px;
  color: #64748b;
  white-space: nowrap;
}

.hazard-heatmap-days {
  display: flex;
  gap: 3px;
}
.hazard-heatmap-week {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.hazard-heatmap-cell {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.hazard-heatmap-months {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 56px;
}
.hazard-heatmap-month {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 100%;
  min-width: 20px;
}
.hazard-heatmap-month-bar {
  width: 14px;
  border-radius: 3px 3px 0 0;
  background: rgba(255, 255, 255, 0.06);
  transition: height 0.2s ease;
}
.hazard-heatmap-month-label {
  font-size: 0.6rem;
  color: #64748b;
  white-space: nowrap;
}

/* Same blue this dialog already uses for its own event-count badge
   (.hazard-events-total / var(--color-flood)) — quantile-scaled opacity
   ramp rather than five unrelated hues, so it reads as one intensity scale. */
.level-0 { background: rgba(255, 255, 255, 0.06); }
.level-1 { background: rgba(33, 150, 243, 0.2); }
.level-2 { background: rgba(33, 150, 243, 0.4); }
.level-3 { background: rgba(33, 150, 243, 0.6); }
.level-4 { background: rgba(33, 150, 243, 0.8); }
.level-5 { background: var(--color-flood, #2196f3); }

.hazard-heatmap-legend {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.65rem;
  color: #64748b;
}
.hazard-heatmap-legend--right {
  justify-content: flex-end;
}
.hazard-heatmap-legend .hazard-heatmap-cell {
  width: 9px;
  height: 9px;
}
</style>
