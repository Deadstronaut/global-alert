import { watch, onBeforeUnmount } from 'vue'
import { createDraggable, animate } from 'animejs'

const STORAGE_PREFIX = 'draggable-card-pos:'

// Shared across every draggable card instance in the app (module-level, not
// per-composable-call) so "last touched card wins" holds true even between
// DIFFERENT cards — without this, each card only ever competes against its
// own static CSS z-index, and whichever card happens to sit later in the DOM
// keeps winning regardless of which one was actually opened/dragged last
// (user report, 2026-08-20: "zemindeki diğerlerine göre farklı olduğu için
// hep üstte kalıyor"). Starts above these cards' own static CSS z-index
// (30-40) so the very first bring-to-front already wins against any of them.
let sharedZIndex = 500

function bringToFront(el) {
  el.style.zIndex = String(++sharedZIndex)
}

function loadPosition(storageKey) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey)
    if (!raw) return null
    const pos = JSON.parse(raw)
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos
  } catch {
    // corrupt/unavailable storage — fall back to default position
  }
  return null
}

function savePosition(storageKey, x, y) {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify({ x, y }))
  } catch {
    // storage full/unavailable — dragging still works, just not persisted
  }
}

function clearPosition(storageKey) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + storageKey)
  } catch {
    // ignore
  }
}

/**
 * Makes an existing card draggable via its own handle element, restores its
 * last-dropped position from localStorage on (re)mount, and exposes reset()
 * to snap it back to its original default position.
 *
 * Purely additive: doesn't touch the card's existing open/close logic,
 * layout, or any interactive controls inside its body (range inputs are
 * already excluded from drag-start by animejs itself; scoping the drag
 * trigger to the handle element keeps checkboxes/buttons/sliders in the
 * body completely unaffected).
 *
 * targetRef is watched rather than read once at mount, since these cards are
 * usually behind a `v-if` (only present in the DOM while open) — the
 * draggable instance is (re)created every time the element appears and torn
 * down when it disappears, so reopening a card always finds it fresh.
 *
 * @param {string} storageKey - unique id for this card's persisted position
 * @param {import('vue').Ref<HTMLElement|null>} targetRef - the element that moves
 * @param {import('vue').Ref<HTMLElement|null>} handleRef - the element that starts the drag (defaults to targetRef)
 */
export function useDraggableCard(storageKey, targetRef, handleRef) {
  let draggable = null

  const stop = watch(
    targetRef,
    (target) => {
      draggable?.revert()
      draggable = null
      if (!target) return
      draggable = createDraggable(target, {
        trigger: (handleRef && handleRef.value) || target,
        container: document.body,
        onGrab: () => bringToFront(target),
        onSettle: (d) => savePosition(storageKey, d.x, d.y),
      })
      const saved = loadPosition(storageKey)
      if (saved) {
        draggable.setX(saved.x, true)
        draggable.setY(saved.y, true)
      }
      // A freshly (re)opened card should also start on top of whatever was
      // last touched — not just cards that get dragged.
      bringToFront(target)
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(() => {
    stop()
    draggable?.revert()
    draggable = null
  })

  function reset() {
    if (!draggable) return
    animate(draggable, { x: 0, y: 0, duration: 320, ease: 'outQuad' })
    clearPosition(storageKey)
  }

  return { reset }
}
