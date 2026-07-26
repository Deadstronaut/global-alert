<script setup>
import { ref, onMounted } from 'vue'

const STAR_COUNT = 220
const stars = ref([])

onMounted(() => {
  stars.value = Array.from({ length: STAR_COUNT }, (_, i) => {
    // Most stars are dim/tiny (far), a handful are bigger/brighter (near) — gives depth.
    const isNear = Math.random() < 0.12
    const size = isNear ? 2 : 1
    const duration = 3 + Math.random() * 4.5 // slow twinkle: 3s-7.5s per cycle
    const delay = -Math.random() * duration // desync so they don't all pulse together
    const peakOpacity = (isNear ? 0.75 : 0.45) + Math.random() * 0.25

    return {
      id: i,
      style: {
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        width: `${size}px`,
        height: `${size}px`,
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
        '--peak-opacity': peakOpacity,
      },
    }
  })
})
</script>

<template>
  <div class="starfield" aria-hidden="true">
    <div v-for="star in stars" :key="star.id" class="star" :style="star.style"></div>
  </div>
</template>

<style scoped>
.starfield {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: radial-gradient(ellipse at 50% 40%, #0b1020 0%, #05070d 55%, #000000 100%);
  pointer-events: none;
}

.star {
  position: absolute;
  border-radius: 50%;
  background-color: #fff;
  box-shadow: 0 0 2px 1px rgba(255, 255, 255, 0.35);
  opacity: 0.15;
  animation-name: star-twinkle;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
  animation-direction: alternate;
}

@keyframes star-twinkle {
  from {
    opacity: 0.15;
  }
  to {
    opacity: var(--peak-opacity, 0.8);
  }
}

@media (prefers-reduced-motion: reduce) {
  .star {
    animation: none;
    opacity: 0.55;
  }
}
</style>
