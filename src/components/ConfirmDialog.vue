<script setup>
/**
 * Generic centered confirm dialog — replaces native window.confirm() (a
 * top-of-browser HTML alert, not styled, not part of this app's UI at all)
 * across the admin panel. 2026-07-25 request: destructive actions especially
 * (kaynak silme) should be a proper in-app modal, and deletions specifically
 * should require the acting admin to re-type their own password before the
 * action goes through — not just a click-through "emin misiniz?".
 *
 * Password re-entry is verified by the CALLER (re-running
 * supabase.auth.signInWithPassword with the current session's own email —
 * see AdminView.vue's deleteSourceConfirm), not here: this component only
 * collects the value and surfaces a caller-supplied error if verification
 * failed, matching this app's existing pattern of dumb/presentational modals
 * (DeletionJustificationModal.vue) with the actual logic living in the view.
 */
import { ref, watch } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
  // When true, shows a password field and the confirm button stays
  // disabled until it's non-empty — for destructive actions (delete).
  requirePassword: { type: Boolean, default: false },
  // Red/danger styling on the confirm button (delete-style actions) vs the
  // neutral blue used for e.g. toggling a source active/inactive.
  danger: { type: Boolean, default: false },
  confirmLabel: { type: String, default: 'Evet' },
  cancelLabel: { type: String, default: 'Hayır' },
  // Set by the caller after a failed password verification, so the dialog
  // can show it without closing (the admin gets to retry immediately).
  error: { type: String, default: null },
  submitting: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm', 'cancel'])

const password = ref('')

// Clear any stale password after a failed attempt is retried, and whenever
// the dialog is reopened for a different action (parent re-mounts/re-shows
// it via v-if, but a stale value could otherwise linger across re-renders).
watch(() => props.error, (err) => { if (err) password.value = '' })

function confirm() {
  if (props.requirePassword && !password.value) return
  emit('confirm', props.requirePassword ? password.value : undefined)
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3>{{ title }}</h3>
      <p v-if="message" class="dialog-message">{{ message }}</p>
      <label v-if="requirePassword" class="dialog-field">
        <span>Devam etmek için şifrenizi girin</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="Şifreniz"
          @keyup.enter="confirm"
        />
      </label>
      <p v-if="error" class="dialog-error">{{ error }}</p>
      <div class="modal-actions">
        <button class="btn-cancel" :disabled="submitting" @click="emit('cancel')">{{ cancelLabel }}</button>
        <button
          :class="danger ? 'btn-danger' : 'btn-confirm'"
          :disabled="submitting || (requirePassword && !password)"
          @click="confirm"
        >
          {{ submitting ? '...' : confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-card {
  background: #161b26;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 22px;
  width: 420px;
  max-width: 92vw;
}
.modal-card h3 { margin: 0 0 12px; color: #e2e8f0; font-size: 1rem; }
.dialog-message { color: var(--color-text-muted, #94a3b8); font-size: 0.82rem; margin: 0 0 14px; line-height: 1.5; }
.dialog-field { display: flex; flex-direction: column; gap: 6px; font-size: 0.78rem; color: var(--color-text-muted, #94a3b8); }
.dialog-field input {
  background: #1e2330;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 8px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
  font-family: inherit;
  color-scheme: dark;
}
.dialog-error {
  color: #f87171;
  font-size: 0.76rem;
  margin: 10px 0 0;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel {
  padding: 9px 18px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #cbd5e1;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-confirm {
  padding: 9px 18px;
  background: rgba(77, 163, 255, 0.15);
  border: 1px solid rgba(77, 163, 255, 0.4);
  border-radius: 8px;
  color: #7cb8ff;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger {
  padding: 9px 18px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 8px;
  color: #ef4444;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
