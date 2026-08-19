# Quickstart: Rüzgar Yönüne Dayalı Yayılım Tahmini

Bu özelliğin uçtan uca çalıştığını doğrulamak için gereken adımlar. Yeni bir migration/servis kurulumu YOK (research.md R1/R2) — mevcut dev ortamı (`npm run dev`) ve mevcut Supabase projesi yeterli.

## Ön Koşullar

- Mevcut `.env`'deki `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` çalışır durumda (zaten mevcut).
- Seçtiğiniz bölgede güncel bir `flow_snapshots` (`wind`) satırı olmalı — Rüzgar & Akıntı panelinde "Wind" Animate katmanını açıp parçacıkların hareket ettiğini görebiliyorsanız veri mevcut demektir.
- Aynı bölgede rüzgardan-etkilenen bir afet tipinden (yangın, toz fırtınası, yanardağ veya kasırga) en az bir aktif olay olmalı.

## Doğrulama Senaryosu 1 — Rüzgar yönü göstergesi (US1)

1. Uygulamayı açın, 2B harita moduna geçin.
2. Rüzgar & Akıntı panelini açın (radar ikonu), "Wind" Animate katmanını etkinleştirin.
3. **Beklenen**: Hız ısı haritasının/parçacık animasyonunun yanında/üzerinde, rüzgarın taşıdığı yönü gösteren bir işaret (ok/vektör) görünür.
4. Rüzgar verisi ingest edilmemiş bir bölgeye geçin (ör. veri kapsamı dışı bir nokta).
5. **Beklenen**: Yön göstergesi sessizce kaybolur, hiçbir uydurma/varsayılan yön gösterilmez.

## Doğrulama Senaryosu 2 — Olası etki alanı (US2)

1. Haritada, rüzgardan-etkilenen bir afet tipinden aktif bir olay bulun (ör. bir yangın).
2. Bu olayı seçin.
3. **Beklenen**: 3 saniye içinde, rüzgarın estiği yöndeki komşu hex'ler "olası etki alanı" olarak görsel şekilde işaretlenir (renklendirilmiş hex grubu veya yön oku/koni).
4. Aynı adımı, rüzgardan-etkilenmeyen bir afet tipiyle (ör. bir deprem) tekrarlayın.
5. **Beklenen**: Hiçbir yayılım göstergesi görünmez — özellik bu afet tipi için hiç devreye girmez (FR-009).
6. Rüzgarın çok zayıf olduğu bir bölgede/zamanda bir afet seçin.
7. **Beklenen**: "Belirgin bir yayılım yönü yok" durumu gösterilir, yanıltıcı bir yön uydurulmaz.

## Doğrulama Senaryosu 3 — Etki Analizine bağlama (US3)

1. Senaryo 2'de üretilen olası etki alanını seçin.
2. Etki Analizi paneli ile incelemeyi tetikleyin.
3. **Beklenen**: Mevcut Etki Analizi paneli, elle bölge çizmeye gerek kalmadan bu alanı bir bölge olarak kullanarak nüfus/kritik altyapı hesaplaması yapar.

## Regresyon Kontrolleri (mevcut davranış bozulmamalı)

- Rüzgar & Akıntı panelindeki mevcut hız ısı haritası ve Animate parçacık katmanı, bu özellik öncesiyle birebir aynı görünmeye/çalışmaya devam etmeli (bu özellik `flow_texture_common.py`/`fetch_gfs.py`'yi DEĞİŞTİRMİYOR, sadece istemci tarafında aynı veriyi bir noktada okuyor).
- Mevcut Etki Analizi akışı (elle bölge seçme) bu özellikten önceki gibi çalışmaya devam etmeli — yeni "olası etki alanından aktar" yolu, mevcut yolu değiştirmiyor, ona ek bir giriş noktası ekliyor.
- 7 dilin hepsinde (tr, en, es, fr, ru, ar, zh) yeni UI metinleri (yön göstergesi etiketleri, "olası etki alanı" başlığı, veri-yok durum mesajı) eksiksiz olmalı — `node -e "JSON.parse(...)"` ile her locale dosyası doğrulanmalı (mevcut oturum deseni).
