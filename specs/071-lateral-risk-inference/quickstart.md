# Quickstart: Çapraz-Afet Risk Çıkarımı ve Öngörü Raporu

## Ön koşullar

- Canlı ortamda, seçilecek afetlerin `h3_id` alanı dolu olmalı (spec 070 ile paylaşılan ön koşul — bkz. [[project_disaster_volume_aggregation_fix]] belleği: ingest servisi henüz redeploy edilmediyse `backfillH3.js` ile manuel doldurulabilir).
- `mgoktugd@gmail.com` / canlı kimlik bilgileriyle giriş yapılmış, `country_admin` veya üstü bir rol (rapor `canAnalyze` gate'ine tabi).

## Doğrulama Senaryosu 1 — İkincil risk bulguları (US1)

1. Bölgede aktif bir kuraklık VEYA sıcak/soğuk hava dalgası olayı olan bir yerde bir deprem seç.
2. Afet detayında/Etki Analizi panelinde "yangın çıkma/yayılma riski potansiyeli" bulgusunun, hangi katmana dayandığı belirtilerek listelendiğini doğrula.
3. Aynı ekranda, hiçbir ilgili katman aktif olmayan başka bir deprem seç; "belirgin bir ikincil risk tespit edilmedi" mesajının göründüğünü doğrula.

## Doğrulama Senaryosu 2 — Tetikleyici + tek sayfalık rapor (US2)

1. Önem eşiğini aşan (ör. magnitude ≥ 6.0) bir deprem verisiyle ana paneli görüntüle; tetikleyici rozetin göründüğünü (reduced-motion kapalıyken yanıp söndüğünü, açıkken sabit rozet olduğunu) doğrula.
2. Tetikleyiciye tıkla; raporun şu bölümlerle açıldığını doğrula: "SEZGİSEL ÖNGÖRÜ..." etiketi, etkilenen şehir/kasaba listesi, etkilenen kritik tesis listesi, ikincil risk listesi, önerilen kurum türleri (özel isim değil, kategori).
3. Tarayıcı ağ sekmesinde, rapor açıkken/kapanırken hiçbir üçüncü-taraf (e-posta/mesajlaşma/webhook) isteği gitmediğini doğrula.

## Doğrulama Senaryosu 3 — Kıyı yakınlığı sezgisi (US3)

1. Kıyıya yakın, eşik-üstü büyüklükte bir deprem seç; "tsunami riski potansiyeli (kaba coğrafi sezgi...)" bulgusunun listelendiğini doğrula.
2. Karanın iç kesiminde bir deprem seç; bu bulgunun hiç görünmediğini doğrula.

## Regresyon Kontrolleri

- Mevcut Etki Analizi (manuel bölge seçme, `radiusOverride`, kritik altyapı listesi) akışı bu özellik öncesiyle birebir aynı çalışmalı.
- Spec 070'in rüzgar-yayılım bulgusu (varsa) bu raporun ikincil-risk listesinde bir satır olarak görünmeli, ayrıca tekrar hesaplanmamalı.
- 7 locale dosyası da geçerli JSON kalmalı, yeni anahtarların hepsi çevrilmiş olmalı.
