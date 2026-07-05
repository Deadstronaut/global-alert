-- =====================================================
-- One-off backfill: resolve country_code for pre-existing disaster rows
-- (rows inserted before the Aggregator started auto-resolving it — see
-- server/src/processors/geoCountry.js). Same bounding-box data, same
-- smallest-area-wins tie-break for overlapping countries.
-- Safe to re-run: only ever touches rows where country_code IS NULL.
-- =====================================================

CREATE TEMP TABLE country_bbox_tmp (
  code TEXT,
  min_lat DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  min_lng DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  area DOUBLE PRECISION GENERATED ALWAYS AS ((max_lat - min_lat) * (max_lng - min_lng)) STORED
);

INSERT INTO country_bbox_tmp (code, min_lat, max_lat, min_lng, max_lng) VALUES
  ('ad', 42.43, 42.66, 1.41, 1.79),
  ('ae', 22.63, 26.08, 51.58, 56.38),
  ('af', 29.38, 38.49, 60.52, 74.89),
  ('ag', 16.99, 17.73, -61.89, -61.67),
  ('al', 39.62, 42.67, 19.28, 21.08),
  ('am', 38.84, 41.3, 43.45, 46.63),
  ('ao', -18.04, -4.44, 11.68, 24.08),
  ('ar', -55.05, -21.78, -73.56, -53.65),
  ('at', 46.38, 49.02, 9.53, 17.16),
  ('au', -43.63, -10.67, 113.34, 153.57),
  ('az', 38.39, 41.9, 44.77, 50.95),
  ('ba', 42.56, 45.28, 15.75, 19.62),
  ('bb', 13.04, 13.34, -59.65, -59.43),
  ('bd', 20.74, 26.63, 88.01, 92.67),
  ('be', 49.5, 51.5, 2.54, 6.41),
  ('bf', 9.4, 15.08, -5.52, 2.4),
  ('bg', 41.24, 44.22, 22.36, 28.61),
  ('bh', 25.8, 26.33, 50.45, 50.84),
  ('bi', -4.47, -2.31, 29.02, 30.85),
  ('bj', 6.24, 12.41, 0.8, 3.84),
  ('bn', 4, 5.05, 114.08, 115.36),
  ('bo', -22.9, -9.69, -69.64, -57.45),
  ('br', -33.75, 5.27, -73.99, -34.73),
  ('bs', 23.18, 27.26, -79.1, -72.71),
  ('bt', 26.7, 28.33, 88.75, 92.12),
  ('bw', -26.91, -17.78, 19.99, 29.38),
  ('by', 51.26, 56.17, 23.18, 32.78),
  ('bz', 15.89, 18.5, -89.22, -87.77),
  ('ca', 41.67, 83.11, -141, -52.65),
  ('cd', -13.46, 5.38, 12.18, 31.31),
  ('cf', 2.22, 11, 14.42, 27.46),
  ('cg', -5.03, 3.71, 11.21, 18.65),
  ('ch', 45.83, 47.81, 5.96, 10.49),
  ('ci', 4.36, 10.74, -8.6, -2.49),
  ('cl', -55.98, -17.5, -75.64, -66.42),
  ('cm', 1.65, 13.08, 8.5, 16.19),
  ('cn', 18.16, 53.56, 73.5, 135.09),
  ('co', -4.23, 12.46, -81.73, -66.87),
  ('cr', 8.03, 11.22, -85.95, -82.55),
  ('cu', 19.82, 23.28, -84.95, -74.13),
  ('cv', 14.8, 17.2, -25.36, -22.67),
  ('cy', 34.63, 35.7, 32.27, 34.6),
  ('cz', 48.56, 51.06, 12.09, 18.87),
  ('de', 47.27, 55.06, 5.87, 15.04),
  ('dj', 10.93, 12.71, 41.77, 43.42),
  ('dk', 54.56, 57.75, 8.08, 15.2),
  ('dm', 15.2, 15.64, -61.5, -61.24),
  ('do', 17.47, 19.93, -72.01, -68.32),
  ('dz', 18.97, 37.09, -8.68, 11.99),
  ('ec', -4.99, 1.45, -80.97, -75.19),
  ('ee', 57.51, 59.68, 21.84, 28.21),
  ('eg', 22, 31.67, 24.7, 37.22),
  ('er', 12.36, 18, 36.43, 43.12),
  ('es', 27.64, 43.99, -18.16, 4.33),
  ('et', 3.4, 14.9, 33, 48),
  ('fi', 59.81, 70.09, 19.09, 31.59),
  ('fj', -20.68, -15.72, 177, 180),
  ('fr', 41.33, 51.12, -5.14, 9.56),
  ('ga', -3.98, 2.32, 8.7, 14.5),
  ('gb', 49.91, 60.85, -8.18, 1.76),
  ('ge', 41.06, 43.58, 39.99, 46.69),
  ('gh', 4.74, 11.17, -3.26, 1.19),
  ('gm', 13.06, 13.82, -16.84, -13.8),
  ('gn', 7.19, 12.67, -15.08, -7.64),
  ('gq', 0.92, 3.77, 5.62, 11.33),
  ('gr', 34.8, 41.75, 19.38, 28.25),
  ('gt', 13.74, 17.82, -92.23, -88.22),
  ('gw', 10.93, 12.68, -16.71, -13.64),
  ('gy', 1.18, 8.56, -61.41, -56.49),
  ('hn', 12.98, 16.52, -89.35, -83.15),
  ('hr', 42.39, 46.55, 13.49, 19.45),
  ('ht', 18.02, 20.09, -74.48, -71.62),
  ('hu', 45.74, 48.58, 16.11, 22.9),
  ('id', -11, 6.08, 95.01, 141.02),
  ('ie', 51.43, 55.39, -10.48, -5.99),
  ('il', 29.48, 33.34, 34.27, 35.9),
  ('in', 6.75, 35.51, 68.18, 97.4),
  ('iq', 29.07, 37.38, 38.79, 48.57),
  ('ir', 25.06, 39.78, 44.03, 63.33),
  ('is', 63.3, 66.57, -24.54, -13.5),
  ('it', 36.62, 47.1, 6.63, 18.52),
  ('jm', 17.7, 18.52, -78.37, -76.18),
  ('jo', 29.19, 33.37, 34.92, 39.3),
  ('jp', 24.4, 45.55, 122.94, 145.82),
  ('ke', -4.68, 4.98, 33.91, 41.9),
  ('kg', 39.19, 43.24, 69.28, 80.28),
  ('kh', 10.41, 14.69, 102.35, 107.63),
  ('km', -12.44, -11.37, 43.23, 44.59),
  ('kp', 37.67, 42.84, 124.25, 130.68),
  ('kr', 33.11, 38.61, 126.12, 129.58),
  ('kw', 28.52, 30.11, 46.55, 48.43),
  ('kz', 40.56, 55.43, 50.27, 87.36),
  ('la', 13.93, 22.5, 100.09, 107.64),
  ('lb', 33.09, 34.69, 35.12, 36.62),
  ('li', 47.05, 47.27, 9.47, 9.64),
  ('lk', 5.92, 9.84, 79.7, 81.89),
  ('lr', 4.36, 8.55, -11.49, -7.37),
  ('ls', -30.65, -28.57, 27.01, 29.46),
  ('lt', 53.91, 56.45, 20.94, 26.84),
  ('lu', 49.45, 50.18, 5.74, 6.53),
  ('lv', 55.67, 58.08, 20.97, 28.24),
  ('ly', 19.5, 33.17, 9.39, 25.15),
  ('ma', 27.67, 35.93, -13.17, -0.99),
  ('mc', 43.72, 43.75, 7.41, 7.44),
  ('md', 45.47, 48.49, 26.62, 30.16),
  ('me', 41.85, 43.55, 18.45, 20.36),
  ('mg', -25.61, -11.95, 43.22, 50.48),
  ('mk', 40.86, 42.36, 20.46, 23.03),
  ('ml', 10.14, 25, -4.24, 4.27),
  ('mm', 9.78, 28.54, 92.19, 101.18),
  ('mn', 41.59, 52.15, 87.76, 119.93),
  ('mr', 14.72, 27.3, -17.07, -4.83),
  ('mt', 35.8, 36.08, 14.18, 14.58),
  ('mu', -20.52, -19.98, 57.31, 57.8),
  ('mv', -0.69, 7.1, 72.68, 73.76),
  ('mw', -17.13, -9.37, 32.68, 35.92),
  ('mx', 14.53, 32.72, -117.13, -86.74),
  ('my', 0.85, 7.36, 99.64, 119.28),
  ('mz', -26.87, -10.47, 30.22, 40.84),
  ('na', -28.97, -16.96, 11.72, 25.26),
  ('ne', 11.69, 23.52, 0.16, 15.9),
  ('ng', 4.27, 13.89, 2.69, 14.68),
  ('ni', 10.71, 14.99, -87.69, -83.15),
  ('nl', 50.8, 53.51, 3.36, 7.23),
  ('no', 57.97, 71.19, 4.65, 31.1),
  ('np', 26.37, 30.42, 80.06, 88.2),
  ('nz', -47.29, -34.39, 166.43, 178.57),
  ('om', 16.65, 26.4, 51.83, 59.85),
  ('pa', 7.2, 9.65, -83.05, -77.16),
  ('pe', -18.35, -0.06, -81.41, -68.66),
  ('pg', -11.66, -1.31, 141.02, 155.65),
  ('ph', 4.64, 21.12, 116.93, 126.6),
  ('pk', 23.69, 37.1, 60.87, 77.1),
  ('pl', 49, 54.84, 14.12, 24.15),
  ('pt', 36.84, 42.15, -9.52, -6.19),
  ('py', -27.59, -19.29, -62.64, -54.29),
  ('qa', 24.56, 26.18, 50.75, 51.61),
  ('ro', 43.62, 48.27, 22.09, 29.72),
  ('rs', 42.23, 46.18, 18.82, 22.99),
  ('ru', 41.19, 81.86, 19.64, 190),
  ('rw', -2.84, -1.06, 28.86, 30.9),
  ('sa', 16.38, 32.16, 34.49, 55.67),
  ('sb', -11.86, -6, 155.51, 169.99),
  ('sd', 8.69, 22.22, 23.99, 38.68),
  ('se', 55.34, 69.06, 11.12, 24.16),
  ('sg', 1.16, 1.48, 103.6, 104.09),
  ('si', 45.42, 46.88, 13.38, 16.61),
  ('sk', 47.73, 49.61, 16.83, 22.57),
  ('sl', 6.93, 10.05, -13.31, -10.28),
  ('sm', 43.89, 43.99, 12.4, 12.52),
  ('sn', 12.31, 16.69, -17.54, -11.36),
  ('so', -1.68, 11.98, 40.99, 51.41),
  ('sr', 1.83, 6, -58.07, -53.98),
  ('ss', 3.49, 12.22, 24.14, 36.88),
  ('sv', 13.15, 14.45, -90.1, -87.69),
  ('sy', 32.31, 37.32, 35.73, 42.38),
  ('sz', -27.32, -25.72, 30.79, 32.14),
  ('td', 7.44, 23.45, 13.47, 24),
  ('tg', 6.1, 11.14, -0.15, 1.81),
  ('th', 5.61, 20.47, 97.34, 105.64),
  ('tj', 36.67, 41.04, 67.34, 75.16),
  ('tl', -9.47, -8.14, 124.04, 127.34),
  ('tm', 35.14, 42.8, 52.45, 66.69),
  ('tn', 30.24, 37.54, 7.52, 11.6),
  ('to', -22.34, -15.56, -176.21, -173.74),
  ('tr', 35.8, 42.2, 25.6, 44.8),
  ('tt', 10.03, 11.37, -61.92, -60.52),
  ('tz', -11.75, -0.99, 29.34, 40.44),
  ('ua', 44.39, 52.38, 22.14, 40.23),
  ('ug', -1.48, 4.23, 29.57, 35),
  ('us', 24.52, 71.35, -179.14, -66.95),
  ('uy', -34.9, -30.11, -58.44, -53.09),
  ('uz', 37.18, 45.59, 55.99, 73.13),
  ('vc', 12.59, 13.38, -61.46, -61.12),
  ('ve', 0.65, 12.2, -73.35, -59.76),
  ('vn', 8.19, 23.39, 102.14, 109.46),
  ('vu', -20.25, -13.07, 166.54, 169.97),
  ('ws', -14.07, -13.44, -172.8, -171.43),
  ('ye', 12.11, 19, 42.54, 54.98),
  ('za', -34.83, -22.13, 16.48, 32.89),
  ('zm', -18.08, -8.22, 21.99, 33.7),
  ('zw', -22.42, -15.61, 25.24, 33.07);

UPDATE earthquake d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

UPDATE wildfire d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

UPDATE flood d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

UPDATE drought d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

UPDATE food_security d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

UPDATE tsunami d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

UPDATE cyclone d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

UPDATE volcano d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

UPDATE epidemic d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

UPDATE disaster d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );

DROP TABLE country_bbox_tmp;
