<script setup>
import { ref, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import LoadingScreen from '@/components/LoadingScreen.vue'

const isLoading = ref(true)

onMounted(() => {
  // Show loading screen for minimum 2.5 seconds for data to load
  setTimeout(() => {
    isLoading.value = false
  }, 2500)
})
</script>

<template>
  <!-- Space Background -->
  <div class="space-background"></div>

  <!-- Loading Screen -->
  <LoadingScreen :visible="isLoading" />

  <!-- Main App -->
  <RouterView v-if="!isLoading" />
</template>

<style scoped>
/* App-level styles handled by main.css */
</style>
