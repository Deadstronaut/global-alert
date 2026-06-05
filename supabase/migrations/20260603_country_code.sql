-- =====================================================
-- Tüm afet tablolarına country_code kolonu ekle
-- Bu kolon sayesinde:
--   1. Sunucu tarafında ülke filtrelemesi yapılabilir
--   2. RLS politikaları country_code üzerinden çalışır
--   3. Index ile sorgu performansı artar
--
-- Mevcut satırlar için NULL kalır (backfill ayrı adımda)
-- RLS politikaları şimdilik değiştirilmez (Phase 3)
-- =====================================================

-- Kolonları ekle
ALTER TABLE earthquake    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE wildfire      ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE flood         ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE drought       ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE food_security ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE tsunami       ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE cyclone       ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE volcano       ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE epidemic      ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE disaster      ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

-- Index: ülke bazlı sorgular için (composite: country_code + time)
CREATE INDEX IF NOT EXISTS idx_earthquake_country    ON earthquake    (country_code, time DESC);
CREATE INDEX IF NOT EXISTS idx_wildfire_country      ON wildfire      (country_code, time DESC);
CREATE INDEX IF NOT EXISTS idx_flood_country         ON flood         (country_code, time DESC);
CREATE INDEX IF NOT EXISTS idx_drought_country       ON drought       (country_code, time DESC);
CREATE INDEX IF NOT EXISTS idx_food_security_country ON food_security (country_code, time DESC);
CREATE INDEX IF NOT EXISTS idx_tsunami_country       ON tsunami       (country_code, time DESC);
CREATE INDEX IF NOT EXISTS idx_cyclone_country       ON cyclone       (country_code, time DESC);
CREATE INDEX IF NOT EXISTS idx_volcano_country       ON volcano       (country_code, time DESC);
CREATE INDEX IF NOT EXISTS idx_epidemic_country      ON epidemic      (country_code, time DESC);

-- View'ları güncelle: country_code kolonu dahil et
-- (mevcut view'ları drop edip yeniden oluştur)

DROP VIEW IF EXISTS earthquake_view;
CREATE VIEW earthquake_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude, depth,
       title, description, time, source, source_url, extra, received_at, country_code
FROM earthquake
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS wildfire_view;
CREATE VIEW wildfire_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude,
       title, description, time, source, source_url, extra, received_at, country_code
FROM wildfire
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS flood_view;
CREATE VIEW flood_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude,
       title, description, time, source, source_url, extra, received_at, country_code
FROM flood
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS drought_view;
CREATE VIEW drought_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude,
       title, description, time, source, source_url, extra, received_at, country_code
FROM drought
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS food_security_view;
CREATE VIEW food_security_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude,
       title, description, time, source, source_url, extra, received_at, country_code
FROM food_security
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS tsunami_view;
CREATE VIEW tsunami_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude,
       title, description, time, source, source_url, extra, received_at, country_code
FROM tsunami
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS cyclone_view;
CREATE VIEW cyclone_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude,
       title, description, time, source, source_url, extra, received_at, country_code
FROM cyclone
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS volcano_view;
CREATE VIEW volcano_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude,
       title, description, time, source, source_url, extra, received_at, country_code
FROM volcano
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS epidemic_view;
CREATE VIEW epidemic_view AS
SELECT id, type, lat, lng, h3_id, severity, magnitude,
       title, description, time, source, source_url, extra, received_at, country_code
FROM epidemic
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;
