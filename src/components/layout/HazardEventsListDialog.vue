<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown } from '@lucide/vue'
import { useDisasterStore } from '@/stores/disaster.js'
import countries from '@/configs/countries.json'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import HazardEventsHeatmap from '@/components/layout/HazardEventsHeatmap.vue'

// Kullanıcı isteği (2026-08-18): afet tipi çipindeki zil ikonu "Olay Takibi"
// (insan tarafından SOP'a bağlı incident yönetimi, IncidentsView.vue) sayfasını
// açıyordu — ama kullanıcı bunun yerine o hazard type'ın VERİTABANINDAKİ
// GERÇEK olaylarını (deprem/yangın/vs. satırlarını, büyüklük/kaynak/zaman ile)
// görmek istiyor: "database'den olayları yazması lazım... büyüklüğü kaynağı
// zamanı önemli bilgiler". Bu iki şey kavramsal olarak tamamen farklı —
// biri insan-yönetimli müdahale takibi, diğeri ham hazard event listesi —
// bu yüzden ayrı bir bileşen, IncidentsView'ı değiştirmek/genişletmek yerine.
const props = defineProps({
  hazardType: { type: String, default: null }, // hazard_type kodu (earthquake, wildfire, ...) veya null=kapalı
  icon: { type: String, default: '' },
  labelKey: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const { t } = useI18n()
const disasterStore = useDisasterStore()

const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'minimal']
// Varsayılan: hepsi açık — kullanıcının kendi isteği "kritik yüksek orta
// düşük minimal diye filtresi olsun... öbür türlü çok zor olur" zaten
// varsayılan tam liste + daraltma amaçlı, boş başlangıç değil.
const activeSeverities = ref(new Set(SEVERITIES))
function toggleSeverity(sev) {
  const next = new Set(activeSeverities.value)
  if (next.has(sev)) next.delete(sev)
  else next.add(sev)
  // En az bir şiddet açık kalmalı — hepsini kapatmak "hiçbir şey gösterme"
  // gibi kafa karıştırıcı bir boş-liste durumuna düşürür.
  if (next.size > 0) activeSeverities.value = next
}

const PAGE_SIZE = 20
const page = ref(1)

// Kullanıcı isteği (2026-08-18): ülke filtresi — dropdown sadece o an bu
// hazard type için gerçekten olay olan ülkeleri listeliyor (sabit/tam ülke
// listesi değil, "afetin işlendiği ülkeler" — boş, hiç kimsenin olmadığı
// bir ülkeyi seçenek olarak göstermenin anlamı yok).
const selectedCountry = ref(null) // null = tüm ülkeler

// Panel her açıldığında (farklı bir hazard type seçildiğinde de) sayfa 1'e
// ve ülke filtresi "tümü"ne dönsün — önceki tipin 3. sayfasında/ülkesinde
// kalıp yeni tipte boş görünmesin.
watch(() => props.hazardType, () => { page.value = 1; selectedCountry.value = null })

// Kullanıcı bulgusu (2026-08-18): daha önce ham disasterStore per-type
// referanslarından (earthquakes/wildfires/... veya
// otherDisasters.filter(...)) okunuyordu — bunlar SÜRE (Süre slider'ı),
// büyüklük/derinlik veya seçili ülke bbox'ından hiç etkilenmiyordu, sadece
// zamanla BİRİKEN (hiç budanmayan) ham önbelleği gösteriyordu. Aynı
// HazardTypeNav.vue düzeltmesi burada da: disasterStore.allEvents ZATEN
// tüm bu filtreleri uyguluyor ve haritadaki işaretçileri de o besliyor —
// bu panel artık haritayla birebir aynı, gerçekten süreye göre filtrelenmiş
// listeyi gösteriyor.
const allEventsForType = computed(() => {
  if (!props.hazardType) return []
  return disasterStore.allEvents.filter((e) => e.type === props.hazardType)
})

const availableCountries = computed(() => {
  const codes = new Set()
  for (const e of allEventsForType.value) {
    if (e.country_code) codes.add(String(e.country_code).toLowerCase())
  }
  return [...codes]
    .map((code) => ({ code, name: countries[code]?.nameEn ?? code.toUpperCase() }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const selectedCountryLabel = computed(() => {
  if (!selectedCountry.value) return t('hazardEventsList.allCountries')
  return availableCountries.value.find((c) => c.code === selectedCountry.value)?.name ?? selectedCountry.value
})

// Şiddet filtresi daraltılınca artık hiç olayı kalmayan bir ülke seçili
// kalabilir — geçerli seçenek listesinde değilse sessizce "tümü"ne dön.
watch(availableCountries, (list) => {
  if (selectedCountry.value && !list.some((c) => c.code === selectedCountry.value)) {
    selectedCountry.value = null
  }
})

const filteredEvents = computed(() =>
  allEventsForType.value
    .filter((e) => activeSeverities.value.has(e.severity))
    .filter((e) => !selectedCountry.value || String(e.country_code).toLowerCase() === selectedCountry.value)
    .slice()
    .sort((a, b) => new Date(b.time || b.created_at || 0) - new Date(a.time || a.created_at || 0)),
)

const totalPages = computed(() => Math.max(1, Math.ceil(filteredEvents.value.length / PAGE_SIZE)))
// Şiddet filtresi daraltılınca sayfa sayısı düşebilir — geçerli aralığa kelepçele.
watch(totalPages, (tp) => { if (page.value > tp) page.value = tp })

const pagedEvents = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredEvents.value.slice(start, start + PAGE_SIZE)
})

// Sayfa numarası şeridi — çok sayfa varsa hepsini basmak yerine mevcut
// sayfanın etrafında küçük bir pencere + uçlarda ilk/son (aynı bu projede
// başka yerlerde de kullanılan "..." sıkıştırma deseni).
const pageNumbers = computed(() => {
  const tp = totalPages.value
  const cur = page.value
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1)
  const nums = new Set([1, tp, cur, cur - 1, cur + 1, cur - 2, cur + 2])
  return [...nums].filter((n) => n >= 1 && n <= tp).sort((a, b) => a - b)
})

function goToPage(n) {
  page.value = Math.min(totalPages.value, Math.max(1, n))
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : timeFormatter.format(d)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="hazardType" class="hazard-events-overlay" @click.self="emit('close')">
      <div class="hazard-events-card">
        <div class="hazard-events-header">
          <h3>
            <span class="hazard-events-icon">{{ icon }}</span>
            {{ t(labelKey) }}
            <span class="hazard-events-total">{{ filteredEvents.length }}</span>
          </h3>
          <button type="button" class="hazard-events-close" @click="emit('close')" :aria-label="t('app.close')">✕</button>
        </div>

        <div class="hazard-events-filters">
          <button
            v-for="sev in SEVERITIES"
            :key="sev"
            type="button"
            class="hazard-events-sev-chip"
            :class="[sev, { active: activeSeverities.has(sev) }]"
            @click="toggleSeverity(sev)"
          >
            {{ t(`severity.${sev}`) }}
          </button>
          <!-- Kullanıcı isteği (2026-08-18): sadece o an bu hazard type için
               gerçekten olay olan ülkeler listelensin — sabit/tam bir ülke
               listesi değil. Native <select>/<option>'dan bu app'in kendi
               DropdownMenu bileşenine geçirildi — kullanıcı bulgusu: native
               <option> listesi tarayıcının kendi (genelde açık renkli)
               temasını kullanıyordu, bu panelin koyu temasını hiç
               görmüyordu, bu yüzden okunamaz duruyordu.
               Kullanıcı bulgusu (2026-08-18, dördüncü geçiş): "üstüne
               basınca açılmıyor" — çünkü buton v-if="availableCountries.
               length > 0" ile TAMAMEN gizleniyordu (deprem gibi
               country_code'u henüz işlenmemiş canlı verisi olan tiplerde
               hiç render olmuyordu) — kullanıcı orada bir buton görmese
               bile tıkladığı yerde aslında hiçbir şey yoktu, "açılmıyor"
               gibi okundu. Artık buton HER ZAMAN görünüyor; veri yoksa
               sessizce kaybolmak yerine devre dışı + açıklayıcı. -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="hazard-events-country-trigger"
                :disabled="availableCountries.length === 0"
                :title="availableCountries.length === 0 ? t('hazardEventsList.noCountryData') : undefined"
              >
                {{ availableCountries.length === 0 ? t('hazardEventsList.noCountryData') : selectedCountryLabel }}
                <ChevronDown class="hazard-events-country-chevron" />
              </button>
            </DropdownMenuTrigger>
            <!-- Kullanıcı bulgusu (2026-08-18, beşinci geçiş) — "ilk
                 tasarımda [native <select>] çalışıyordu": native <select>
                 tarayıcının KENDİ üst-katman UI'sinde açılır, bu sayfanın
                 z-index sıralamasından hiç etkilenmez. DropdownMenuContent
                 ise (DropdownMenuPortal ile) bu modalın backdrop'uyla
                 (.hazard-events-overlay, z-index:1000) AYNI body altına
                 teleport ediliyor — Tailwind'in varsayılan z-50'si (=50)
                 1000'in altında kaldığı için menü DOM'da gerçekten
                 açılıyordu (Playwright'in "visible" kontrolü z-index
                 örtüşmesini yakalamıyor, bu yüzden otomatik testlerde hiç
                 ortaya çıkmadı) ama koyu backdrop'un ARKASINDA/ALTINDA
                 kalıp insan gözüne görünmüyordu. z-index'i overlay'den
                 yüksek bir değere sabitlemek asıl düzeltme. -->
            <DropdownMenuContent
              align="end"
              class="hazard-events-country-menu"
              :style="{ maxHeight: '320px', overflowY: 'auto', zIndex: 1100 }"
            >
              <DropdownMenuItem :class="{ active: selectedCountry === null }" @click="selectedCountry = null">
                {{ t('hazardEventsList.allCountries') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-for="c in availableCountries"
                :key="c.code"
                :class="{ active: selectedCountry === c.code }"
                @click="selectedCountry = c.code"
              >
                {{ c.name }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <HazardEventsHeatmap :events="filteredEvents" />

        <div class="hazard-events-body">
          <div v-if="pagedEvents.length === 0" class="hazard-events-empty">
            {{ t('hazardEventsList.empty') }}
          </div>
          <table v-else class="hazard-events-table">
            <thead>
              <tr>
                <th>{{ t('hazardEventsList.colSeverity') }}</th>
                <th>{{ t('hazardEventsList.colTitle') }}</th>
                <th>{{ t('hazardEventsList.colMagnitude') }}</th>
                <th>{{ t('hazardEventsList.colSource') }}</th>
                <th>{{ t('hazardEventsList.colTime') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ev in pagedEvents" :key="ev.id">
                <td><span class="hazard-events-sev-dot" :class="ev.severity"></span>{{ t(`severity.${ev.severity}`) }}</td>
                <td class="hazard-events-title-cell" :title="ev.title || ''">{{ ev.title || '—' }}</td>
                <td>{{ ev.magnitude != null ? ev.magnitude : '—' }}</td>
                <td>{{ ev.source || '—' }}</td>
                <td>{{ formatTime(ev.time) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="totalPages > 1" class="hazard-events-pagination">
          <button type="button" :disabled="page === 1" @click="goToPage(page - 1)">‹</button>
          <template v-for="(n, idx) in pageNumbers" :key="n">
            <span v-if="idx > 0 && n - pageNumbers[idx - 1] > 1" class="hazard-events-page-gap">…</span>
            <button type="button" :class="{ active: n === page }" @click="goToPage(n)">{{ n }}</button>
          </template>
          <button type="button" :disabled="page === totalPages" @click="goToPage(page + 1)">›</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Aynı overlay/card deseni — QuickPageDialog.vue ile birebir aynı, bu
   projenin zaten oturmuş "gerçek modal" konvansiyonu. */
.hazard-events-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.hazard-events-card {
  background: #161b26;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  width: min(900px, 92vw);
  height: min(720px, 84dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.hazard-events-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.hazard-events-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.hazard-events-icon { font-size: 1.1rem; }
.hazard-events-total {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-flood);
  background: rgba(33, 150, 243, 0.15);
  border-radius: 999px;
  padding: 2px 8px;
}
.hazard-events-close {
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-size: 1rem;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
.hazard-events-close:hover { background: rgba(255, 255, 255, 0.1); }

.hazard-events-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}
.hazard-events-sev-chip {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent;
  color: #94a3b8;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
  opacity: 0.5;
}
.hazard-events-sev-chip.active { opacity: 1; }
.hazard-events-sev-chip.critical.active { background: rgba(239, 68, 68, 0.2); border-color: var(--color-critical); color: var(--color-critical); }
.hazard-events-sev-chip.high.active { background: rgba(249, 115, 22, 0.2); border-color: var(--color-high); color: var(--color-high); }
.hazard-events-sev-chip.moderate.active { background: rgba(234, 179, 8, 0.2); border-color: var(--color-moderate); color: var(--color-moderate); }
.hazard-events-sev-chip.low.active { background: rgba(34, 197, 94, 0.2); border-color: var(--color-low); color: var(--color-low); }
.hazard-events-sev-chip.minimal.active { background: rgba(148, 163, 184, 0.2); border-color: var(--color-minimal); color: var(--color-minimal); }

.hazard-events-country-trigger {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.78rem;
  cursor: pointer;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hazard-events-country-trigger:hover {
  background: rgba(255, 255, 255, 0.08);
}
.hazard-events-country-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hazard-events-country-trigger:disabled:hover {
  background: rgba(255, 255, 255, 0.04);
}
.hazard-events-country-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}
/* DropdownMenuContent zaten bu app'in koyu temasını taşıyor (bkz.
   AppHeader.vue'nun dil/erişilebilirlik menüleri) — sadece seçili öğenin
   vurgusu bu bileşene özel.
   Kullanıcı bulgusu (2026-08-18, üçüncü geçiş): DropdownMenuContent,
   DropdownMenuPortal üzerinden body'ye teleport ediliyor ve bu app'in
   KENDİ dropdown-menu bileşeninin şablonunda render ediliyor, bu yüzden
   HazardEventsListDialog.vue'nun scoped CSS attribute'unu (data-v-xxxx)
   hiç taşımıyor — ".sınıf :deep(...)" kalıbı hâlâ dıştaki ".sınıf"
   kısmının scope attribute'unu taşımasını ister, tam da bu elemanda
   taşımadığı için hiç eşleşmiyordu. Doğru kalıp: TÜM seçiciyi :deep()
   içine almak. (Yükseklik sınırı artık template'te doğrudan :style ile
   veriliyor — inline style, class tabanlı bir kuraldan/scope
   sorunlarından bağımsız olarak her zaman kazanır, reka-ui'nin kendi
   max-height hesabı trigger'dan viewport altına kadar kalan boşluğu esas
   alıp modal kartının kendi alt sınırından çok daha büyük çıkardığı için
   bu daha güvenilir çözümdü.) */
:deep(.hazard-events-country-menu [data-slot="dropdown-menu-item"].active) {
  background: rgba(33, 150, 243, 0.2);
  color: var(--color-flood);
}

.hazard-events-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px;
}
.hazard-events-empty {
  padding: 40px 0;
  text-align: center;
  color: #94a3b8;
  font-size: 0.85rem;
}
.hazard-events-table {
  width: 100%;
  /* Kullanıcı bulgusu (2026-08-18): OLAY sütunundaki uzun başlıklar
     (Kasırga'nın "Population affected by Category 1..." gibi cümle
     boyundaki açıklamaları) sarıyordu (white-space:normal) ama tablo
     table-layout:auto olduğu için satır yüksekliği buna göre
     büyümüyordu — sonraki satırın hücreleri, sarılan başlığın 2-3.
     satırının ÜZERİNE biniyordu (ekran görüntüsü: yazılar iç içe
     girmiş). table-layout:fixed + sabit sütun genişlikleri, her satırın
     gerçekten kendi yüksekliğine sahip olmasını garantiye alıyor. */
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.hazard-events-table thead th {
  position: sticky;
  top: 0;
  background: #161b26;
  text-align: left;
  color: #94a3b8;
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: uppercase;
  padding: 8px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.hazard-events-table tbody td {
  padding: 8px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* table-layout:fixed altında sütun genişlikleri buradan geliyor —
   OLAY'a en geniş pay, diğerlerine sabit/kompakt genişlikler. Kasırga
   gibi cümle-uzunluğunda başlıklar artık sarmıyor, kesilip "..." ile
   gösteriliyor (title attribute ile tam metin hover'da okunabilir). */
.hazard-events-table th:nth-child(1), .hazard-events-table td:nth-child(1) { width: 90px; }
.hazard-events-table th:nth-child(2), .hazard-events-table td:nth-child(2) { width: auto; }
.hazard-events-table th:nth-child(3), .hazard-events-table td:nth-child(3) { width: 90px; }
.hazard-events-table th:nth-child(4), .hazard-events-table td:nth-child(4) { width: 90px; }
.hazard-events-table th:nth-child(5), .hazard-events-table td:nth-child(5) { width: 140px; }
.hazard-events-title-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hazard-events-sev-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.hazard-events-sev-dot.critical { background: var(--color-critical); }
.hazard-events-sev-dot.high { background: var(--color-high); }
.hazard-events-sev-dot.moderate { background: var(--color-moderate); }
.hazard-events-sev-dot.low { background: var(--color-low); }
.hazard-events-sev-dot.minimal { background: var(--color-minimal); }

.hazard-events-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}
.hazard-events-pagination button {
  min-width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: transparent;
  color: #e2e8f0;
  border-radius: 6px;
  font-size: 0.78rem;
  cursor: pointer;
}
.hazard-events-pagination button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.hazard-events-pagination button.active {
  background: rgba(33, 150, 243, 0.25);
  border-color: var(--color-flood);
}
.hazard-events-pagination button:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.08);
}
.hazard-events-page-gap {
  color: #64748b;
  padding: 0 4px;
}
</style>
