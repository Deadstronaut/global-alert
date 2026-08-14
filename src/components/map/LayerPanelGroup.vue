<script setup>
import { ref } from 'vue'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  defaultOpen: { type: Boolean, default: false },
  badge: { type: [String, Number], default: '' },
})

const open = ref(props.defaultOpen)
</script>

<template>
  <Collapsible v-model:open="open" class="layer-panel-group">
    <CollapsibleTrigger class="layer-panel-group__trigger" :aria-expanded="open">
      <span v-if="icon" class="layer-panel-group__icon" aria-hidden="true">{{ icon }}</span>
      <span class="layer-panel-group__title">{{ title }}</span>
      <span v-if="badge !== ''" class="layer-panel-group__badge">{{ badge }}</span>
      <span class="layer-panel-group__chevron" :class="{ 'layer-panel-group__chevron--open': open }" aria-hidden="true">▾</span>
    </CollapsibleTrigger>
    <CollapsibleContent class="layer-panel-group__content">
      <slot />
    </CollapsibleContent>
  </Collapsible>
</template>

<style scoped>
.layer-panel-group {
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
}

.layer-panel-group__trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.65rem 0.75rem;
  background: transparent;
  border: none;
  cursor: pointer;
  color: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: left;
}

.layer-panel-group__title {
  flex: 1;
}

.layer-panel-group__badge {
  font-size: 0.7rem;
  font-weight: 500;
  opacity: 0.7;
}

.layer-panel-group__chevron {
  transition: transform 0.15s ease;
  opacity: 0.6;
}

.layer-panel-group__chevron--open {
  transform: rotate(-180deg);
}

.layer-panel-group__content {
  padding: 0 0.75rem 0.75rem;
  max-height: min(50vh, 420px);
  overflow-y: auto;
}
</style>
