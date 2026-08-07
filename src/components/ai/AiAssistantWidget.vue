<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useAiAssistanceStore } from '@/stores/aiAssistance.js'
import { supabase } from '@/services/api/config.js'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Spec 051 (revised again, per user request) — single global floating
// entry point for all user-triggered AI capabilities. Opens a small,
// corner-anchored chat popup right next to the button (NOT a full side
// panel/Sheet — the app already uses side panels heavily elsewhere, so a
// second one felt crowded). The chat supports both guided flows (pick a
// task -> pick an item -> review a suggestion, still entity-bound and
// still requiring an explicit approve/reject, FR-004) AND free-form typed
// messages answered by ai-chat, which is purely conversational and never
// writes anything (see aiProvider.ts's CHAT_SYSTEM_PROMPT and ai-chat's
// header comment).
const route = useRoute()
const { t, locale: uiLocale } = useI18n()
const auth = useAuthStore()
const aiAssistance = useAiAssistanceStore()

const open = ref(false)
const translateEnabled = ref(false)
const summarizeEnabled = ref(false)

// super_admin accounts commonly have no fixed country_code of their own —
// fall back to whatever country was last configured in AdminView's "AI
// Yardımı" panel (AiCapabilityTogglePanel.vue writes the same key), so
// enabling a capability there actually makes the chat button light up
// instead of silently finding nothing enabled.
// super_admin bypasses the actual enabled-check server-side regardless of
// which country_code is sent (it's a required field, not a real permission
// check for that role) — so a fixed default removes the friction of
// localStorage being per-origin (a value set on one host/port doesn't
// carry over to another) for the one role where the value barely matters.
const effectiveCountryCode = computed(
  () => auth.countryCode || localStorage.getItem('aiAssistantCountryCode') || (auth.isSuperAdmin ? 'tr' : null),
)

async function loadCapabilities() {
  // Rule: super_admin always has everything open, regardless of any
  // country's toggle state (matches the same super_admin bypass enforced
  // server-side in ai-translate/ai-summarize/ai-chat/ai-classify-photo).
  if (auth.isSuperAdmin) {
    translateEnabled.value = true
    summarizeEnabled.value = true
    return
  }
  if (!effectiveCountryCode.value) return
  const caps = await aiAssistance.fetchCapabilities(effectiveCountryCode.value)
  translateEnabled.value = caps.translate === true
  summarizeEnabled.value = caps.summarize === true
}

onMounted(loadCapabilities)

const PAGE_TASKS = {
  cap: [{ capability: 'translate', table: 'cap_drafts', labelKey: 'aiAssistant.taskTranslateDraft' }],
  incidents: [{ capability: 'summarize', table: 'incidents', labelKey: 'aiAssistant.taskSummarizeIncident' }],
}
const LOCALES = ['en', 'tr', 'es', 'fr', 'ru', 'ar', 'zh']

const pageTasks = computed(() => PAGE_TASKS[route.name] || [])
const availableTasks = computed(() =>
  pageTasks.value.filter((task) => (task.capability === 'translate' ? translateEnabled.value : summarizeEnabled.value)),
)
const allDisabledHere = computed(() => pageTasks.value.length > 0 && availableTasks.value.length === 0)
const chatAvailable = computed(() => translateEnabled.value || summarizeEnabled.value)
const visible = computed(() => !!auth.session)

// ── Drag-to-reposition (unchanged) ──────────────────────────────────────
const EDGE_MARGIN = 20
const FAB_SIZE = 58
const CORNER_STYLE = {
  'bottom-right': { right: `${EDGE_MARGIN}px`, bottom: `${EDGE_MARGIN}px`, left: 'auto', top: 'auto' },
  'bottom-left': { left: `${EDGE_MARGIN}px`, bottom: `${EDGE_MARGIN}px`, right: 'auto', top: 'auto' },
  'top-right': { right: `${EDGE_MARGIN}px`, top: `${EDGE_MARGIN}px`, left: 'auto', bottom: 'auto' },
  'top-left': { left: `${EDGE_MARGIN}px`, top: `${EDGE_MARGIN}px`, right: 'auto', bottom: 'auto' },
}
const corner = ref(localStorage.getItem('aiAssistantCorner') || 'bottom-right')
const dragStyle = ref(null)
const dragging = ref(false)
const containerStyle = computed(() => dragStyle.value || CORNER_STYLE[corner.value])
const isTopCorner = computed(() => corner.value.startsWith('top'))
const isLeftCorner = computed(() => corner.value.endsWith('left'))

let dragStartX = 0
let dragStartY = 0
let dragMoved = false
const DRAG_THRESHOLD_PX = 6

function onFabPointerDown(e) {
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragMoved = false
  dragging.value = true
  e.currentTarget.setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onFabPointerMove)
  window.addEventListener('pointerup', onFabPointerUp)
}

function onFabPointerMove(e) {
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  if (!dragMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) dragMoved = true
  if (!dragMoved) return
  const left = Math.min(Math.max(e.clientX - FAB_SIZE / 2, 0), window.innerWidth - FAB_SIZE)
  const top = Math.min(Math.max(e.clientY - FAB_SIZE / 2, 0), window.innerHeight - FAB_SIZE)
  dragStyle.value = { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' }
}

function onFabPointerUp(e) {
  window.removeEventListener('pointermove', onFabPointerMove)
  window.removeEventListener('pointerup', onFabPointerUp)
  dragging.value = false
  if (dragMoved) {
    const snapRight = e.clientX > window.innerWidth / 2
    const snapBottom = e.clientY > window.innerHeight / 2
    corner.value = `${snapBottom ? 'bottom' : 'top'}-${snapRight ? 'right' : 'left'}`
    localStorage.setItem('aiAssistantCorner', corner.value)
    dragStyle.value = null
  } else {
    open.value = !open.value
    if (open.value && log.value.length === 0) startConversation()
  }
  dragMoved = false
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onFabPointerMove)
  window.removeEventListener('pointerup', onFabPointerUp)
})

// ── Chat conversation ────────────────────────────────────────────────────
const log = ref([])
let bubbleSeq = 0
function pushBubble(role, text, extra = {}) {
  const bubble = { id: ++bubbleSeq, role, text, ...extra }
  log.value.push(bubble)
  return bubble
}

// The free NVIDIA endpoint can genuinely take anywhere from a couple
// seconds up to ~30-40s to answer (confirmed live: 11s, 26s, 32s across
// three back-to-back requests) — long enough that a single static "loading"
// state reads as broken. Three stages instead: 0-3s the animated rune
// "thinking" loader, 3-7s a plain "waiting on the server" line, 7s+ a
// rotating pool of silly waiting-room messages — each one plays the SAME
// scramble/unscramble effect as the stage-1 loader (letters glitching into
// rune glyphs and back), sağa-sola (forward then backward) twice, settles
// as plain readable text for a beat, then swaps to the next message.
const FUN_WAIT_MESSAGES = [
  '☕ Kahve demleniyor...', '🧘 Yoga yapılıyor...', '🎵 Müzik dinleniyor...', '🌸 Çiçekler sulanıyor...',
  '🥁 Bateri çalınıyor...', '🍕 Pizza ısıtılıyor...', '🐌 Salyangozlar yarıştırılıyor...', '🛰️ Uydularla konuşuluyor...',
  '🧩 Bulmaca çözülüyor...', '🐢 Kaplumbağa hızlandırılmaya çalışılıyor...', '🎨 Tuvale renk sürülüyor...', '📚 Kitap okunuyor...',
  '🍜 Çorba karıştırılıyor...', '🧵 İğneden iplik geçiriliyor...', '🚀 Roketler ısıtılıyor...', '🐝 Arılar toplanıyor...',
  '🎲 Zar atılıyor...', '🧠 Beyin fırtınası yapılıyor...', '🐙 Ahtapot 8 koldan birden yazıyor...', '🔋 Piller şarj ediliyor...',
  '🌙 Ay\'a bakılıyor...', '🪄 Sihir yapılıyor...', '🦄 Tek boynuzlu at aranıyor...', '🎯 Hedef tahtası hazırlanıyor...',
  '🧊 Buzlar eritiliyor...', '🐧 Penguenler sıraya diziliyor...', '🎈 Balonlar şişiriliyor...', '📡 Anten ayarlanıyor...',
  '🧶 Yün yumağı çözülüyor...', '🍳 Yumurta kırılıyor...', '🚲 Bisiklet pompalanıyor...', '🧃 Meyve suyu sıkılıyor...',
  '🎻 Keman akort ediliyor...', '🐿️ Sincap fındık topluyor...', '🛸 UFO\'lar taranıyor...', '🧦 Çorap eşleştiriliyor...',
  '🌊 Dalgalar sayılıyor...', '🕰️ Saat kuruluyor...', '🍄 Mantar aranıyor...', '🦋 Kelebekler kovalanıyor...',
]
const RUNE_POOL = ['⌰', '⍜', '⏃', '⎅', '⟟', '⋏', '☌', '⟒', '⏁', '⋔', '⎍', '⏚', '⚍', '⟁']
const SCRAMBLE_LEAD_CHARS = 10 // only the first N chars glitch, keeps the beat short regardless of message length
const SCRAMBLE_STEP_MS = 80
const SCRAMBLE_SWEEPS = 2 // "iki kere sağa sola" — 2 full there-and-back sweeps
const READ_HOLD_MS = 1100 // how long the fully-unscrambled message sits still before the next one starts
const STAGE2_AT_MS = 3000 // "düşünüyor" -> "sunucudan cevap bekleniyor"
const STAGE3_AT_MS = 7000 // "sunucudan cevap bekleniyor" -> rotating fun messages
const activeLoadingCleanups = new Set()

function pickFunMessage(exclude) {
  let msg = FUN_WAIT_MESSAGES[Math.floor(Math.random() * FUN_WAIT_MESSAGES.length)]
  if (FUN_WAIT_MESSAGES.length > 1) {
    while (msg === exclude) msg = FUN_WAIT_MESSAGES[Math.floor(Math.random() * FUN_WAIT_MESSAGES.length)]
  }
  return msg
}

// frames[0] = fully readable text ... frames[N] = first SCRAMBLE_LEAD_CHARS
// replaced with rune glyphs, one more character corrupted per frame.
function buildScrambleFrames(text) {
  const chars = [...text]
  const leadCount = Math.min(SCRAMBLE_LEAD_CHARS, chars.length)
  const frames = [text]
  for (let k = 1; k <= leadCount; k++) {
    frames.push(chars.map((c, i) => (i < k ? RUNE_POOL[i % RUNE_POOL.length] : c)).join(''))
  }
  return frames
}

// Starts the staged waiting UI on a bubble and returns a stop() function —
// call stop() as soon as the real result arrives (success OR failure) to
// cancel any pending timers/loops and clear the transient waiting state.
// bubble.stage: 'thinking' | 'waiting' | 'fun'
function startLoadingSequence(bubble) {
  bubble.stage = 'thinking'
  bubble.waitText = null
  let stopped = false
  let activeTimer = null

  const stage2Timer = setTimeout(() => {
    bubble.stage = 'waiting'
    bubble.waitText = t('aiAssistant.waitingServer')
  }, STAGE2_AT_MS)

  function runFunCycle() {
    if (stopped) return
    bubble.stage = 'fun'
    const message = pickFunMessage(bubble.waitText)
    const frames = buildScrambleFrames(message)
    const lastIdx = frames.length - 1
    let sweep = 0
    let idx = 0
    let direction = 1
    bubble.waitText = frames[0]

    activeTimer = setInterval(() => {
      idx += direction
      if (idx >= lastIdx) {
        direction = -1
        idx = lastIdx
      } else if (idx <= 0) {
        idx = 0
        direction = 1
        sweep += 1
        if (sweep >= SCRAMBLE_SWEEPS) {
          clearInterval(activeTimer)
          bubble.waitText = message
          activeTimer = setTimeout(runFunCycle, READ_HOLD_MS)
          return
        }
      }
      bubble.waitText = frames[idx]
    }, SCRAMBLE_STEP_MS)
  }

  const stage3Timer = setTimeout(runFunCycle, STAGE3_AT_MS)

  const stop = () => {
    stopped = true
    clearTimeout(stage2Timer)
    clearTimeout(stage3Timer)
    clearTimeout(activeTimer)
    clearInterval(activeTimer)
    bubble.stage = null
    bubble.waitText = null
    activeLoadingCleanups.delete(stop)
  }
  activeLoadingCleanups.add(stop)
  return stop
}

onUnmounted(() => {
  activeLoadingCleanups.forEach((stop) => stop())
})

const activeTask = ref(null)
const targetLocale = ref(null)
const draftMessage = ref('')
const sending = ref(false)
const scrollEl = ref(null)

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

function startConversation() {
  log.value = []
  activeTask.value = null
  targetLocale.value = null
  bubbleSeq = 0
  if (allDisabledHere.value) {
    pushBubble('assistant', t('ai.capabilityDisabled'))
    return
  }
  const greeting = availableTasks.value.length ? t('aiAssistant.greeting') : t('aiAssistant.greetingChatOnly')
  pushBubble('assistant', greeting, {
    options: availableTasks.value.map((task) => ({ label: t(task.labelKey), action: () => chooseTask(task) })),
  })
}

function clearLastOptions() {
  const last = log.value[log.value.length - 1]
  if (last) delete last.options
}

function chooseTask(task) {
  clearLastOptions()
  pushBubble('user', t(task.labelKey))
  activeTask.value = task
  if (task.capability === 'translate') {
    pushBubble('assistant', t('aiAssistant.askLocale'), {
      options: LOCALES.map((code) => ({ label: code.toUpperCase(), action: () => chooseLocale(code) })),
    })
  } else {
    askForItem()
  }
  scrollToBottom()
}

function chooseLocale(code) {
  clearLastOptions()
  pushBubble('user', code.toUpperCase())
  targetLocale.value = code
  askForItem()
  scrollToBottom()
}

async function askForItem() {
  const loadingBubble = pushBubble('assistant', '')
  const stopLoading = startLoadingSequence(loadingBubble)
  scrollToBottom()
  const task = activeTask.value
  const { data } = await supabase
    .from(task.table)
    .select('id, title, description' + (task.table === 'cap_drafts' ? ', lang' : ''))
    .order('created_at', { ascending: false })
    .not('description', 'is', null)
    .limit(10)
  const rows = (data || []).filter((row) => (row.description || '').trim())
  stopLoading()
  loadingBubble.text = rows.length ? t('aiAssistant.askItem') : t('aiAssistant.noItems')
  if (rows.length) {
    loadingBubble.options = rows.map((row) => ({ label: row.title || row.id, action: () => chooseItem(row) }))
  }
  scrollToBottom()
}

async function chooseItem(item) {
  clearLastOptions()
  pushBubble('user', item.title || item.id)
  if (!effectiveCountryCode.value) {
    pushBubble('assistant', t('aiAssistant.noCountryContext'))
    scrollToBottom()
    return
  }
  const workingBubble = pushBubble('assistant', '')
  const stopLoading = startLoadingSequence(workingBubble)
  scrollToBottom()

  const task = activeTask.value
  const result =
    task.capability === 'translate'
      ? await aiAssistance.requestTranslation(
          task.table,
          item.id,
          item.description,
          item.lang || uiLocale.value || 'en',
          targetLocale.value,
          effectiveCountryCode.value,
        )
      : await aiAssistance.requestSummary(task.table, item.id, item.description, effectiveCountryCode.value)

  stopLoading()
  if (!result.success) {
    workingBubble.text = t('ai.unavailable')
    scrollToBottom()
    return
  }

  workingBubble.text = result.aiOutput.translated_text || result.aiOutput.summary_text
  workingBubble.suggestion = { id: result.suggestionId, ai_output: result.aiOutput }
  workingBubble.options = [
    { label: t('ai.approve'), variant: 'default', action: () => resolveSuggestion(workingBubble, 'approved') },
    { label: t('ai.reject'), variant: 'outline', action: () => resolveSuggestion(workingBubble, 'rejected') },
  ]
  scrollToBottom()
}

async function resolveSuggestion(bubble, status) {
  delete bubble.options
  await aiAssistance.resolveSuggestion(bubble.suggestion.id, {
    status,
    finalOutput: status === 'approved' ? bubble.suggestion.ai_output : null,
  })
  pushBubble('assistant', status === 'approved' ? t('aiAssistant.approvedFollowUp') : t('aiAssistant.rejectedFollowUp'), {
    options: availableTasks.value.map((task) => ({ label: t(task.labelKey), action: () => chooseTask(task) })),
  })
  activeTask.value = null
  targetLocale.value = null
  scrollToBottom()
}

// Free-form typed message -> ai-chat (purely conversational, no entity, no
// approve/reject — see aiAssistance.js's sendChatMessage docstring).
async function sendFreeText() {
  const text = draftMessage.value.trim()
  if (!text || sending.value || !chatAvailable.value) return
  draftMessage.value = ''
  pushBubble('user', text)
  if (!effectiveCountryCode.value) {
    // country_code is a required field server-side (ai-chat/index.ts) — a
    // missing value here means neither this account's own country nor an
    // admin-configured country was ever found in THIS browser (localStorage
    // is per-origin, so a value set while testing on another host/port
    // won't carry over). Surface it as a clear chat message instead of
    // letting the request 400 silently.
    pushBubble('assistant', t('aiAssistant.noCountryContext'))
    scrollToBottom()
    return
  }
  const history = log.value
    .filter((b) => !b.options || b.role === 'user')
    .map((b) => ({ role: b.role, content: b.text }))
  const workingBubble = pushBubble('assistant', '')
  const stopLoading = startLoadingSequence(workingBubble)
  sending.value = true
  scrollToBottom()
  const result = await aiAssistance.sendChatMessage(history, effectiveCountryCode.value)
  sending.value = false
  stopLoading()
  workingBubble.text = result.success ? result.reply : t('ai.unavailable')
  scrollToBottom()
}

watch(open, async (isOpen) => {
  // Re-check capabilities every time the panel is opened, not just once at
  // mount time — avoids a stale/empty result if auth.session or the
  // AdminView-configured country wasn't ready yet when this component first
  // mounted (a plain onMounted-only load never re-ran after that).
  if (isOpen) {
    await loadCapabilities()
    if (log.value.length === 0) startConversation()
  }
})
watch(() => route.name, () => {
  if (open.value) startConversation()
})
</script>

<template>
  <div
    v-if="visible"
    class="ai-assistant-widget"
    :class="{ 'ai-assistant-widget--dragging': dragging }"
    :style="containerStyle"
  >
    <button
      type="button"
      class="ai-assistant-widget__fab orb-container"
      aria-label="Deadstro"
      @pointerdown="onFabPointerDown"
    >
      <span class="orb">
        <span class="orb-inner"></span>
        <span class="orb-inner"></span>
      </span>
      <img src="/deadstro1.png" alt="" class="ai-assistant-widget__icon" />
    </button>

    <Transition name="flow-panel-expand">
      <div
        v-if="open"
        class="ai-assistant-widget__panel"
        :class="{ 'ai-assistant-widget__panel--top': isTopCorner, 'ai-assistant-widget__panel--left': isLeftCorner }"
      >
        <div class="ai-assistant-widget__header">
          <Avatar class="ai-assistant-widget__headerAvatar">
            <AvatarImage src="/deadstro1.png" alt="" class="object-cover" />
            <AvatarFallback>AI</AvatarFallback>
          </Avatar>
          <button type="button" class="ai-assistant-widget__close" @click="open = false">✕</button>
        </div>

        <div ref="scrollEl" class="ai-assistant-widget__messages">
          <div
            v-for="bubble in log"
            :key="bubble.id"
            class="ai-assistant-widget__row"
            :class="bubble.role === 'user' ? 'ai-assistant-widget__row--user' : 'ai-assistant-widget__row--assistant'"
          >
            <Avatar v-if="bubble.role === 'assistant'" class="size-6 shrink-0">
              <AvatarImage src="/deadstro1.png" alt="" />
              <AvatarFallback>AI</AvatarFallback>
            </Avatar>
            <div class="ai-assistant-widget__col">
              <div
                class="ai-assistant-widget__bubble"
                :class="bubble.role === 'user' ? 'ai-assistant-widget__bubble--user' : 'ai-assistant-widget__bubble--assistant'"
              >
                <span v-if="bubble.stage === 'thinking'" class="ai-loader" aria-label="Loading"></span>
                <span v-else-if="bubble.stage === 'fun'" class="ai-assistant-widget__scramble">{{ bubble.waitText }}</span>
                <span v-else-if="bubble.waitText" class="ai-assistant-widget__waitText">{{ bubble.waitText }}</span>
                <template v-else>{{ bubble.text }}</template>
              </div>
              <div v-if="bubble.options?.length" class="ai-assistant-widget__chips">
                <Button
                  v-for="(opt, idx) in bubble.options"
                  :key="idx"
                  type="button"
                  size="sm"
                  :variant="opt.variant || 'secondary'"
                  @click="opt.action"
                >
                  {{ opt.label }}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <form class="ai-assistant-widget__inputRow" @submit.prevent="sendFreeText">
          <Input
            v-model="draftMessage"
            :disabled="!chatAvailable || sending"
            :placeholder="chatAvailable ? t('aiAssistant.typePlaceholder') : t('ai.capabilityDisabled')"
          />
          <Button type="submit" size="sm" :disabled="!chatAvailable || sending || !draftMessage.trim()">
            {{ t('aiAssistant.send') }}
          </Button>
        </form>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Snap-to-corner glide: fast at first, strongly decelerating over the last
   ~60-80px so landing in the corner reads as "settling", not a hard cut.
   Disabled while actively dragging (--dragging) so the button tracks the
   pointer/finger with zero lag. */
.ai-assistant-widget {
  position: fixed;
  z-index: 999999;
  transition: left 0.55s cubic-bezier(0.16, 1, 0.3, 1), top 0.55s cubic-bezier(0.16, 1, 0.3, 1),
    right 0.55s cubic-bezier(0.16, 1, 0.3, 1), bottom 0.55s cubic-bezier(0.16, 1, 0.3, 1);
}
.ai-assistant-widget--dragging { transition: none; }
.ai-assistant-widget--dragging .ai-assistant-widget__fab { cursor: grabbing; }

/* Custom assistant orb — Uiverse.io orb (by narmesh_sah), scaled down from
   its original 200px to a 58px floating-action-button size, with
   /public/deadstro1.png (transparent-background icon) layered on top,
   centered, as the actual "mascot" mark. */
.ai-assistant-widget__fab.orb-container {
  position: relative;
  width: 58px;
  height: 58px;
  border: none;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  border-radius: 50%;
  rotate: 90deg;
  cursor: pointer;
  filter: drop-shadow(0 0 4px #ff3e1c88) drop-shadow(0 0 4px #1c8cff88);
  transition: all 0.3s ease;
  background: #060606;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.ai-assistant-widget__fab.orb-container:hover {
  filter: drop-shadow(0 0 6px #ff3e1cbb) drop-shadow(0 0 6px #1c8cffbb);
}

.orb {
  position: absolute;
  width: 58px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #060606;
  filter: blur(7px);
  transition: all 0.3s ease;
}
.orb-container:hover .orb {
  width: 64px;
  animation: ai-orb-rotate 6s infinite;
}

.orb-inner {
  position: absolute;
  left: -120%;
  top: -25%;
  width: 160%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #ff3e1c;
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  animation: ai-orb-rotate 6s linear infinite;
  transition: all 0.3s ease;
}
.orb-inner:nth-child(2) {
  left: auto;
  right: -120%;
  top: auto;
  bottom: -25%;
  background: #1c8cff;
  animation-duration: 8s;
  clip-path: polygon(20% 0%, 0% 20%, 30% 50%, 0% 80%, 20% 100%, 50% 70%, 80% 100%, 100% 80%, 70% 50%, 100% 20%, 80% 0%, 50% 30%);
}
.orb-container:hover .orb .orb-inner { width: 170%; }

@keyframes ai-orb-rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.ai-assistant-widget__icon {
  position: relative;
  z-index: 1;
  width: 66%;
  height: 66%;
  object-fit: contain;
  rotate: -90deg; /* counter the .orb-container's 90deg so the icon stays upright */
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.6));
}

/* ── Compact chat popup, anchored to the fab's corner ─────────────────── */
.ai-assistant-widget__panel {
  position: absolute; right: 0; bottom: calc(100% + 10px);
  width: 340px; height: 460px; max-height: 70vh;
  display: flex; flex-direction: column;
  background: #161b26; border: 1px solid rgba(255,255,255,.12); border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,.5); color: #e2e8f0; overflow: hidden;
  transform-origin: bottom right;
}
.ai-assistant-widget__panel--top { bottom: auto; top: calc(100% + 10px); transform-origin: top right; }
.ai-assistant-widget__panel--left { right: auto; left: 0; }
.ai-assistant-widget__panel--top.ai-assistant-widget__panel--left { transform-origin: top left; }
.ai-assistant-widget__panel--left:not(.ai-assistant-widget__panel--top) { transform-origin: bottom left; }

/* Same calm fade+scale expand used across the app's other flyout panels
   (FlowControlPanel.vue's wind/currents panel, MapView.vue's shelters and
   exposure-layers panels) — duplicated here since Vue's scoped CSS doesn't
   cross component boundaries (live-testing ask, 2026-08-05: "asistanın
   chat box'ının açılışını da aynı şekilde yap"). */
.flow-panel-expand-enter-active,
.flow-panel-expand-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.flow-panel-expand-enter-from,
.flow-panel-expand-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

.ai-assistant-widget__header {
  display: flex; align-items: center; justify-content: center; position: relative;
  padding: 14px 12px; border-bottom: 1px solid rgba(255,255,255,.1); flex: 0 0 auto;
}
/* Deliberately larger than the usual avatar size so deadstro1.png's
   artwork has room to actually be legible instead of being squeezed into
   a tiny circle (user feedback) — the header grows to fit it, no text
   label crammed in alongside it. */
.ai-assistant-widget__headerAvatar { width: 64px; height: 64px; flex: 0 0 auto; }
.ai-assistant-widget__close {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1rem;
}

.ai-assistant-widget__messages { flex: 1 1 auto; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.ai-assistant-widget__row { display: flex; align-items: flex-end; gap: 8px; }
.ai-assistant-widget__row--user { flex-direction: row-reverse; }
.ai-assistant-widget__col { display: flex; flex-direction: column; gap: 6px; max-width: 82%; }
.ai-assistant-widget__row--user .ai-assistant-widget__col { align-items: flex-end; margin-left: auto; }

.ai-assistant-widget__bubble { border-radius: 14px; padding: 8px 12px; font-size: .82rem; white-space: pre-wrap; line-height: 1.4; }
.ai-assistant-widget__bubble--assistant { background: rgba(255,255,255,.06); border-bottom-left-radius: 4px; }
.ai-assistant-widget__bubble--user { background: #6a5cf0; color: #fff; border-bottom-right-radius: 4px; }

/* Stage 2 (plain "waiting on server") / stage 3 (rotating fun messages) of
   startLoadingSequence() — a soft pulse instead of a static line, so a long
   wait still visibly reads as "alive". */
.ai-assistant-widget__waitText { display: inline-block; animation: ai-wait-pulse 1.6s ease-in-out infinite; }
@keyframes ai-wait-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .55; }
}

/* Stage 3's fun messages — same monospace look as .ai-loader since the
   leading characters glitch through RUNE_POOL glyphs the same way (driven
   from JS via bubble.waitText, see buildScrambleFrames/runFunCycle). */
.ai-assistant-widget__scramble { font-family: monospace; font-weight: bold; white-space: pre-wrap; }

.ai-assistant-widget__chips { display: flex; flex-wrap: wrap; gap: 6px; }

.ai-assistant-widget__inputRow {
  flex: 0 0 auto; display: flex; gap: 6px; padding: 10px; border-top: 1px solid rgba(255,255,255,.1);
}

/* "Thinking" indicator — Uiverse.io loader (by doniaskima), adapted: Turkish
   "Düşünüyor..." instead of "Loading...", and scaled down ~10% further from
   the already-shrunk 15px chat-bubble size. Cycles through the word
   glitching progressively into runic-looking glyphs, one animated
   pseudo-element, no JS. */
.ai-loader {
  width: fit-content;
  font-weight: bold;
  font-family: monospace;
  white-space: pre;
  font-size: 13.5px;
  line-height: 1.2em;
  height: 1.2em;
  overflow: hidden;
  display: inline-block;
}
.ai-loader::before {
  content: "Düşünüyor...\A⌰üşünüyor...\A⌰⍜şünüyor...\A⌰⍜⏃ünüyor...\A⌰⍜⏃⎅nüyor...\A⌰⍜⏃⎅⟟üyor...\A⌰⍜⏃⎅⟟⋏yor...\A⌰⍜⏃⎅⟟⋏☌or...\A⌰⍜⏃⎅⟟⋏☌⟒r...\A⌰⍜⏃⎅⟟⋏☌⟒⏁...\A⌰⍜⏃⎅⟟⋏☌⟒⏁⋔..\A⌰⍜⏃⎅⟟⋏☌⟒⏁⋔⎍.\A⌰⍜⏃⎅⟟⋏☌⟒⏁⋔⎍⏚";
  white-space: pre;
  display: inline-block;
  animation: ai-loader-cycle 1.3s infinite steps(13) alternate;
}
@keyframes ai-loader-cycle {
  100% { transform: translateY(-100%); }
}
</style>
