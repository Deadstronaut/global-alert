<script setup>
// Shared collapse/expand control for the left sidebar and the right
// impact-analysis/settings dock — same animated triple-chevron button on
// both sides (mirrored via the `mirrored` prop), so there's one place to
// find/tweak this instead of two near-duplicate implementations.
// Design credit: Uiverse.io (kheshore), adapted to the app's accent colors
// and made a reusable component instead of a copy-pasted snippet.
defineProps({
  mirrored: { type: Boolean, default: false },
  // Rotates the chevrons 180° so they point the other way once the panel
  // they control is collapsed — reversed again on click, back to expanded.
  collapsed: { type: Boolean, default: false },
})
defineEmits(['click'])
</script>

<template>
  <div
    class="panel-collapse-toggle"
    :class="{
      'panel-collapse-toggle--mirrored': mirrored,
      'panel-collapse-toggle--collapsed': collapsed,
    }"
  >
    <button type="button" class="panel-collapse-toggle-btn" @click="$emit('click')">
      <span class="panel-collapse-toggle-icon">
        <svg viewBox="0 0 66 43" height="20" width="20" aria-hidden="true">
          <g fill-rule="evenodd" fill="none" stroke-width="1" stroke="none">
            <path
              class="panel-collapse-arrow panel-collapse-arrow-one"
              fill="currentColor"
              d="M40.1543933,3.89485454 L43.9763149,0.139296592 C44.1708311,-0.0518420739 44.4826329,-0.0518571125 44.6771675,0.139262789 L65.6916134,20.7848311 C66.0855801,21.1718824 66.0911863,21.8050225 65.704135,22.1989893 C65.7000188,22.2031791 65.6958657,22.2073326 65.6916762,22.2114492 L44.677098,42.8607841 C44.4825957,43.0519059 44.1708242,43.0519358 43.9762853,42.8608513 L40.1545186,39.1069479 C39.9575152,38.9134427 39.9546793,38.5968729 40.1481845,38.3998695 C40.1502893,38.3977268 40.1524132,38.395603 40.1545562,38.3934985 L56.9937789,21.8567812 C57.1908028,21.6632968 57.193672,21.3467273 57.0001876,21.1497035 C56.9980647,21.1475418 56.9959223,21.1453995 56.9937605,21.1432767 L40.1545208,4.60825197 C39.9574869,4.41477773 39.9546013,4.09820839 40.1480756,3.90117456 C40.1501626,3.89904911 40.1522686,3.89694235 40.1543933,3.89485454 Z"
            />
            <path
              class="panel-collapse-arrow panel-collapse-arrow-two"
              fill="currentColor"
              d="M20.1543933,3.89485454 L23.9763149,0.139296592 C24.1708311,-0.0518420739 24.4826329,-0.0518571125 24.6771675,0.139262789 L45.6916134,20.7848311 C46.0855801,21.1718824 46.0911863,21.8050225 45.704135,22.1989893 C45.7000188,22.2031791 45.6958657,22.2073326 45.6916762,22.2114492 L24.677098,42.8607841 C24.4825957,43.0519059 24.1708242,43.0519358 23.9762853,42.8608513 L20.1545186,39.1069479 C19.9575152,38.9134427 19.9546793,38.5968729 20.1481845,38.3998695 C20.1502893,38.3977268 20.1524132,38.395603 20.1545562,38.3934985 L36.9937789,21.8567812 C37.1908028,21.6632968 37.193672,21.3467273 37.0001876,21.1497035 C36.9980647,21.1475418 36.9959223,21.1453995 36.9937605,21.1432767 L20.1545208,4.60825197 C19.9574869,4.41477773 19.9546013,4.09820839 20.1480756,3.90117456 C20.1501626,3.89904911 20.1522686,3.89694235 20.1543933,3.89485454 Z"
            />
            <path
              class="panel-collapse-arrow panel-collapse-arrow-three"
              fill="currentColor"
              d="M0.154393339,3.89485454 L3.97631488,0.139296592 C4.17083111,-0.0518420739 4.48263286,-0.0518571125 4.67716753,0.139262789 L25.6916134,20.7848311 C26.0855801,21.1718824 26.0911863,21.8050225 25.704135,22.1989893 C25.7000188,22.2031791 25.6958657,22.2073326 25.6916762,22.2114492 L4.67709797,42.8607841 C4.48259567,43.0519059 4.17082418,43.0519358 3.97628526,42.8608513 L0.154518591,39.1069479 C-0.0424848215,38.9134427 -0.0453206733,38.5968729 0.148184538,38.3998695 C0.150289256,38.3977268 0.152413239,38.395603 0.154556228,38.3934985 L16.9937789,21.8567812 C17.1908028,21.6632968 17.193672,21.3467273 17.0001876,21.1497035 C16.9980647,21.1475418 16.9959223,21.1453995 16.9937605,21.1432767 L0.15452076,4.60825197 C-0.0425130651,4.41477773 -0.0453986756,4.09820839 0.148075568,3.90117456 C0.150162624,3.89904911 0.152268631,3.89694235 0.154393339,3.89485454 Z"
            />
          </g>
        </svg>
      </span>
    </button>
  </div>
</template>

<style scoped>
.panel-collapse-toggle {
  --panel-collapse-fg: #e2e8f0;
  --panel-collapse-bg: rgba(20, 24, 33, 0.92);
  --panel-collapse-accent: var(--color-accent, #4da3ff);
  display: inline-flex;
}

.panel-collapse-toggle--mirrored .panel-collapse-toggle-btn {
  transform: scaleX(-1);
}

.panel-collapse-toggle-btn {
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 6px 0px 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: var(--panel-collapse-bg);
  color: var(--panel-collapse-fg);
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: box-shadow 0.4s ease, padding 0.35s ease;
}

.panel-collapse-toggle-btn:hover,
.panel-collapse-toggle-btn:focus-visible {
  box-shadow: 0 0 0 3px rgba(77, 163, 255, 0.18), 0 8px 24px rgba(0, 0, 0, 0.28);
  outline: none;
}

/* Rotating the icon 180° flips which side the compressed chevron mass sits
   on, so the button's own left/right padding has to flip with it — otherwise
   the glyph reads as off-center once collapsed. */
.panel-collapse-toggle--collapsed .panel-collapse-toggle-btn {
  padding: 6px 12px 6px 0px;
}

.panel-collapse-toggle-icon {
  display: flex;
  transition:
    margin 0.35s ease,
    transform 0.35s ease;
}

.panel-collapse-toggle--collapsed .panel-collapse-toggle-icon {
  transform: rotate(180deg);
}

.panel-collapse-toggle-btn:hover .panel-collapse-toggle-icon {
  margin-right: 10px;
}

.panel-collapse-arrow-one {
  transition: transform 0.4s ease;
  transform: translateX(-60%);
}
.panel-collapse-arrow-two {
  transition: transform 0.4s ease;
  transform: translateX(-30%);
}
.panel-collapse-arrow-three {
  transform: translateX(0);
}

.panel-collapse-toggle-btn:hover .panel-collapse-arrow-one {
  transform: translateX(0);
  animation: panel-collapse-arrow-color 1s infinite 0.6s;
}
.panel-collapse-toggle-btn:hover .panel-collapse-arrow-two {
  transform: translateX(0);
  animation: panel-collapse-arrow-color 1s infinite 0.4s;
}
.panel-collapse-toggle-btn:hover .panel-collapse-arrow-three {
  animation: panel-collapse-arrow-color 1s infinite 0.2s;
}

@keyframes panel-collapse-arrow-color {
  0% {
    fill: var(--panel-collapse-fg);
  }
  50% {
    fill: var(--panel-collapse-bg);
  }
  100% {
    fill: var(--panel-collapse-accent);
  }
}
</style>
