<script setup>
import { ref, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'

const auth = useAuthStore()
// Feature 002-source-scoping: a country_admin may only create/edit sources scoped to
// their own country (enforced by RLS regardless — this just keeps the form honest).
const scopeLocked = computed(() => !auth.isSuperAdmin)

// spec 010, widened by tier1-source-unification migration
// (20260709000000_data_sources_tier1_source_type.sql): intersected with the
// hazard types data_sources.hazard_type's own CHECK constraint permits —
// 'multi_hazard' is only used by built-in multi-hazard adapters (GDACS) and
// isn't offered here since it's not selectable for admin-created sources.
// 'population' added by feature 038 (population exposure data sources) — not a
// disaster hazard, but data_sources.hazard_type is documented as a
// "primary/informational label" (see the tier1-source-unification migration's own
// comment) and this is the existing extension mechanism for non-hazard source
// categories. hazard_types.category = 'exposure' for this row lets other
// hazard-specific UI (threshold editor, CAP hazard picker) filter it out without
// removing it here.
const SOURCE_SUPPORTED_HAZARDS = ['earthquake', 'wildfire', 'flood', 'drought', 'food_security', 'tsunami', 'epidemic', 'population', 'roads']
const hazardTypesStore = useHazardTypesStore()
const HAZARD_TYPES = computed(() =>
  hazardTypesStore.activeHazardTypes.filter((h) => SOURCE_SUPPORTED_HAZARDS.includes(h.code)),
)
// Only "id"/"lat"/"lng"/"time" are required by validatePayload(); the rest are optional extras.
// lat/lng are excluded for 'geojson' format below (mapping-section template) —
// formatHandlers/geojson.js's mapGeoJSON() always reads coordinates straight
// from feature.geometry.coordinates and never even looks at field_map.lat/lng
// (see that file's own header comment), so asking an admin to fill them in
// here was pure friction with no effect — this form previously required it
// anyway regardless of format, which is what actually gets validated/mapped.
const MAPPABLE_FIELDS = [
  { key: 'id', label: 'ID *' },
  { key: 'lat', label: 'Enlem (lat) *' },
  { key: 'lng', label: 'Boylam (lng) *' },
  { key: 'time', label: 'Zaman *' },
  { key: 'magnitude', label: 'Büyüklük/Şiddet' },
  { key: 'depth', label: 'Derinlik' },
  { key: 'title', label: 'Başlık' },
  { key: 'description', label: 'Açıklama' },
]
const visibleMappableFields = computed(() =>
  form.value.format === 'geojson' ? MAPPABLE_FIELDS.filter((f) => f.key !== 'lat' && f.key !== 'lng') : MAPPABLE_FIELDS,
)

// Faz 2.5: veri formatı seçimi — sadece "özel kaynak" işaretliyken görünür.
// 'json' varsayılan (mevcut özel kaynaklarla geriye dönük uyumlu). GeoJSON/RSS
// formatlarında lat/lng/time gibi bazı alanlar standart konumlarda olduğundan
// field_map'te boş bırakılırsa sunucu tarafı makul varsayılanlar kullanır
// (server/src/sources/formatHandlers/*.js).
const SOURCE_FORMATS = [
  { value: 'json', label: 'JSON (düz liste + alan eşleştirme)' },
  { value: 'geojson', label: 'GeoJSON (features[] — USGS tarzı)' },
  { value: 'rss', label: 'RSS / XML (<item> tabanlı)' },
  { value: 'csv', label: 'CSV (başlıklı sütunlar)' },
  { value: 'fdsn', label: 'FDSN metin (| ile ayrılmış — sismoloji ağları, GEOFON tarzı)' },
]

// Tier-1 (yerleşik) kaynakların source_type'ı buradan asla elle set edilemez
// — sadece seed migration ile atanır. WebSocket tabanlı adapter'larda
// poll_interval_seconds sunucu tarafında hiç okunmaz (bkz. registry.js).
const WEBSOCKET_SOURCE_TYPES = ['emsc']

// "Ne sıklıkla kontrol edilsin?" — ülke admininin görüp anlayabileceği bir
// seçim, teknik altyapı detayını (Docker/pg_cron/hangi süreç) hiç göstermez
// (2026-07-25 tartışması: hangi VPS'te/hangi mekanizmayla çalıştığı ülkenin
// kendi kurulumuna bağlı olabilir — bu form sadece "ne sıklıkta" sorar).
// automation_kind (20260725180000_data_sources_automation_kind.sql) buradan
// direkt türüyor: admin panelindeki rozetin (⚡/🕐/🖖) doğru gösterebilmesi
// için sıklık seçimiyle birebir eşleşiyor, ayrı bir alan olarak sorulmuyor.
const FREQUENCY_OPTIONS = [
  { value: 'continuous', label: 'Sürekli (60 sn)', poll: 60, kind: 'continuous' },
  { value: 'frequent', label: '15 dakikada bir', poll: 900, kind: 'continuous' },
  { value: 'hourly', label: 'Saatte bir', poll: 3600, kind: 'scheduled' },
  { value: 'daily', label: 'Günde bir', poll: 86400, kind: 'scheduled' },
  { value: 'weekly', label: 'Haftada bir', poll: 604800, kind: 'scheduled' },
  // poll değeri anlamsız (dynamicSources.js otomatik_kind='manual' olan
  // satırları hiç zamanlamıyor, bkz. server/src/sources/dynamicSources.js) —
  // yine de mantıklı bir varsayılan yazıyoruz ki elle çalıştırılmadan önce
  // DB'de garip bir sayı durmasın.
  { value: 'manual', label: 'Elle güncelleyeceğim (otomatik çekilmesin)', poll: 2592000, kind: 'manual' },
]

// Mevcut bir kaynağın (poll_interval_seconds, automation_kind) çiftinden en
// yakın seçeneği bulur — tam eşleşme yoksa (örn. elle 3700 sn girilmişse)
// en yakın süreye düşer, "manual" hiçbir zaman yanlışlıkla eşleşmez.
function frequencyChoiceFor(pollSeconds, automationKind) {
  if (automationKind === 'manual') return 'manual'
  const exact = FREQUENCY_OPTIONS.find((o) => o.kind !== 'manual' && o.poll === pollSeconds)
  if (exact) return exact.value
  const candidates = FREQUENCY_OPTIONS.filter((o) => o.kind !== 'manual')
  let closest = candidates[0]
  for (const o of candidates) {
    if (Math.abs(o.poll - pollSeconds) < Math.abs(closest.poll - pollSeconds)) closest = o
  }
  return closest.value
}

const props = defineProps({
  source: { type: Object, default: null }, // null = create mode
  saving: { type: Boolean, default: false },
  error: { type: String, default: null },
})

const emit = defineEmits(['save', 'cancel'])

function blankForm() {
  return {
    name: '',
    hazard_type: 'earthquake',
    endpoint_url: '',
    poll_interval_seconds: 60,
    automation_kind: 'continuous',
    frequencyChoice: 'continuous',
    staleness_threshold_seconds: null,
    down_after_consecutive_failures: 3,
    // source_type is never set on create — every admin-created source stays
    // a generic/custom row (source_type NULL). Tier-1 rows only ever exist
    // via seed migration.
    source_type: null,
    is_custom: false,
    response_path: '',
    format: 'json',
    field_map: {},
    // country_admin can only ever save their own country's scope; super_admin defaults
    // new sources to Global (null) and can change it. `scopeChoice` is UI-only state
    // (not a data_sources column) driving which fields are shown; the final `country_code`
    // sent to the store is derived from it in submit().
    country_code: scopeLocked.value ? auth.countryCode : null,
    scopeChoice: scopeLocked.value ? 'country' : 'global',
  }
}

function fromSource(src) {
  return {
    ...src,
    frequencyChoice: frequencyChoiceFor(src.poll_interval_seconds, src.automation_kind),
    // Read-only passthrough — see blankForm()'s comment. Carried through on
    // edit so a Tier-1 row's source_type round-trips unchanged.
    source_type: src.source_type ?? null,
    is_custom: !!src.endpoint_config?.field_map,
    response_path: src.endpoint_config?.response_path ?? '',
    format: src.endpoint_config?.format ?? 'json',
    field_map: { ...(src.endpoint_config?.field_map ?? {}) },
    country_code: scopeLocked.value ? auth.countryCode : (src.country_code ?? null),
    scopeChoice: scopeLocked.value || src.country_code ? 'country' : 'global',
  }
}

const form = ref(props.source ? fromSource(props.source) : blankForm())

watch(
  () => props.source,
  (src) => {
    form.value = src ? fromSource(src) : blankForm()
  },
)

const requiredMappingFilled = computed(() =>
  !form.value.is_custom || visibleMappableFields.value
    .filter((f) => f.key === 'id' || f.key === 'lat' || f.key === 'lng' || f.key === 'time')
    .every((f) => form.value.field_map[f.key]?.trim())
)

const scopeFilled = computed(() =>
  form.value.scopeChoice === 'global' || !!form.value.country_code?.trim()
)

// Translates a raw RLS-rejection error (e.g. a country_admin trying to save an
// out-of-scope country_code, feature 002-source-scoping) into a readable message.
const friendlyError = computed(() => {
  if (!props.error) return null
  if (/row-level security/i.test(props.error)) {
    return 'Bu kapsamda (ülke) bir kaynak kaydetme yetkiniz yok — sadece kendi ülkenize ait kaynakları yönetebilirsiniz.'
  }
  return props.error
})

function submit() {
  const { is_custom, response_path, format, field_map, scopeChoice, frequencyChoice, ...rest } = form.value
  const freq = FREQUENCY_OPTIONS.find((o) => o.value === frequencyChoice) ?? FREQUENCY_OPTIONS[0]
  const payload = {
    ...rest,
    country_code: scopeChoice === 'global' ? null : rest.country_code || null,
    endpoint_config: is_custom ? { response_path, format, field_map } : {},
    // Tier-1 (source_type set, e.g. WebSocket-driven emsc) rows keep their own
    // seed-migration automation_kind/poll_interval_seconds regardless of what
    // this frequency picker shows for them (disabled in the UI below anyway).
    ...(form.value.source_type ? {} : { poll_interval_seconds: freq.poll, automation_kind: freq.kind }),
    // "Elle güncelleyeceğim" sources have no scheduled polling at all — without
    // this, saving one for the first time would leave it sitting with zero
    // data until someone separately finds the "🔁 Şimdi Çalıştır" button.
    // Kaydet doubles as an immediate first fetch, same mechanism that button
    // uses (dynamicSources.js's manual_trigger_requested_at pickup) — see
    // 20260725190000_manual_source_trigger.sql.
    ...(is_custom && freq.kind === 'manual' ? { manual_trigger_requested_at: new Date().toISOString() } : {}),
  }
  emit('save', payload)
}
</script>

<template>
  <div class="form-card">
    <div class="form-grid">
      <label class="form-field span-2"><span>Kaynak Adı *</span>
        <input v-model="form.name" placeholder="USGS, NASA FIRMS..." />
      </label>
      <label class="form-field"><span>Afet Tipi *</span>
        <select v-model="form.hazard_type">
          <option v-for="t in HAZARD_TYPES" :key="t.code" :value="t.code">{{ t.display_name }}</option>
        </select>
      </label>
      <label class="form-field">
        <span>Ne sıklıkla kontrol edilsin? *</span>
        <select
          v-model="form.frequencyChoice"
          :disabled="WEBSOCKET_SOURCE_TYPES.includes(form.source_type)"
          :title="WEBSOCKET_SOURCE_TYPES.includes(form.source_type) ? 'Bu kaynak WebSocket üzerinden çalışır, aralık ayarı geçerli değildir' : ''"
        >
          <option v-for="o in FREQUENCY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <span v-if="WEBSOCKET_SOURCE_TYPES.includes(form.source_type)" class="field-hint">
          Bu kaynak WebSocket üzerinden çalışır, aralık ayarı geçerli değildir.
        </span>
        <span v-else-if="form.frequencyChoice === 'manual'" class="field-hint">
          Otomatik çekilmez — verileri elle yenilemeniz gerekir.
        </span>
      </label>
      <label v-if="form.source_type" class="form-field">
        <span>Yerleşik kaynak türü (değiştirilemez)</span>
        <input :value="form.source_type" disabled />
      </label>
      <label class="form-field span-2"><span>Endpoint URL *</span>
        <input v-model="form.endpoint_url" placeholder="https://..." />
      </label>
      <label class="form-field"><span>Kapsam</span>
        <input
          v-if="scopeLocked"
          :value="form.country_code || '—'"
          disabled
          title="Sadece kendi ülkenize ait kaynak kaydedebilirsiniz"
        />
        <select v-else v-model="form.scopeChoice">
          <option value="global">🌍 Küresel — dünya çapında/uluslararası kaynak (USGS, NASA FIRMS gibi)</option>
          <option value="country">📍 Yerel — bu ülkeye/bölgeye özel kaynak (kendi sismik ağınız gibi)</option>
        </select>
        <span class="field-hint">
          Kaynağın kapsadığı coğrafyayı belirtir, kimin görebileceğiyle ilgili değildir.
        </span>
      </label>
      <label v-if="!scopeLocked && form.scopeChoice === 'country'" class="form-field">
        <span>Ülke Kodu *</span>
        <input v-model="form.country_code" placeholder="tr, mg..." maxlength="2" />
      </label>
      <label class="form-field"><span>Staleness Eşiği (saniye, opsiyonel)</span>
        <input v-model.number="form.staleness_threshold_seconds" type="number" min="1" placeholder="varsayılan: 3x poll aralığı" />
      </label>
      <label class="form-field"><span>Down Eşiği (ardışık hata sayısı)</span>
        <input v-model.number="form.down_after_consecutive_failures" type="number" min="1" placeholder="örn. 3" />
      </label>
      <label class="form-field span-2 checkbox-field">
        <input v-model="form.is_custom" type="checkbox" />
        <span>Standart olmayan / özel kaynak (bizim kodda tanımlı değil — alan eşleştirmesi gerekir)</span>
      </label>
    </div>

    <div v-if="form.is_custom" class="mapping-section">
      <label class="form-field"><span>Veri Formatı</span>
        <select v-model="form.format">
          <option v-for="f in SOURCE_FORMATS" :key="f.value" :value="f.value">{{ f.label }}</option>
        </select>
      </label>
      <label v-if="form.format === 'json'" class="form-field"><span>Kayıt Listesi Yolu (response_path)</span>
        <input v-model="form.response_path" placeholder="örn. data.records (yanıtın kendisi bir dizi ise boş bırak)" />
      </label>
      <p class="mapping-hint">
        Onların API'sindeki alan adını, bizim standart alanımızla eşleştir
        <template v-if="form.format === 'geojson'">(GeoJSON'da lat/lng/derinlik koordinatlardan otomatik okunur, sadece properties altındaki alanları eşleştirin):</template>
        <template v-else>:</template>
      </p>
      <div class="mapping-grid">
        <template v-for="f in visibleMappableFields" :key="f.key">
          <span class="mapping-label">{{ f.label }}</span>
          <input v-model="form.field_map[f.key]" placeholder="onların JSON key'i" />
        </template>
      </div>
      <div v-if="!requiredMappingFilled" class="mapping-warning">
        ID, Enlem, Boylam ve Zaman eşleştirmeleri zorunludur.
      </div>
    </div>

    <div class="form-actions">
      <div v-if="friendlyError" class="form-error">{{ friendlyError }}</div>
      <button class="btn-cancel-form" @click="$emit('cancel')">İptal</button>
      <button class="btn-submit"
        :disabled="saving || !form.name || !form.endpoint_url || !requiredMappingFilled || !scopeFilled"
        @click="submit">
        {{ saving ? 'Kaydediliyor...' : '💾 Kaydet' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.form-card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.form-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
.span-2 { grid-column: span 2; }
.form-field { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.form-field input, .form-field select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 100%;
}
.form-field select { color-scheme: dark; }
.form-field select option { background: #1e2330; color: #e2e8f0; }
.form-field input:focus, .form-field select:focus { outline: none; border-color: rgba(77,163,255,.5); }
.field-hint { color: #f59e0b; font-size: .72rem; }
.checkbox-field { flex-direction: row; align-items: center; gap: 8px; font-size: .82rem; color: #e2e8f0; }
.checkbox-field input { width: auto; }
.mapping-section { margin-top: 14px; padding: 14px; background: rgba(77,163,255,.05); border: 1px dashed rgba(77,163,255,.3); border-radius: 10px; }
.mapping-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 10px 0 8px; }
.mapping-grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; align-items: center; }
.mapping-label { font-size: .78rem; color: var(--color-text-muted,#94a3b8); white-space: nowrap; }
.mapping-grid input { background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 7px 10px; color: #e2e8f0; font-size: .82rem; }
.mapping-warning { color: #f59e0b; font-size: .78rem; margin-top: 10px; }
.form-actions { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.form-error { color: #ef4444; font-size: .8rem; flex: 1; }
.btn-cancel-form { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; color: var(--color-text-muted,#94a3b8); cursor: pointer; font-size: .85rem; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; transition: background .15s; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
</style>
