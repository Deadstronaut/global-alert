# Quickstart: Audit & Compliance Gaps

## Prerequisites

- Migration `<timestamp>_audit_compliance_gaps.sql` uygulanmış (`npx supabase db push --linked`).
- `npm install jszip` çalıştırılmış.
- Test için: bir yayınlanmış CAP taslağı (dispatch_receipts + audit_log kayıtları olan), en az bir `exposure_datasets` kaydı, bir hesabın kilitlenmesini tetikleyecek kadar başarısız giriş denemesi.

## Senaryo 1 — Retention policy (US1)

1. Super_admin olarak `dispatch_receipts` kategorisi için `retention_days=1`, `action='archive'` bir politika tanımlayın.
2. `created_at`'i 2 günden eski bir test `dispatch_receipts` satırı oluşturun (veya mevcut bir satırı elle güncelleyin).
3. `enforce_retention_policies()` fonksiyonunu manuel çağırın (pg_cron beklemeden).
4. **Beklenen**: Satır `dispatch_receipts`'ten kaybolur, `dispatch_receipts_archive`'da aynı içerikle görünür; `audit_log`'da bir `retention_enforced` özet kaydı oluşur.
5. Hiç politika tanımlanmamış bir kategori (ör. `audit_log`, eğer politika silinmişse) için fonksiyonu tekrar çağırın: hiçbir satır etkilenmemeli (FR-002).

## Senaryo 2 — Evidence package export (US2)

1. Yayınlanmış (broadcast) bir CAP taslağı seçin.
2. CapView.vue'da "Kanıt Paketi İndir" butonuna tıklayın.
3. **Beklenen**: İndirilen `.zip` içinde `alert.xml`, `receipts.csv`, `audit-log.csv`, `manifest.json` bulunur; içerikler ilgili taslağa aittir.
4. Hiç alım kaydı olmayan bir taslak için tekrarlayın: `receipts.csv` boş/"veri yok" olur, paket yine oluşur (hata vermez).
5. Henüz yayınlanmamış (draft/pending_approval) bir taslak için butonu deneyin: buton devre dışı olmalı veya net bir hata mesajı gösterilmeli.

## Senaryo 3 — Kontrollü silme (US3)

1. Bir exposure dataset seçip "Sil" butonuna tıklayın.
2. Gerekçe alanını boş bırakıp onaylamayı deneyin.
3. **Beklenen**: İşlem engellenir, gerekçe zorunlu mesajı gösterilir.
4. Bir gerekçe girip onaylayın.
5. **Beklenen**: Dataset silinir; `audit_log`'da bu silme olayına ait satırda `justification` alanı doludur.

## Senaryo 4 — Güvenlik olayı günlüğü (US4)

1. Bir test hesabını art arda başarısız girişlerle kilitleyin (spec 028 eşiği, varsayılan 5 deneme).
2. Super_admin panelinde "Güvenlik Olayları" görünümünü açın.
3. **Beklenen**: Kilitlenme olayı bu listede görünür; genel veri-değişiklik kayıtları bu listede görünmez.
4. Hiç güvenlik olayı olmayan bir ortamda görünümü açın: boş durum mesajı gösterilmeli.

## Senaryo 5 — Güvenlik yapılandırması raporu (US5)

1. En az bir retention policy, bir aktif capability grant tanımlı olsun.
2. Super_admin panelinde "Güvenlik Yapılandırması Raporu"nu açın.
3. **Beklenen**: MFA rol politikaları, retention policy sayısı/listesi, capability grant sayıları güncel veriyle eşleşir.
4. CSV/JSON export butonlarını deneyin: indirilen dosya rapor içeriğiyle eşleşmeli.
