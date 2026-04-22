-- =====================================================
-- Disaster Views
-- Sadece geçersiz koordinatları atar, time DESC sıralar.
-- Tüm filtreleme (tarih, severity, magnitude) frontend'de yapılır.
-- =====================================================

DROP VIEW IF EXISTS earthquake_view;
CREATE VIEW earthquake_view AS
SELECT id, type, lat, lng, severity, magnitude, depth,
       title, description, time, source, source_url, extra, received_at
FROM earthquake
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS wildfire_view;
CREATE VIEW wildfire_view AS
SELECT id, type, lat, lng, severity, magnitude,
       title, description, time, source, source_url, extra, received_at
FROM wildfire
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS flood_view;
CREATE VIEW flood_view AS
SELECT id, type, lat, lng, severity, magnitude,
       title, description, time, source, source_url, extra, received_at
FROM flood
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS drought_view;
CREATE VIEW drought_view AS
SELECT id, type, lat, lng, severity, magnitude,
       title, description, time, source, source_url, extra, received_at
FROM drought
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS food_security_view;
CREATE VIEW food_security_view AS
SELECT id, type, lat, lng, severity, magnitude,
       title, description, time, source, source_url, extra, received_at
FROM food_security
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS tsunami_view;
CREATE VIEW tsunami_view AS
SELECT id, type, lat, lng, severity, magnitude,
       title, description, time, source, source_url, extra, received_at
FROM tsunami
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS cyclone_view;
CREATE VIEW cyclone_view AS
SELECT id, type, lat, lng, severity, magnitude,
       title, description, time, source, source_url, extra, received_at
FROM cyclone
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS volcano_view;
CREATE VIEW volcano_view AS
SELECT id, type, lat, lng, severity, magnitude,
       title, description, time, source, source_url, extra, received_at
FROM volcano
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS epidemic_view;
CREATE VIEW epidemic_view AS
SELECT id, type, lat, lng, severity, magnitude,
       title, description, time, source, source_url, extra, received_at
FROM epidemic
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;

DROP VIEW IF EXISTS early_warnings_view;
CREATE VIEW early_warnings_view AS
SELECT * FROM early_warnings
ORDER BY created_at DESC;
