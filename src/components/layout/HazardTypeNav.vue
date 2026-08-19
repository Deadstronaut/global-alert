<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CircleHelp, List } from '@lucide/vue'
import { useDisasterStore } from '@/stores/disaster.js'

// spec 069 Revision 2 (research.md §7): same fixed disaster-type list
// SidebarPanel.vue's accordion already used — NOT useHazardTypesStore()'s
// admin taxonomy. Duplicated here rather than shared/extracted yet since
// SidebarPanel.vue's own copy is removed once its accordion is retired
// (tasks.md T035) — two short-lived copies during migration, not a
// permanent fork.
//
// spec 069 follow-up: labelKey switched from stats.active* ("Aktif
// Deprem") to plain disasters.* ("Deprem") per request — the "Aktif"
// prefix read as a permanent state label even though the store's own
// isLayerActive() is what actually determines whether it's on.
const disasterTypes = [
  { key: 'earthquake', icon: '⛰️', labelKey: 'disasters.earthquake' },
  { key: 'wildfire', icon: '🔥', labelKey: 'disasters.wildfire' },
  { key: 'flood', icon: '🌊', labelKey: 'disasters.flood' },
  { key: 'drought', icon: '🔴', labelKey: 'disasters.drought' },
  { key: 'food_security', icon: '🌾', labelKey: 'disasters.food_security' },
  { key: 'tsunami', icon: '🌊🌊', labelKey: 'disasters.tsunami' },
  { key: 'cyclone', icon: '🌀', labelKey: 'disasters.cyclone' },
  { key: 'volcano', icon: '🌋', labelKey: 'disasters.volcano' },
  { key: 'epidemic', icon: '🦠', labelKey: 'disasters.epidemic' },
  // 2026-08-18: dust_storm/heatwave/coldwave — unlike the 9 above, these
  // have no dedicated table (rows live inside disasterStore.otherDisasters,
  // the generic 'disaster' bucket, see hazard_detector.py/disaster.js's
  // DISASTER_BUCKET_SUBTYPES) so their count/active state below reads from
  // otherDisasters filtered by type instead of STORE_REFS' direct ref
  // lookup. Live-testing request: user explicitly asked for these to be
  // full chips here, not map-only.
  { key: 'dust_storm', icon: '🌪️', labelKey: 'disasters.dust_storm' },
  { key: 'heatwave', icon: '🌡️', labelKey: 'disasters.heatwave' },
  { key: 'coldwave', icon: '🥶', labelKey: 'disasters.coldwave' },
]

const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'minimal']

const disasterStore = useDisasterStore()
const { t } = useI18n()

const emit = defineEmits(['open-quick-page', 'open-events-list'])

// Kullanıcı bulgusu (2026-08-18): bu çipler daha önce disasterStore'un HAM
// per-type referanslarını (earthquakes/wildfires/... veya
// otherDisasters.filter(...)) doğrudan okuyordu — bunlar SÜRE (Süre
// slider'ı, disasterStore.selectedTimeRange), büyüklük/derinlik, aktif
// şiddet filtreleri veya seçili ülke bbox'ından HİÇ etkilenmiyordu; sadece
// o an sunucudan/IndexedDB önbelleğinden ne çekilmişse (zamanla BİRİKEN,
// hiç budanmayan bir küme) onu gösteriyordu — "24 saatten 48 saate
// aldığımda üstteki sayılar değişmiyor, 7500 yangının gerçekten 24 saatte
// olup olmadığını bilmiyorum" şikayeti tam buydu. disasterStore.allEvents
// ZATEN tüm bu filtreleri (süre, büyüklük, derinlik, bbox, dedup, şiddet)
// uyguluyor ve haritadaki işaretçileri de o besliyor — çipler artık
// haritayla birebir aynı, gerçekten filtrelenmiş sayıyı gösteriyor.
const eventsByType = computed(() => {
  const groups = {}
  for (const e of disasterStore.allEvents) {
    ;(groups[e.type] ??= []).push(e)
  }
  return groups
})

// spec 069 follow-up: was sorted by count-then-active (SidebarPanel.vue's
// old accordion behavior), which reordered chips on every toggle/data
// update — user report: a chip you just turned off visibly "jumps to the
// end," making it hard to track what's currently selected, especially with
// several types active at once. Fixed declaration order now; active state
// is shown via each chip's own styling instead of position.
const displayTypes = computed(() =>
  disasterTypes.map((type) => {
    const active = disasterStore.isLayerActive(type.key)
    if (!active) return { ...type, active, count: 0, topSeverity: null }
    const events = eventsByType.value[type.key] ?? []
    const counts = { critical: 0, high: 0, moderate: 0, low: 0, minimal: 0 }
    for (const e of events) {
      if (counts[e.severity] !== undefined) counts[e.severity]++
    }
    const topSeverity = SEVERITY_ORDER.find((s) => counts[s] > 0) ?? null
    return { ...type, active, count: events.length, topSeverity }
  }),
)

// spec 069 follow-up: a plain, independent toggle of that type's map layer
// (no "focus" concept — removed, see HazardSummaryRow.vue's old comment,
// now folded into this file's own history).
function handleClick(key) {
  disasterStore.toggleLayer(key)
}
</script>

<template>
  <nav class="hazard-type-nav glass-panel" :aria-label="t('mainLayout.hazardNav.label')">
    <div
      v-for="hazard in displayTypes"
      :key="hazard.key"
      class="hazard-type-btn"
      :class="{ active: hazard.active }"
      role="button"
      tabindex="0"
      @click="handleClick(hazard.key)"
      @keydown.enter="handleClick(hazard.key)"
      @keydown.space.prevent="handleClick(hazard.key)"
    >
      <div class="hazard-type-top">
        <span class="hazard-type-icon">{{ hazard.icon }}</span>
        <span class="hazard-type-label">{{ t(hazard.labelKey) }}</span>
      </div>
      <!-- Kullanıcı isteği (2026-08-18): "Soğuk Hava Dalgası" gibi çok
           kelimeli isimler tek satırda dar kutucuklarda taşıyordu — sayı +
           zil artık ayrı bir alt satırda, isimle aynı satırı paylaşmıyor. -->
      <div v-if="hazard.active" class="hazard-type-bottom">
        <span class="hazard-type-count" :class="hazard.topSeverity ?? 'none'">{{ hazard.count }}</span>
        <!-- Kullanıcı isteği (2026-08-18): eskiden burada bir zil vardı ve
             "Olay Takibi" (insan-yönetimli SOP/incident sayfası) açıyordu —
             kullanıcı bunun yerine bu hazard type'ın VERİTABANINDAKİ
             GERÇEK olaylarını (büyüklük/kaynak/zaman ile, sayfalı, şiddet
             filtreli) görmek istiyor. Ayrı bir liste ikonu + ayrı bir event
             — HazardEventsListDialog.vue, IncidentsView'dan tamamen
             bağımsız. -->
        <button
          type="button"
          class="hazard-type-bell"
          :title="t('hazardEventsList.openTitle')"
          :aria-label="t('hazardEventsList.openTitle')"
          @click.stop="emit('open-events-list', hazard)"
        >
          <List class="hazard-type-bell-icon" />
        </button>
      </div>
    </div>

    <!-- spec 069 follow-up: Tehlike Ansiklopedisi (Hazard Encyclopedia)
         quick access, per user request placed at the far right of this row
         as a "?" rather than another chip in the main list. Opens the same
         QuickPageDialog the header's icon buttons do. -->
    <button
      type="button"
      class="hazard-type-help-btn"
      :title="t('dashboard.navHazards')"
      :aria-label="t('dashboard.navHazards')"
      @click="emit('open-quick-page', 'hazards')"
    >
      <CircleHelp class="hazard-type-icon" />
    </button>
  </nav>
</template>

<style scoped>
.hazard-type-nav {
  position: relative;
  z-index: var(--z-shell);
  display: flex;
  /* spec 069 follow-up: was center — left visible top/bottom gaps between
     each chip's own (shorter) box and the row's own height, so the row
     read as chips "floating" inside a taller bar rather than one flush
     panel. stretch makes every chip fill the row's full height instead. */
  align-items: stretch;
  /* spec 069 follow-up (second pass): space-between (gaps between
     fixed-width chips) still left it looking sparse/uneven — switched each
     chip to flex:1 1 0 below instead, so N chips always divide the row's
     full width EQUALLY (9 chips → each 1/9th, 20 chips → each 1/20th),
     rather than keeping their natural content width and just spacing out.
     flex-wrap is the fallback for viewports too narrow to fit everything on
     one line; the header's own height is already measured live
     (MainLayout.vue's ResizeObserver), so a wrapped second line doesn't
     break anything downstream. */
  flex-wrap: wrap;
  row-gap: 0;
  /* spec 069 follow-up (third pass): "kendi sanki buton grup gibi" — no
     gap between chips either now; they touch and share borders (see
     .hazard-type-btn's negative margin below), read as one segmented
     control/button-group instead of separate pill buttons with visible
     seams. */
  column-gap: 0;
  /* spec 069 follow-up: no padding around the row itself per request —
     chips now run edge-to-edge with the shell instead of sitting inset
     from it. */
  padding: 0;
  border-left: none;
  border-right: none;
  border-top: none;
}

.hazard-type-btn {
  /* grow/shrink equally, ignoring each other's natural content width
     (flex-basis:0) — this is what makes N chips split the row evenly. */
  flex: 1 1 0;
  /* 2026-08-18: column instead of a single row — icon+isim on top, sayı+zil
     below, so a 2-3 word label (e.g. "Sıcak Hava Dalgası") doesn't have to
     share its already-narrow (1/Nth) width with the count/bell too. */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  /* 2026-08-18 follow-up: lets .hazard-type-label size itself off THIS
     element's own rendered width (cqw units below) instead of the
     viewport's — each chip is a different width (row width / N chips), so
     a viewport-relative unit (vw) would size every chip's text identically
     regardless of how narrow that particular chip actually is. */
  container-type: inline-size;
  border: 1px solid var(--glass-border);
  /* Collapses adjacent borders into one shared 1px line instead of two
     stacked ones — every chip after the first pulls 1px left to sit
     exactly on top of its neighbor's right border. */
  margin-left: -1px;
  background: transparent;
  color: var(--color-text-primary);
  /* spec 069 follow-up (fourth pass): "kartların başındaki sonundaki
     border radius kaldır... tek parça görsün" — no rounding anywhere in
     the group at all now, including the outer ends (was :first-child/
     :last-of-type rounding those before this). */
  border-radius: 0;
  /* Kullanıcı isteği (2026-08-18, ikinci geçiş): 3px fazla sıkışık durdu —
     8px'ten 12px'e çıkarıldı. */
  padding: 5px 12px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background var(--transition-normal), border-color var(--transition-normal);
}

.hazard-type-btn:first-child {
  margin-left: 0;
}

.hazard-type-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  /* Kullanıcı isteği (2026-08-18): "Soğuk Hava Dalgası" gibi isimler o
     satıra sığsın — .hazard-type-label'ın kendi container-query font-size'ı
     bunu tek satırda otomatik küçülterek sağlıyor, sarma artık son çare
     değil (ellipsis) bile normalde hiç tetiklenmemesi beklenir. */
  text-align: center;
  line-height: 1.4;
}

.hazard-type-label {
  min-width: 0;
  /* Auto-shrinks/grows with the chip's OWN width (container query units,
     not viewport units) — "Soğuk Hava Dalgası" on a narrow chip (many
     hazard types active at once) scales down to still fit its single line;
     a wide chip (few types) scales back up, capped at the original
     0.85rem so it never grows past the nav's normal reading size. No JS
     measuring/resize-observer needed, degrades gracefully to the fixed
     0.85rem on browsers without container query units (Safari <16). */
  font-size: clamp(0.62rem, 10.5cqw, 0.85rem);
  /* Kullanıcı bulgusu (2026-08-18): 1.15'lik sıkı line-height, overflow:
     hidden ile birleşince alçak harflerin (g, ğ, y, ç kuyruğu) alt kısmını
     kırpıyordu — 1.4'e çıkarıldı, satırın kendisi artık descender'a yer
     bırakıyor, overflow:hidden sadece gerçek taşmayı (yatay/ellipsis) kesiyor. */
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.hazard-type-bottom {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.hazard-type-icon {
  font-size: 0.9rem;
  flex: none;
}

.hazard-type-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.hazard-type-btn.active {
  background: rgba(33, 150, 243, 0.25);
  border-color: var(--color-flood);
}

/* spec 069 follow-up: count badge + bell, folded in from the now-removed
   HazardSummaryRow.vue — only rendered while the chip is active. */
.hazard-type-count {
  font-weight: 700;
  font-size: 0.8rem;
}

.hazard-type-count.critical { color: var(--color-critical); }
.hazard-type-count.high { color: var(--color-high); }
.hazard-type-count.moderate { color: var(--color-moderate); }
.hazard-type-count.low { color: var(--color-low); }
.hazard-type-count.minimal { color: var(--color-minimal); }
.hazard-type-count.none { opacity: 0.5; }

.hazard-type-bell {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  opacity: 0.7;
  cursor: pointer;
  padding: 2px;
}

.hazard-type-bell:hover {
  opacity: 1;
}

.hazard-type-bell-icon {
  width: 14px;
  height: 14px;
}

/* Fixed-size, unlike the chips above (flex:1 1 0) — this is a single icon
   button, not part of the "N chips split the row evenly" group, and
   staying flex:none is what keeps it pinned exactly at the row's right
   edge as the chips grow/shrink around it. */
.hazard-type-help-btn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  /* spec 069 follow-up (fourth pass): now joins the chip group as its
     visual last piece instead of sitting apart — same border-collapse
     margin trick as the chips, no rounding, so the whole row (chips + "?")
     reads as one continuous flush bar. */
  align-self: stretch;
  margin-left: -1px;
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-text-primary);
  border-radius: 0;
  cursor: pointer;
  transition: background var(--transition-normal);
}

.hazard-type-help-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>
