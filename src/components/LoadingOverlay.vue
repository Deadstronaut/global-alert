<script setup>
import { watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimatedEarthLogo from '@/components/AnimatedEarthLogo.vue'

const { t } = useI18n()

// Full-screen "please wait" overlay for pages/panels with a slow fetch
// (e.g. SheltersPanel.vue's 12k+ row load) — distinct from LoadingScreen.vue,
// which is the one-time app-boot screen. This one is meant to be dropped
// into any view: pass `:visible="store.loading"` and it blocks the whole
// screen (a full-viewport backdrop swallows clicks) until that flips false.
// The only way out while it's up is ESC, which emits `cancel` — the parent
// decides what "cancel" means (e.g. navigate back to the map) since a
// generic overlay has no way to abort the underlying fetch itself.
const props = defineProps({
  visible: { type: Boolean, default: false },
  message: { type: String, default: '' },
})
const emit = defineEmits(['cancel'])

function handleKeydown(e) {
  if (e.key === 'Escape' && props.visible) emit('cancel')
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) document.addEventListener('keydown', handleKeydown)
    else document.removeEventListener('keydown', handleKeydown)
  },
  { immediate: true },
)
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Transition name="loading-overlay-fade">
    <div v-if="visible" class="loading-overlay" @click.stop @wheel.prevent @touchmove.prevent>
      <!-- Same rotating-earth sprite as LoadingScreen.vue / the app header /
           login screen (AnimatedEarthLogo.vue) — replaces the old
           Uiverse.io flat-cartoon globe so every loading surface in the app
           uses one consistent visual. -->
      <div class="earth">
        <AnimatedEarthLogo :size="120" />
        <p>{{ message || t('common.loadingEllipsis') }}</p>
      </div>
      <p class="loading-overlay-hint">{{ t('common.pressEscToCancel') }}</p>
    </div>
  </Transition>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(5, 7, 14, 0.72);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  cursor: wait;
}

.loading-overlay-fade-enter-active,
.loading-overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}
.loading-overlay-fade-enter-from,
.loading-overlay-fade-leave-to {
  opacity: 0;
}

.loading-overlay-hint {
  color: var(--color-text-muted, #94a3b8);
  font-size: 0.82rem;
  margin: 0;
}

/* The original Uiverse.io markup never actually needed this — its demo
   message ("Connecting...") happened to be narrow enough that the block-
   level <p> below .earth-loader stayed roughly as wide as the 7.5em globe.
   A real dataset name ("Nüfus (Meta/HDX) (Türkiye) yükleniyor...") is much
   wider, and without an explicit centering rule .earth (a plain block, no
   layout of its own) sizes to that wider paragraph's content width while
   .earth-loader — a fixed 7.5em block with no auto margins — stays pinned
   to the left edge of that now-wider box instead of centering under the
   text. flex + column here makes both children center on the same axis
   regardless of how long the message gets. */
.earth {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.earth p {
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding-top: 0.25em;
  font-size: 1.25em;
  font-family:
    'Gill Sans',
    'Gill Sans MT',
    Calibri,
    'Trebuchet MS',
    sans-serif;
}

</style>
