<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  targetLabel: { type: String, default: '' },
})
const emit = defineEmits(['confirm', 'cancel'])

const justification = ref('')

function confirm() {
  const trimmed = justification.value.trim()
  if (!trimmed) return
  emit('confirm', trimmed)
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3>{{ t('audit.deletion.title') }}</h3>
      <p v-if="targetLabel" class="deletion-target">{{ targetLabel }}</p>
      <label class="deletion-field">
        <span>{{ t('audit.deletion.justificationLabel') }}</span>
        <textarea v-model="justification" rows="3" :placeholder="t('audit.deletion.justificationPlaceholder')" />
      </label>
      <div class="modal-actions">
        <button class="btn-cancel" @click="emit('cancel')">{{ t('audit.deletion.cancel') }}</button>
        <button class="btn-danger" :disabled="!justification.trim()" @click="confirm">{{ t('audit.deletion.confirm') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-card { background: #161b26; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 22px; width: 420px; max-width: 92vw; }
.modal-card h3 { margin: 0 0 12px; color: #e2e8f0; font-size: 1rem; }
.deletion-target { color: var(--color-text-muted,#94a3b8); font-size: .82rem; margin: 0 0 12px; }
.deletion-field { display: flex; flex-direction: column; gap: 6px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.deletion-field textarea {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .82rem; resize: vertical; font-family: inherit;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: .85rem; }
.btn-danger { padding: 9px 18px; background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.4); border-radius: 8px; color: #ef4444; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-danger:disabled { opacity: .5; cursor: not-allowed; }
</style>
