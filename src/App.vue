<template>
  <!-- Space Background -->
  <div class="space-background"></div>

  <!-- Loading Screen -->
  <LoadingScreen :visible="isLoading" />

  <!-- Main App -->
  <RouterView v-if="!isLoading" />
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import LoadingScreen from '@/components/LoadingScreen.vue'
import { useDisasterStore } from '@/stores/disaster.js'

const disasterStore = useDisasterStore()

// Loading: sadece store gerçekten yükleniyor ve cache yoksa göster
const isLoading = computed(() => disasterStore.isLoading)

onMounted(() => {
  disasterStore.startWebSocket()
})
</script>

<style scoped>
/* App-level styles handled by main.css */
</style>
