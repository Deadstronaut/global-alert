# Data Model: Audit & Compliance Gaps

## Extended Entity: `audit_log` (additive columns)

Mevcut tablo (spec 007/029): `id`, `action`, `table_name`, `record_id`, `old_data`, `new_data`, `changed_by`, `changed_at` (yaklaşık şema, `log_table_change()` tarafından doldurulur).

Yeni kolonlar:

| Kolon | Tip | Null? | Açıklama |
|---|---|---|---|
| `event_category` | TEXT NOT NULL DEFAULT `'data_change'` | Hayır | `CHECK (event_category IN ('data_change','security_event'))` — mevcut tüm satırlar varsayılan olarak `'data_change'` kalır (geriye dönük uyumlu). |
| `justification` | TEXT | Evet | Sadece `delete_with_justification()` tarafından oluşturulan silme kayıtlarında dolu; diğer tüm satırlarda NULL. |

## New Entity: `retention_policies`

| Kolon | Tip | Açıklama |
|---|---|---|
| `id` | UUID PK, `gen_random_uuid()` | — |
| `category` | TEXT NOT NULL UNIQUE | `'audit_log'` veya `'dispatch_receipts'` (research.md Decision 1 — ilk kapsam). |
| `retention_days` | INTEGER NOT NULL, `CHECK (retention_days > 0)` | Kaç gün sonra süresi dolar. |
| `action` | TEXT NOT NULL, `CHECK (action IN ('archive','delete'))` | Süre dolduğunda uygulanacak eylem; varsayılan yapılandırma yok — politika oluşturulmadıkça hiçbir kayıt etkilenmez (FR-002). |
| `created_by` | UUID, FK → `profiles(id)` | — |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | — |

**RLS**: super_admin-only (`FOR ALL USING (current_profile_role() = 'super_admin')`), mevcut `hazard_types`/`integration_types` gibi diğer super_admin-only config tablolarıyla aynı desen.

## New Entity: `audit_log_archive` / `dispatch_receipts_archive`

Aynı sütun şemasını `audit_log`/`dispatch_receipts`'ten birebir kopyalar (arşivleme hedefi). RLS: super_admin-only SELECT (arşivlenmiş veriye sadece en yüksek yetkili erişebilir).

## State Transitions

`enforce_retention_policies()` (pg_cron ile periyodik, ör. günlük):
1. Her `retention_policies` satırı için, ilgili kaynak tablodaki `created_at`/`changed_at` > `retention_days` gün önce olan satırları bulur.
2. `action='archive'` ise: bu satırları ilgili `*_archive` tabloya kopyalar, sonra kaynaktan siler.
3. `action='delete'` ise: bu satırları doğrudan kaynaktan siler (arşivlemeden).
4. Her iki durumda da, işlemin kendisi `audit_log`'a `action='retention_enforced'`, `event_category='data_change'`, `new_data={category, affected_count, action}` şeklinde bir özet kayıt bırakır (FR-003).

`delete_with_justification(target_table TEXT, target_id UUID, justification_text TEXT)` (SECURITY DEFINER):
1. `target_table`'ın izin verilen tablolar allow-list'inde (`exposure_datasets`) olduğunu doğrular; değilse hata döner.
2. `justification_text` boş/NULL ise hata döner (FR-008).
3. Kaydı `target_table`'dan siler.
4. `audit_log`'a `action='delete'`, `table_name=target_table`, `record_id=target_id`, `justification=justification_text` ile bir kayıt ekler (FR-009) — `log_table_change()` trigger'ının ürettiği genel DELETE kaydına EK olarak (trigger zaten çalışacak, bu fonksiyon onun üstüne `justification` bilgisini ekler).

## New Function: `get_security_config_report()`

`RETURNS JSONB` (veya `RETURNS TABLE`, tasks.md'de netleştirilecek) — `get_access_review()` deseniyle aynı SECURITY DEFINER/STABLE/super_admin-only kısıtı. İçerik: `mfa_role_policy` satırları (rol→zorunluluk), `retention_policies` özet listesi, `profile_capability_grants` capability-bazlı aktif yetki sayıları (research.md Decision 6).

## New Client-Side Helper: `evidencePackage.js`

`buildEvidencePackageManifest({ capDraftId, receiptCount, auditLogCount, generatedAt })` — saf fonksiyon, ZIP içeriğinin `manifest.json` bölümünü üretir; Vitest ile test edilir (plan.md Testing).
