<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Generic, capability-agnostic display for a single ai_suggestions row
// (spec 051). Never applies its own output anywhere — only ever emits the
// human's decision back to the caller, which is responsible for writing the
// approved content to the actual source entity and resolving the
// ai_suggestions row (FR-004).
const props = defineProps({
  suggestion: { type: Object, required: true }, // { id, ai_output, status, ... }
  editable: { type: Boolean, default: true }, // false for anomaly_flag (no text to edit)
})

const emit = defineEmits(['approve', 'reject', 'dismiss'])

const { t } = useI18n()

const editedText = ref(null)

function approve() {
  emit('approve', { suggestionId: props.suggestion.id, edited: editedText.value })
}

function reject() {
  emit('reject', { suggestionId: props.suggestion.id })
}

function dismiss() {
  emit('dismiss', { suggestionId: props.suggestion.id })
}
</script>

<template>
  <div class="ai-suggestion-badge">
    <span class="ai-suggestion-badge__label">{{ t('ai.suggestedLabel') }}</span>
    <span class="ai-suggestion-badge__hint">{{ t('ai.reviewRequired') }}</span>

    <slot :suggestion="suggestion" :editedText="editedText" :setEditedText="(v) => (editedText = v)" />

    <div v-if="editable" class="ai-suggestion-badge__actions">
      <button type="button" class="ai-suggestion-badge__approve" @click="approve">
        {{ t('ai.approve') }}
      </button>
      <button type="button" class="ai-suggestion-badge__reject" @click="reject">
        {{ t('ai.reject') }}
      </button>
    </div>
    <div v-else class="ai-suggestion-badge__actions">
      <button type="button" class="ai-suggestion-badge__dismiss" @click="dismiss">
        {{ t('ai.dismiss') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ai-suggestion-badge {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px dashed var(--ai-badge-border, #8a7dfa);
  border-radius: 6px;
  background: var(--ai-badge-bg, rgba(138, 125, 250, 0.08));
}

.ai-suggestion-badge__label {
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--ai-badge-label, #6a5cf0);
}

.ai-suggestion-badge__hint {
  font-size: 0.75rem;
  opacity: 0.8;
  margin-left: 0.5rem;
}

.ai-suggestion-badge__actions {
  display: flex;
  gap: 0.5rem;
}
</style>
