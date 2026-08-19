<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisasterStore } from '@/stores/disaster.js'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { parseDate } from '@internationalized/date'

const { locale, t } = useI18n()
const disasterStore = useDisasterStore()

// --- Date scrubber ---
// Kullanıcı isteği (2026-08-18): sol taraftaki "Süre" slider'ı, ortadaki bu
// scrubber ve sağdaki takvim ARTIK ÜÇÜ BİRLİKTE TEK BİR SİSTEM gibi
// çalışmalı — "24 Saat" seçildiğinde ortadaki bar sabit ±15 günlük bir
// pencere değil, gerçekten O 24 saati (saatlik dilimler halinde) göstermeli;
// bir takvim aralığı uygulandığında bu pencere o aralığa döner (zaten
// vardı, korunuyor); ve bir dilime TIKLAMANIN artık gerçek bir etkisi
// olmalı (önceden sadece görsel vurgu yapıp hiçbir filtreyi değiştirmiyordu
// — "tıklayınca ne oluyor" şikayeti tam buydu).
const MAX_RENDERED_DAYS = 400 // safety cap so a multi-year CALENDAR range (not duration mode below) doesn't render thousands of buttons

const today = new Date()
today.setHours(0, 0, 0, 0)

const scrubberScrollEl = ref(null)
const selectedDate = ref(today)

// Kullanıcı bulgusu (2026-08-18): "10 Yıl" seçilince scrubber 3650 günlük
// buton basıyordu — kullanılamaz. Çözüm: "cetvel" gibi, toplam süreye göre
// OTOMATİK kademe seçen bir granülerlik. hour/day kademeleri hâlâ "en
// fazla ~40 dilim" formülüyle seçiliyor; month/quarter/half-year İSE
// kullanıcının kendi belirlediği net eşiklerle (2 yıla kadar ay, 2-5 yıl
// arası çeyrek/"mevsim", 5 yıl ve üstü yarı-yıl/"ilk-ikinci yarı").
// Kullanıcı bulgusu (2026-08-18, ikinci geçiş): "week" kademesi "3 Ay"/
// "6 Ay" gibi ADINDA "Ay" geçen süreleri de kapsıyordu (formül onları hafta
// dilimlerine düşürüyordu, "27 May" gibi gün-formatlı) — kullanıcı "3 Ay"
// seçince ay isimli dilimler bekliyor, hafta değil. week kademesi tamamen
// kaldırıldı: day kademesinden sonra doğrudan month'a geçiliyor, "3 Ay"
// artık kendi 3 ay-dilimini gösteriyor (1 dilim = 1 ay), "6 Ay" 6 dilim.
const MAX_SCRUBBER_SLOTS = 40
const HOURS_PER_YEAR = 24 * 365
const GRANULARITY_TIERS = [
  { key: 'hour', stepHours: 1, maxDurationHours: MAX_SCRUBBER_SLOTS * 1 },
  { key: 'day', stepHours: 24, maxDurationHours: MAX_SCRUBBER_SLOTS * 24 },
  { key: 'month', stepHours: 24 * 30, maxDurationHours: HOURS_PER_YEAR * 2 }, // 30 günden 2 yıla kadar ay
  // "5 Yıl VE ÜSTÜ yarı yıla bölünsün" (kullanıcı, dahil) — timeRangeMap'te
  // '5 Yıl' presetiyle birebir aynı değer (HOURS_PER_YEAR*5), o yüzden sınır
  // tam onun BİR SAAT ALTINDA: preset'in kendisi artık quarter'ı değil
  // half-year'ı tetikliyor, "ve üstü" ifadesi tam karşılanıyor.
  { key: 'quarter', stepHours: 24 * 90, maxDurationHours: HOURS_PER_YEAR * 5 - 1 }, // 2 yıldan 5 yıla kadar çeyrek (3 aylık/"mevsim")
  { key: 'half-year', stepHours: 24 * 182, maxDurationHours: Infinity }, // 5+ yıl: yarı yıl ("ilk yarı"/"ikinci yarı")
]
const scrubberTier = computed(() => {
  const durationHours = disasterStore.selectedTimeRange || 24
  return GRANULARITY_TIERS.find((tier) => durationHours <= tier.maxDurationHours) ?? GRANULARITY_TIERS[GRANULARITY_TIERS.length - 1]
})

const dayFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { day: '2-digit', month: 'short' }))
const monthFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'short', year: '2-digit' }))
const FORMATTERS_BY_TIER = {
  hour: () => new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }),
  day: () => dayFormatter.value,
  month: () => monthFormatter.value,
  quarter: () => monthFormatter.value, // çeyreğin başlangıç ayı ("Oca 26", "Nis 26"...)
  'half-year': () => monthFormatter.value, // yarının başlangıç ayı ("Oca 26" = ilk yarı, "Tem 26" = ikinci yarı)
}
// Takvim-aralığı modunda (dateFilterMode==='calendar') dates hep gün
// bazlı üretiliyor (aşağıdaki dates computed'ının calendar dalı) —
// scrubberTier duration moduna özel olduğu için formatter orada her
// zaman gün formatına sabitleniyor.
const formatter = computed(() =>
  dateFilterMode.value === 'calendar' ? dayFormatter.value : FORMATTERS_BY_TIER[scrubberTier.value.key](),
)

function isSelected(date) {
  return date.getTime() === selectedDate.value.getTime()
}

// Bir dilime tıklamak artık gerçek bir filtre uyguluyor: o dilimin (saat/
// gün/hafta/ay/yıl) tam başlangıç-bitiş aralığını doğrudan
// disasterStore.startDate/endDate'e yazıp refreshAll() çağırıyor — ama
// takvim-aralığı state'ine (dateFilterMode/rangeStartDate/rangeEndDate)
// DOKUNMUYOR, çünkü bunlar farklı iki eylem: takvimden aralık seçmek
// serbest bir özel aralık tanımlar, scrubber'da bir dilime tıklamak ise
// ZATEN GÖRÜNEN pencere içinde tek bir dilime "sabitlenmek" demek. Bu
// ayrım sayesinde dates listesi tıklama sonrası değişmiyor (aynı pencerede
// kalıyor, sadece seçili dilim değişiyor) ve süre slider'ı tekrar hareket
// ettirildiğinde (handleTimeSliderInput zaten startDate/endDate'i
// null'luyor) sabitlemeden otomatik çıkılıyor.
function selectDate(date) {
  selectedDate.value = date
  const stepHours = dateFilterMode.value === 'calendar' ? 24 : scrubberTier.value.stepHours
  const start = new Date(date)
  const end = new Date(date.getTime() + stepHours * 3600000 - 1)
  disasterStore.startDate = start.toISOString()
  disasterStore.endDate = end.toISOString()
  disasterStore.refreshAll()
}

// Scrolls the actual rendered track — naturally clamped to its real start/
// end by the browser, so "sağa sola gittiğimizde o slider bölümünde
// kalmalı" (navigating left/right must stay within that range) holds for
// free instead of needing manual bounds-checking.
function scrollScrubber(direction) {
  const el = scrubberScrollEl.value
  if (!el) return
  el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.6), behavior: 'smooth' })
}

// --- Magnitude/Depth/Duration + calendar date range (spec 069 Revision 2) ---
// Moved verbatim from SidebarPanel.vue's magnitudeDepth section, including
// its dateFilterMode mutual-exclusivity fix (see that file's own comment on
// the duration-vs-calendar race condition this guards against).
const timeRangeMap = {
  '10 Dakika': 10 / 60,
  '30 Dakika': 0.5,
  '2 Saat': 2,
  '6 Saat': 6,
  '12 Saat': 12,
  '24 Saat': 24,
  '3 Gün': 24 * 3,
  '7 Gün': 24 * 7,
  '15 Gün': 24 * 15,
  '30 Gün': 24 * 30,
  '3 Ay': 24 * 30 * 3,
  '6 Ay': 24 * 30 * 6,
  '1 Yıl': 24 * 365,
  '5 Yıl': 24 * 365 * 5,
  '10 Yıl': 24 * 365 * 10,
  '20 Yıl': 24 * 365 * 20,
}
const timeRanges = Object.keys(timeRangeMap)
// Kullanıcı bulgusu (2026-08-18): sabit ref(5) ("24 Saat") — ama
// disasterStore.selectedTimeRange sayfa açılışında localStorage'dan ÖNCEKİ
// oturumun süresini geri yüklüyor (disaster.js: `ref(_prefs.
// selectedTimeRange ?? 24)`). Önceki oturumda "3 Ay" seçiliyse, store
// gerçekte 2160 saat tutarken bu slider yine de sabit 5'e ("24 Saat")
// açılıyordu — slider'ın ETİKETİ "24 Saat" yazsa da scrubber'ın kendisi
// (store'un gerçek değerini okuyan scrubberTier) doğru şekilde "3 Ay"
// kademesini gösteriyordu, ikisi arasında görsel bir çelişki oluşuyordu.
// Slider'ı bir tık oynatınca handleTimeSliderInput() ikisini de aynı ana
// senkronize ettiği için "düzeliyor" gibi görünüyordu. Doğru çözüm: index
// baştan store'un GERÇEK değerine göre bulunmalı, sabit 5 değil.
function indexForHours(hours) {
  const idx = timeRanges.findIndex((label) => timeRangeMap[label] === hours)
  return idx === -1 ? 5 : idx // eşleşme yoksa (örn. eski/silinmiş bir değer) '24 Saat'e düş
}
const selectedTimeRangeIndex = ref(indexForHours(disasterStore.selectedTimeRange))
const selectedTimeRange = computed(() => timeRanges[selectedTimeRangeIndex.value])

const todayStr = new Date().toISOString().slice(0, 10)
const rangeStartDate = ref(todayStr)
const rangeEndDate = ref('')

const rangeStartCalendarDate = computed({
  get: () => parseDate(rangeStartDate.value || todayStr),
  set: (v) => { rangeStartDate.value = v ? v.toString() : '' },
})
const rangeEndCalendarDate = computed({
  get: () => (rangeEndDate.value ? parseDate(rangeEndDate.value) : undefined),
  set: (v) => { rangeEndDate.value = v ? v.toString() : '' },
})
// 'duration' | 'calendar' — only one is ever the "live" filter, matching
// SidebarPanel.vue's fix for the slider/calendar race condition.
const dateFilterMode = ref('duration')

// When a calendar range is applied (dateFilterMode === 'calendar', set by
// applyDateRange below), the scrubber's day list IS that range — nothing to
// scroll past on either side. Otherwise (dateFilterMode === 'duration') the
// window is exactly the currently-selected duration ending now — 24 Saat
// seçiliyse 24 tane saatlik dilim, 30 Gün seçiliyse 30 tane günlük dilim —
// NOT a fixed ±15-day window anymore (kullanıcı isteği: "sol taraftaki süre
// ile ortadaki bar birlikte çalışmalı"). Declared here (after
// dateFilterMode/rangeStartDate/rangeEndDate above) rather than up with the
// rest of the scrubber state — `watch()` reads its source once
// synchronously during setup to capture a baseline, which threw a TDZ
// ReferenceError when this lived above the `const`s it closes over.
const dates = computed(() => {
  if (dateFilterMode.value === 'calendar' && rangeStartDate.value) {
    const start = new Date(rangeStartDate.value)
    start.setHours(0, 0, 0, 0)
    const end = rangeEndDate.value ? new Date(rangeEndDate.value) : new Date(rangeStartDate.value)
    end.setHours(0, 0, 0, 0)
    const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    const step = spanDays > MAX_RENDERED_DAYS ? Math.ceil(spanDays / MAX_RENDERED_DAYS) : 1
    const count = Math.ceil(spanDays / step)
    return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * step * 86400000))
  }

  const durationHours = disasterStore.selectedTimeRange || 24
  const tier = scrubberTier.value
  const stepMs = tier.stepHours * 3600000
  const count = Math.max(1, Math.ceil(durationHours / tier.stepHours))
  const now = new Date()
  // Dilim sınırlarını kademeye göre yuvarla ("şimdi" 14:37 ise saatlik
  // kademede 14:00'a, günlük/haftalık/aylık/yıllık kademede o günün
  // başına) — çizgiler öyle temiz aralıklarla dursun, "14:37, 15:37,
  // 16:37..." gibi rastgele dakikalarla değil.
  if (tier.key === 'hour') now.setMinutes(0, 0, 0)
  else now.setHours(0, 0, 0, 0)
  const start = new Date(now.getTime() - (count - 1) * stepMs)
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * stepMs))
})

// Keep the highlighted date inside whatever window is currently rendered —
// switching into/out of calendar mode, changing the duration, or picking a
// new calendar range must not leave `selectedDate` pointing at a slot no
// longer in `dates`. Falls back to the LAST slot (closest to "now"), not
// the first — a duration window's most recent moment is the intuitive
// default highlight, not its oldest one.
watch(dates, (list) => {
  if (!list.some((d) => d.getTime() === selectedDate.value.getTime())) {
    selectedDate.value = list[list.length - 1]
  }
  // "Şu an"a en yakın dilim varsayılan olarak sağda — pencere her
  // değiştiğinde (süre değişti, takvim aralığı uygulandı) kullanıcı elle
  // sona kaydırmak zorunda kalmasın.
  nextTick(() => scrubberScrollEl.value?.scrollTo({ left: 999999, behavior: 'smooth' }))
}, { immediate: true })

function clearCalendarRange() {
  dateFilterMode.value = 'duration'
  rangeStartDate.value = todayStr
  rangeEndDate.value = ''
  disasterStore.startDate = null
  disasterStore.endDate = null
  disasterStore.refreshAll()
}

function applyDateRange() {
  if (!rangeStartDate.value) return
  const startDateObj = new Date(rangeStartDate.value)
  startDateObj.setHours(0, 0, 0, 0)

  const endDateObj = rangeEndDate.value ? new Date(rangeEndDate.value) : new Date(rangeStartDate.value)
  endDateObj.setHours(23, 59, 59, 999)

  if (endDateObj < startDateObj) {
    const tmp = rangeStartDate.value
    rangeStartDate.value = rangeEndDate.value
    rangeEndDate.value = tmp
    return applyDateRange()
  }

  dateFilterMode.value = 'calendar'
  disasterStore.startDate = startDateObj.toISOString()
  disasterStore.endDate = endDateObj.toISOString()
  disasterStore.refreshAll()
}

function handleTimeSliderInput(index) {
  selectedTimeRangeIndex.value = index
  const rangeLabel = timeRanges[index]
  const hours = timeRangeMap[rangeLabel] || 24
  disasterStore.selectedTimeRange = hours

  dateFilterMode.value = 'duration'
  rangeStartDate.value = todayStr
  rangeEndDate.value = ''
  disasterStore.startDate = null
  disasterStore.endDate = null
}

const selectedRangeLabel = computed(() => {
  if (!rangeStartDate.value) return t('sidebar.dateRangeStart')
  if (!rangeEndDate.value || rangeEndDate.value === rangeStartDate.value) return rangeStartDate.value
  return `${rangeStartDate.value} - ${rangeEndDate.value}`
})
</script>

<template>
  <footer class="footer-filter-row glass-panel">
    <div class="footer-filters">
      <div class="footer-filter-item">
        <div class="footer-filter-label">
          <span>{{ t('sidebar.magnitude') }}</span>
          <span class="footer-filter-val">{{ disasterStore.minMagnitude > 0 ? `M${disasterStore.minMagnitude}+` : '0+' }}</span>
        </div>
        <Slider
          :min="0" :max="9" :step="0.5"
          :model-value="[disasterStore.minMagnitude]"
          @update:model-value="(v) => (disasterStore.minMagnitude = v[0])"
          class="footer-filter-slider"
        />
      </div>

      <div class="footer-filter-item">
        <div class="footer-filter-label">
          <span>{{ t('sidebar.depth') }}</span>
          <span class="footer-filter-val">{{ disasterStore.maxDepth === null ? t('sidebar.depthAll') : `≤${disasterStore.maxDepth} km` }}</span>
        </div>
        <Slider
          :min="0" :max="700" :step="25"
          :model-value="[disasterStore.maxDepth === null ? 700 : disasterStore.maxDepth]"
          @update:model-value="(v) => (disasterStore.maxDepth = v[0] >= 700 ? null : v[0])"
          class="footer-filter-slider"
        />
      </div>

      <div class="footer-filter-item" :class="{ 'footer-filter-item-inactive': dateFilterMode === 'calendar' }">
        <div class="footer-filter-label">
          <span>{{ t('sidebar.duration') }}</span>
          <span class="footer-filter-val">{{ selectedTimeRange }}</span>
        </div>
        <Slider
          :min="0" :max="timeRanges.length - 1" :step="1"
          :model-value="[selectedTimeRangeIndex]"
          :disabled="dateFilterMode === 'calendar'"
          @update:model-value="(v) => handleTimeSliderInput(v[0])"
          class="footer-filter-slider"
        />
      </div>
    </div>

    <div class="date-scrubber-track">
      <button type="button" class="date-scrubber-nav" @click="scrollScrubber(-1)">◀</button>
      <div class="date-scrubber-scroll" ref="scrubberScrollEl">
        <button
          v-for="date in dates"
          :key="date.toISOString()"
          type="button"
          class="date-scrubber-item"
          :class="{ active: isSelected(date) }"
          @click="selectDate(date)"
        >
          {{ formatter.format(date) }}
        </button>
      </div>
      <button type="button" class="date-scrubber-nav" @click="scrollScrubber(1)">▶</button>
    </div>

    <Popover>
      <PopoverTrigger as-child>
        <Button variant="outline" class="footer-date-range-trigger" :class="{ 'footer-date-range-active': dateFilterMode === 'calendar' }">
          📅 {{ dateFilterMode === 'calendar' ? selectedRangeLabel : t('sidebar.dateRangeInactive') }}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" class="footer-date-range-popover">
        <div class="footer-date-range-label">{{ t('sidebar.dateRange') }}</div>
        <!-- 2026-08-18: iç içe Popover (her tarih alanı kendi ayrı
             açılır-panelinde bir takvim açıyordu) kaldırıldı — Radix/reka-ui
             popover-içinde-popover kombinasyonu ilk açılışta konumunu
             yanlış hesaplayıp "kutular düzgün yerleşmemiş" görünümüne yol
             açıyordu. İki takvim artık doğrudan bu tek panelin içinde, alt
             alta, her zaman görünür. -->
        <div class="footer-date-range-fields">
          <div class="footer-date-field">
            <span class="footer-date-field-label">{{ t('sidebar.dateRangeStart') }}: <strong>{{ rangeStartDate || '—' }}</strong></span>
            <Calendar
              :model-value="rangeStartCalendarDate"
              prevent-deselect
              @update:model-value="(v) => { rangeStartCalendarDate = v }"
            />
          </div>
          <div class="footer-date-field">
            <span class="footer-date-field-label">{{ t('sidebar.dateRangeEnd') }}: <strong>{{ rangeEndDate || '—' }}</strong></span>
            <Calendar
              :model-value="rangeEndCalendarDate"
              :min-value="rangeStartCalendarDate"
              prevent-deselect
              @update:model-value="(v) => { rangeEndCalendarDate = v }"
            />
          </div>
        </div>
        <div class="footer-date-range-actions">
          <Button variant="outline" @click="applyDateRange">{{ t('sidebar.dateRangeApply') }}</Button>
          <Button v-if="dateFilterMode === 'calendar'" variant="ghost" @click="clearCalendarRange">{{ t('sidebar.dateRangeClear') }}</Button>
        </div>
      </PopoverContent>
    </Popover>
  </footer>
</template>

<style scoped>
.footer-filter-row {
  position: relative;
  z-index: var(--z-shell);
  display: flex;
  align-items: center;
  /* Kullanıcı isteği (2026-08-18): tarih bölümü "çok geniş" duruyordu —
     satır ve öğe aralıkları sıkılaştırıldı. */
  gap: var(--space-sm);
  padding: 4px var(--space-sm);
  border-left: none;
  border-right: none;
  border-bottom: none;
}

.footer-filters {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: none;
}

.footer-filter-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* Kullanıcı isteği (2026-08-18): Büyüklük/Derinlik/Süre kutuları dardı —
     %30 büyütüldü (84px -> ~109px). */
  width: 109px;
}

.footer-filter-item-inactive {
  opacity: 0.5;
}

.footer-filter-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  opacity: 0.85;
}

.footer-filter-val {
  font-weight: 600;
  color: var(--color-flood);
}

.footer-filter-slider {
  width: 100%;
}

.date-scrubber-track {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  min-width: 0;
}

.date-scrubber-scroll {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scroll-behavior: smooth;
  /* Kullanıcı bulgusu (2026-08-18): dilim sayısı az olduğunda (örn. "3 Ay"
     -> 3 buton) bu alan içeriğine göre daralıyor, ◀/▶ okları sola
     yığılıp satırın geri kalanı boş kalıyordu. flex:1 ile bu alan HER
     ZAMAN track'in tam genişliğini kaplıyor.
     Kullanıcı bulgusu (2026-08-18, ikinci geçiş): flex:1 tek başına
     yetmedi — içerik yine sola yaslanıp kalan boşluk sağda (▶'dan önce)
     kalıyordu. justify-content:center ile az dilim varken (3-6 buton)
     ortalanıp satırı dengeli dolduruyor; çok dilim varken (kaydırma
     gerektiğinde) taşan flex içeriği doğal olarak flex-start gibi
     davranır, kaydırma davranışı bozulmuyor. */
  flex: 1;
  min-width: 0;
  justify-content: center;
}

.date-scrubber-item {
  flex: none;
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-text-primary);
  border-radius: var(--radius);
  padding: 3px 8px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background var(--transition-normal), border-color var(--transition-normal);
}

.date-scrubber-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* spec 069 follow-up: matches HazardTypeNav.vue's .hazard-type-btn.active
   exactly — one consistent "selected" look across hazard chips, the footer
   mode selector, and this scrubber, per request. */
.date-scrubber-item.active {
  background: rgba(33, 150, 243, 0.25);
  border-color: var(--color-flood);
}

.date-scrubber-nav {
  flex: none;
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-text-primary);
  border-radius: var(--radius);
  padding: 4px 8px;
  cursor: pointer;
}

.date-scrubber-nav:hover {
  background: rgba(255, 255, 255, 0.08);
}

.footer-date-range-trigger {
  flex: none;
  white-space: nowrap;
}

.footer-date-range-active {
  border-color: var(--color-flood);
  color: var(--color-flood);
}

.footer-date-range-popover {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  /* İki takvim artık bu panelin içinde doğrudan render ediliyor (iç içe
     popover kaldırıldı) — 280px bir takvim ızgarasına dar geliyordu,
     kutuların taşıp yanlış yerleşmiş görünmesinin asıl sebebi de buydu. */
  width: auto;
}

.footer-date-range-label {
  font-size: 0.85rem;
  font-weight: 600;
}

.footer-date-range-fields {
  display: flex;
  /* Yan yana değil alt alta — her biri kendi tam genişlikli takvim
     ızgarasını sıkışmadan gösterebilsin diye. */
  flex-direction: column;
  gap: var(--space-sm);
}

.footer-date-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
}

.footer-date-field-label strong {
  color: var(--color-flood);
}

.footer-date-range-actions {
  display: flex;
  gap: var(--space-sm);
}
</style>
