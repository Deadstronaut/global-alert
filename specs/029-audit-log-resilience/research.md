# Research: Denetim Günlüğü Dayanıklılığı

## Decision 1: "Bağlantı geri gelince flush et" bu projenin mimarisinde nasıl yorumlanır?

**Decision**: "Flush", bir Super Admin'in manuel olarak tetiklediği `flush_audit_dead_letter()` fonksiyonunun her çağrısında "bir sonraki başarılı deneme" olarak yorumlanır — gerçek bir ağ bağlantısı/reconnect olayı YOKTUR.

**Rationale**: PRD'nin bu gereksinimi muhtemelen audit olaylarının ayrı bir servise/kuyruğa ağ üzerinden gönderildiği bir mimari varsayıyor (örn. bir mesaj kuyruğu, harici bir log toplama servisi). Bu projede denetim yazımı, denetlenen tabloyla AYNI transaction içinde çalışan bir Postgres trigger'ıdır — "bağlantı" kavramı burada anlamsızdır (aynı veritabanı, aynı transaction). Kullanıcıyla netleştirilip onaylandı (AskUserQuestion): pratik karşılığı, hatanın kaybolmadan bir yerde bekletilmesi ve daha sonra (manuel tetiklemeyle) tekrar denenmesidir.

**Alternatives considered**: `pg_net` ile harici bir kuyruk servisine yazmak — reddedildi, aşırı mühendislik (bu proje zaten Supabase-native, harici bir kuyruk sistemi yok, YAGNI).

## Decision 2: Tamlık doğrulaması — CHECK constraint mi, BEFORE INSERT trigger mi?

**Decision**: Basit bir `CHECK` constraint tercih edilir: `CHECK (action NOT IN ('INSERT','UPDATE','DELETE') OR (table_name IS NOT NULL AND record_id IS NOT NULL))`.

**Rationale**: Bu kural saf bir veri bütünlüğü kısıtlaması — herhangi bir yan etki veya karmaşık mantık gerektirmiyor, bu yüzden bir trigger'dan daha basit ve daha güvenilir bir CHECK constraint yeterli (YAGNI). Mevcut `log_table_change()` trigger'ı zaten her zaman bu alanları dolu bıraktığı için mevcut hiçbir satırı etkilemez; sadece gelecekteki hatalı manuel `INSERT INTO audit_log` çağrılarını (örn. yeni bir spec'in unutkan bir geliştiricisi) yakalar.

**Alternatives considered**: Yeni bir `validate_audit_completeness()` BEFORE INSERT trigger fonksiyonu — reddedildi, CHECK constraint aynı sonucu daha az kodla sağlıyor; trigger sadece constraint'in ifade edemeyeceği bir çapraz-tablo mantığı gerektiğinde gerekli olurdu (burada gerekmiyor).

## Decision 3: `log_table_change()`'in exception-yakalama davranışı — her INSERT ayrı ayrı mı, tek bir ortak blok mu?

**Decision**: Fonksiyonun üç dalının (`INSERT`/`UPDATE`/`DELETE`) her biri kendi `BEGIN...EXCEPTION WHEN OTHERS THEN...INSERT INTO audit_log_dead_letter...END` bloğuna sahip olur; hata durumunda dahi fonksiyon her zaman doğru değeri (`RETURN NEW` veya `RETURN OLD`) döndürmeye devam eder.

**Rationale**: Bu, mevcut fonksiyonun yapısına (üç ayrı `IF TG_OP = ...` dalı) en az müdahaleyle uyan, en açık yaklaşımdır — her dal kendi bağlamında (NEW/OLD hangisi mevcutsa) dead-letter kaydını oluşturabilir.

**Alternatives considered**: Tüm fonksiyonu tek bir dış `BEGIN...EXCEPTION` bloğuna sarmak — reddedildi, bu durumda hangi dalın (`INSERT`/`UPDATE`/`DELETE`) başarısız olduğu bilgisi kaybolabilir ve `RETURN NEW`/`RETURN OLD` ayrımı bulanıklaşır.

## Decision 4: `audit_log_dead_letter` şeması ve erişimi

**Decision**: Yeni tablo — `id, action, table_name, record_id, old_data, new_data, error_message, failed_at DEFAULT NOW()`. RLS: sadece `super_admin_read_audit`'in birebir aynısı bir SELECT policy'si; hiçbir role doğrudan INSERT/UPDATE/DELETE izni verilmez (sadece `log_table_change()`/`flush_audit_dead_letter()`'ın SECURITY DEFINER context'i üzerinden yazılabilir/silinebilir).

**Rationale**: Mevcut `audit_log`'un erişim desenini birebir tekrarlamak (spec 007'nin "sadece super_admin okuyabilir" ilkesiyle tutarlı) — bu, hassas denetim verisinin (old_data/new_data JSONB) yanlışlıkla daha geniş bir role açılmasını önler.

**Alternatives considered**: `audit_log`'un kendisine bir `status` kolonu eklemek (`'written'`/`'failed'`) yerine ayrı bir tabloya taşımak — ayrı tablo tercih edildi çünkü `audit_log` append-only ve hash-zincirli (spec 007); başarısız bir kaydı sonradan `status` güncelleyerek "düzeltmek" bu ilkeyi ihlal ederdi. Ayrı bir tablo, `audit_log`'un immutability garantisini hiç bozmadan aynı sonucu sağlar.
