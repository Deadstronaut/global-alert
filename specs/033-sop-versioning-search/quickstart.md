# Quickstart: SOP Repository Sürümleme, Kategori ve Arama

## Ön koşullar

- Migration uygulanmış olmalı (`npx supabase db push --linked`)
- En az bir SOP dokümanı mevcut

## Senaryo 1: Kategori ve arama

1. `npm run test -- sopFilter` — `filterSopDocuments()` testlerini çalıştır.
2. SopRepositoryPanel.vue'da birkaç farklı kategoride SOP oluştur, kategori filtresi uygula, sadece o kategorideki SOP'ların listelendiğini doğrula.
3. Bir başlık arama terimi gir, sadece eşleşen SOP'ların listelendiğini doğrula.

## Senaryo 2: Sürüm geçmişi

1. Bir SOP'un içeriğini güncelle, `sop_document_versions`'a bir kayıt eklendiğini (salt-okunur sorgu) ve `sop_documents.version`'ın arttığını doğrula.
2. Aynı SOP'u sadece `is_active` değiştirerek güncelle — `sop_document_versions`'a YENİ bir kayıt eklenmediğini doğrula (transactional test, ROLLBACK ile).
3. SopRepositoryPanel.vue'da "Geçmiş Sürümler" bağlantısına tıkla, önceki içeriğin doğru göründüğünü doğrula.
4. Hiç güncellenmemiş bir SOP için aynı görünümün "henüz geçmiş sürüm yok" mesajı gösterdiğini doğrula.

## Senaryo 3: Regresyon kontrolü

1. `npm run test` (tüm suite) — mevcut testlerin bozulmadığını doğrula.
2. `npm run build` — temiz build.
3. Mevcut hazard-tipi eşleştirmesinin (incident'ta otomatik SOP gösterimi) hiç değişmediğini doğrula.
