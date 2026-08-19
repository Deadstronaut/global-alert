<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import HazardTypeNav from '@/components/layout/HazardTypeNav.vue'
import FooterStatusRow from '@/components/layout/FooterStatusRow.vue'
import DateScrubberFooter from '@/components/layout/DateScrubberFooter.vue'
import QuickPageDialog from '@/components/layout/QuickPageDialog.vue'
import HazardEventsListDialog from '@/components/layout/HazardEventsListDialog.vue'

const route = useRoute()

// spec 069 follow-up: CAP/Olay Takibi/Sığınaklar/Vatandaş Bildirimi (header)
// and Tehlike Ansiklopedisi (hazard-nav row's "?") open as a dialog over the
// map instead of navigating away from it — shared state here since both
// AppHeader and HazardTypeNav trigger the same dialog.
const quickPageOpen = ref(null)
watch(() => route.name, () => { quickPageOpen.value = null })

// 2026-08-18: HazardTypeNav's per-chip list icon opens THIS dialog instead
// (the hazard type's own raw database events — see HazardEventsListDialog.vue's
// own header comment for why it's separate from quickPageOpen's 'incidents').
const eventsListHazard = ref(null)
watch(() => route.name, () => { eventsListHazard.value = null })

// Exposes both chrome stacks' real rendered height as global CSS custom
// properties, so deeply-nested routed content (MapView.vue's own
// absolutely/fixed-positioned overlays — search bar row, download button,
// severity legend, radar trigger, basemap picker) can clear them via
// `position: fixed; top/bottom: calc(var(--shell-header-height /
// --shell-footer-height) + Npx)` WITHOUT depending on percentage-height
// cascading correctly through several nested divs (home-view ->
// map-container -> map-view-wrapper), which live-testing showed can go
// stale (MapLibre reads its container's box once near mount and doesn't
// reliably get told to recompute it — see MapView.vue's own
// containerResizeObserver comment for the same class of bug on the canvas
// itself). A plain measured pixel value is the one thing that can't drift
// out of sync with what's actually on screen.
const headerChromeEl = ref(null)
const footerChromeEl = ref(null)
let headerResizeObserver = null
let footerResizeObserver = null

function observeChrome(el, cssVar) {
  if (!el) return null
  const setVar = () => document.documentElement.style.setProperty(cssVar, `${el.offsetHeight}px`)
  setVar()
  const observer = new ResizeObserver(setVar)
  observer.observe(el)
  return observer
}

onMounted(() => {
  headerResizeObserver = observeChrome(headerChromeEl.value, '--shell-header-height')
  footerResizeObserver = observeChrome(footerChromeEl.value, '--shell-footer-height')
})

onBeforeUnmount(() => {
  headerResizeObserver?.disconnect()
  footerResizeObserver?.disconnect()
})
</script>

<template>
  <div class="main-layout">
    <div class="main-layout-chrome" ref="headerChromeEl">
      <AppHeader @open-quick-page="quickPageOpen = $event" />
      <HazardTypeNav @open-quick-page="quickPageOpen = $event" @open-events-list="eventsListHazard = $event" />
    </div>

    <div class="main-layout-content">
      <router-view />
    </div>

    <div class="main-layout-chrome" ref="footerChromeEl">
      <FooterStatusRow />
      <DateScrubberFooter />
    </div>

    <QuickPageDialog :page-id="quickPageOpen" @close="quickPageOpen = null" />
    <HazardEventsListDialog
      :hazard-type="eventsListHazard?.key ?? null"
      :icon="eventsListHazard?.icon ?? ''"
      :label-key="eventsListHazard?.labelKey ?? ''"
      @close="eventsListHazard = null"
    />
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  /* Hard enforcement, not just a hint: whatever the routed page renders
     inside .main-layout-content (e.g. MapView.vue's own absolutely-
     positioned overlays computing their own height/position) can never
     visually bleed into the header/footer chrome's space, even if some
     percentage-height chain inside the page underestimates/overestimates
     its real box — matches the user's own diagnosis ("sınırları header ve
     footer'ın yerinde olmalı"): the boundary is enforced here, at the one
     place that knows the true, final pixel split between chrome and
     content, rather than trusted to cascade correctly through several
     nested 100%-height divs inside the routed page. */
  overflow: hidden;
}

/* flex-shrink:0 on both chrome stacks — the routed content area is the
   only thing that should ever give up space under real constraint (its
   own min-height:0 already permits that); header/hazard-nav/focus row and
   the two footer rows keep their natural content height unconditionally. */
.main-layout-chrome {
  flex: none;
  display: flex;
  flex-direction: column;
}

.main-layout-content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
