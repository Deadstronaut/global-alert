# Quickstart: Tatbikat İçin Simüle Tehlike Enjeksiyonu

Migration'ın uygulanmış olduğu bir Supabase ortamı varsayılır.

## Ön koşullar

- En az bir `country_admin` (veya `super_admin`) test hesabı.
- Kendi ülkesinde `active` durumda bir `drill_session` (AdminView → Tatbikat sekmesinden başlatılabilir).

## Senaryo 1 — Enjeksiyon (User Story 1)

1. `country_admin` ile giriş yap, AdminView → Tatbikat sekmesini aç, `active` bir tatbikatın
   kartındaki "Olay Enjekte Et" formunu doldur (afet tipi, konum, şiddet, açıklama), gönder.
2. **Beklenen**: Yeni satır `drill_injected_events`'te o `drill_session_id`'ye bağlı oluşur.
3. Aynı formu, hiçbir tatbikat `active` değilken açmaya çalış.
4. **Beklenen**: Enjeksiyon formu gösterilmez/engellenir.

## Senaryo 2 — Gerçekçi görüntüleme + TATBİKAT rozeti (User Story 2)

1. Senaryo 1'deki enjekte olayla, herhangi bir hesapla (viewer dahil) ana haritayı aç.
2. **Beklenen**: Olay, gerçek afet olaylarıyla aynı katmanda ama her zaman görünür "TATBİKAT"
   rozetiyle görünür.
3. Haritada zoom/filtre/tema değiştir.
4. **Beklenen**: Rozet hiçbir koşulda kaybolmaz.

## Senaryo 3 — Tatbikat bitince temizlenme (User Story 3)

1. Senaryo 1'deki tatbikatı AdminView'dan durdur (`completed`).
2. Ana haritayı yeniden yükle.
3. **Beklenen**: Enjekte olay artık haritada görünmez.
4. Service-role (veya doğrudan SQL) ile `drill_injected_events` sorgula.
5. **Beklenen**: Kayıt hâlâ mevcut (silinmemiş).

## Senaryo 4 — İzolasyon garantisi (User Story 4)

1. Aktif bir tatbikatta bir enjekte olay varken, CapView.vue'yu aç; "tespit edilen olaylar"
   seçicisinde bu olayın da listelendiğini doğrula.
2. O olaydan bir CAP taslağı oluştur.
3. **Beklenen**: Taslak `is_exercise=true` ile oluşur (mevcut spec 013 trigger'ı).
4. Gerçek afet olayı export'larını (CSV/JSON/GeoJSON) veya sayaçlarını üret.
5. **Beklenen**: Enjekte olay bu çıktılarda hiç görünmez.
6. Tatbikatı bitirip yıllık tatbikat performans raporunu (spec 032) üret.
7. **Beklenen**: Rapor mevcut mantığıyla değişmeden çalışır, enjekte olay sayısı raporun hiçbir
   alanına dahil edilmez.

## Not

Migration'ın canlıya (`--linked`) push'u kullanıcı onayı gerektiren, bu plan/tasks aşamasında
YAPILMAYAN, ayrı bir adımdır (spec 009 T051'den beri süregelen proje konvansiyonu).
