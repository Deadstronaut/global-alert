-- =====================================================
-- Backfill country_code based on lat/lng bboxes
-- Sorted by bbox area ascending to prioritize smaller countries in overlapping zones.
-- =====================================================

UPDATE earthquake
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE earthquake
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE earthquake
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE earthquake
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE earthquake
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE earthquake
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE earthquake
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE earthquake
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE earthquake
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE earthquake
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE earthquake
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE earthquake
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE earthquake
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE earthquake
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE earthquake
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE earthquake
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE earthquake
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE earthquake
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE earthquake
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE earthquake
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE earthquake
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE earthquake
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE earthquake
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE earthquake
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE earthquake
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE earthquake
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE earthquake
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE earthquake
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE earthquake
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE earthquake
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE earthquake
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE earthquake
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE earthquake
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE earthquake
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE earthquake
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE earthquake
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE earthquake
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE earthquake
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE earthquake
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE earthquake
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE earthquake
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE earthquake
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE earthquake
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE earthquake
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE earthquake
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE earthquake
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE earthquake
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE earthquake
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE earthquake
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE earthquake
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE earthquake
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE earthquake
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE earthquake
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE earthquake
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE earthquake
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE earthquake
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE earthquake
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE earthquake
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE earthquake
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE earthquake
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE earthquake
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE earthquake
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE earthquake
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE earthquake
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE earthquake
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE earthquake
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE earthquake
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE earthquake
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE earthquake
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE earthquake
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE earthquake
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE earthquake
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE earthquake
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE earthquake
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE earthquake
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE earthquake
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE earthquake
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE earthquake
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE earthquake
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE earthquake
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE earthquake
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE earthquake
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE earthquake
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE earthquake
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE earthquake
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE earthquake
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE earthquake
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE earthquake
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE earthquake
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE earthquake
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE earthquake
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE earthquake
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE earthquake
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE earthquake
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE earthquake
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE earthquake
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE earthquake
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE earthquake
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE earthquake
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE earthquake
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE earthquake
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE earthquake
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE earthquake
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE earthquake
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE earthquake
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE earthquake
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE earthquake
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE earthquake
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE earthquake
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE earthquake
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE earthquake
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE earthquake
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE earthquake
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE earthquake
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE earthquake
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE earthquake
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE earthquake
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE earthquake
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE earthquake
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE earthquake
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE earthquake
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE earthquake
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE earthquake
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE earthquake
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE earthquake
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE earthquake
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE earthquake
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE earthquake
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE earthquake
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE earthquake
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE earthquake
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE earthquake
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE earthquake
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE earthquake
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE earthquake
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE earthquake
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE earthquake
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE earthquake
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE earthquake
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE earthquake
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE earthquake
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE earthquake
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE earthquake
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE earthquake
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE earthquake
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE earthquake
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE earthquake
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE earthquake
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE earthquake
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE earthquake
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE earthquake
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE earthquake
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE earthquake
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE earthquake
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE earthquake
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE earthquake
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE earthquake
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE earthquake
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE earthquake
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE earthquake
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE earthquake
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE earthquake
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE earthquake
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE earthquake
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE earthquake
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE earthquake
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE earthquake
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE earthquake
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE earthquake
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE earthquake
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE earthquake
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE earthquake
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE earthquake
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE earthquake
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE earthquake
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE earthquake
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE earthquake
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE earthquake
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE earthquake
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE earthquake
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE earthquake
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE earthquake
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

UPDATE wildfire
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE wildfire
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE wildfire
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE wildfire
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE wildfire
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE wildfire
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE wildfire
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE wildfire
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE wildfire
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE wildfire
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE wildfire
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE wildfire
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE wildfire
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE wildfire
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE wildfire
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE wildfire
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE wildfire
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE wildfire
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE wildfire
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE wildfire
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE wildfire
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE wildfire
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE wildfire
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE wildfire
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE wildfire
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE wildfire
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE wildfire
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE wildfire
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE wildfire
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE wildfire
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE wildfire
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE wildfire
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE wildfire
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE wildfire
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE wildfire
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE wildfire
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE wildfire
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE wildfire
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE wildfire
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE wildfire
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE wildfire
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE wildfire
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE wildfire
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE wildfire
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE wildfire
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE wildfire
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE wildfire
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE wildfire
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE wildfire
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE wildfire
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE wildfire
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE wildfire
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE wildfire
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE wildfire
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE wildfire
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE wildfire
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE wildfire
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE wildfire
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE wildfire
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE wildfire
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE wildfire
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE wildfire
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE wildfire
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE wildfire
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE wildfire
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE wildfire
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE wildfire
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE wildfire
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE wildfire
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE wildfire
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE wildfire
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE wildfire
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE wildfire
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE wildfire
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE wildfire
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE wildfire
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE wildfire
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE wildfire
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE wildfire
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE wildfire
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE wildfire
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE wildfire
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE wildfire
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE wildfire
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE wildfire
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE wildfire
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE wildfire
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE wildfire
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE wildfire
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE wildfire
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE wildfire
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE wildfire
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE wildfire
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE wildfire
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE wildfire
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE wildfire
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE wildfire
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE wildfire
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE wildfire
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE wildfire
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE wildfire
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE wildfire
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE wildfire
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE wildfire
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE wildfire
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE wildfire
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE wildfire
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE wildfire
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE wildfire
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE wildfire
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE wildfire
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE wildfire
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE wildfire
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE wildfire
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE wildfire
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE wildfire
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE wildfire
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE wildfire
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE wildfire
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE wildfire
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE wildfire
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE wildfire
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE wildfire
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE wildfire
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE wildfire
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE wildfire
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE wildfire
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE wildfire
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE wildfire
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE wildfire
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE wildfire
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE wildfire
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE wildfire
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE wildfire
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE wildfire
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE wildfire
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE wildfire
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE wildfire
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE wildfire
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE wildfire
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE wildfire
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE wildfire
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE wildfire
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE wildfire
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE wildfire
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE wildfire
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE wildfire
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE wildfire
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE wildfire
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE wildfire
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE wildfire
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE wildfire
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE wildfire
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE wildfire
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE wildfire
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE wildfire
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE wildfire
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE wildfire
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE wildfire
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE wildfire
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE wildfire
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE wildfire
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE wildfire
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE wildfire
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE wildfire
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE wildfire
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE wildfire
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE wildfire
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE wildfire
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE wildfire
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE wildfire
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE wildfire
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE wildfire
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE wildfire
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE wildfire
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE wildfire
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE wildfire
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE wildfire
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE wildfire
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE wildfire
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE wildfire
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE wildfire
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

UPDATE flood
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE flood
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE flood
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE flood
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE flood
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE flood
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE flood
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE flood
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE flood
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE flood
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE flood
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE flood
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE flood
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE flood
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE flood
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE flood
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE flood
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE flood
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE flood
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE flood
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE flood
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE flood
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE flood
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE flood
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE flood
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE flood
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE flood
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE flood
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE flood
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE flood
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE flood
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE flood
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE flood
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE flood
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE flood
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE flood
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE flood
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE flood
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE flood
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE flood
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE flood
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE flood
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE flood
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE flood
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE flood
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE flood
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE flood
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE flood
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE flood
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE flood
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE flood
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE flood
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE flood
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE flood
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE flood
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE flood
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE flood
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE flood
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE flood
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE flood
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE flood
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE flood
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE flood
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE flood
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE flood
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE flood
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE flood
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE flood
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE flood
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE flood
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE flood
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE flood
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE flood
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE flood
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE flood
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE flood
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE flood
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE flood
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE flood
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE flood
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE flood
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE flood
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE flood
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE flood
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE flood
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE flood
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE flood
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE flood
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE flood
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE flood
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE flood
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE flood
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE flood
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE flood
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE flood
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE flood
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE flood
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE flood
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE flood
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE flood
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE flood
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE flood
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE flood
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE flood
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE flood
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE flood
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE flood
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE flood
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE flood
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE flood
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE flood
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE flood
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE flood
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE flood
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE flood
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE flood
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE flood
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE flood
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE flood
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE flood
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE flood
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE flood
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE flood
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE flood
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE flood
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE flood
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE flood
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE flood
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE flood
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE flood
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE flood
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE flood
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE flood
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE flood
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE flood
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE flood
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE flood
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE flood
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE flood
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE flood
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE flood
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE flood
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE flood
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE flood
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE flood
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE flood
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE flood
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE flood
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE flood
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE flood
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE flood
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE flood
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE flood
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE flood
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE flood
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE flood
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE flood
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE flood
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE flood
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE flood
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE flood
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE flood
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE flood
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE flood
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE flood
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE flood
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE flood
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE flood
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE flood
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE flood
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE flood
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE flood
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE flood
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE flood
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE flood
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE flood
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE flood
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE flood
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE flood
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE flood
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE flood
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE flood
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

UPDATE drought
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE drought
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE drought
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE drought
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE drought
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE drought
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE drought
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE drought
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE drought
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE drought
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE drought
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE drought
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE drought
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE drought
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE drought
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE drought
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE drought
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE drought
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE drought
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE drought
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE drought
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE drought
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE drought
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE drought
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE drought
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE drought
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE drought
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE drought
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE drought
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE drought
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE drought
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE drought
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE drought
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE drought
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE drought
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE drought
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE drought
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE drought
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE drought
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE drought
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE drought
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE drought
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE drought
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE drought
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE drought
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE drought
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE drought
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE drought
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE drought
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE drought
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE drought
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE drought
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE drought
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE drought
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE drought
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE drought
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE drought
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE drought
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE drought
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE drought
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE drought
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE drought
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE drought
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE drought
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE drought
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE drought
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE drought
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE drought
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE drought
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE drought
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE drought
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE drought
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE drought
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE drought
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE drought
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE drought
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE drought
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE drought
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE drought
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE drought
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE drought
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE drought
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE drought
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE drought
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE drought
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE drought
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE drought
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE drought
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE drought
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE drought
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE drought
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE drought
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE drought
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE drought
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE drought
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE drought
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE drought
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE drought
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE drought
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE drought
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE drought
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE drought
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE drought
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE drought
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE drought
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE drought
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE drought
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE drought
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE drought
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE drought
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE drought
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE drought
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE drought
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE drought
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE drought
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE drought
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE drought
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE drought
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE drought
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE drought
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE drought
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE drought
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE drought
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE drought
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE drought
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE drought
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE drought
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE drought
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE drought
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE drought
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE drought
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE drought
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE drought
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE drought
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE drought
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE drought
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE drought
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE drought
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE drought
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE drought
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE drought
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE drought
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE drought
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE drought
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE drought
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE drought
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE drought
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE drought
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE drought
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE drought
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE drought
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE drought
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE drought
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE drought
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE drought
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE drought
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE drought
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE drought
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE drought
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE drought
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE drought
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE drought
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE drought
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE drought
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE drought
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE drought
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE drought
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE drought
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE drought
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE drought
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE drought
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE drought
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE drought
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE drought
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE drought
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE drought
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE drought
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE drought
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE drought
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE drought
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE drought
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE drought
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

UPDATE food_security
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE food_security
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE food_security
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE food_security
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE food_security
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE food_security
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE food_security
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE food_security
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE food_security
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE food_security
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE food_security
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE food_security
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE food_security
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE food_security
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE food_security
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE food_security
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE food_security
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE food_security
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE food_security
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE food_security
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE food_security
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE food_security
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE food_security
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE food_security
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE food_security
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE food_security
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE food_security
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE food_security
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE food_security
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE food_security
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE food_security
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE food_security
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE food_security
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE food_security
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE food_security
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE food_security
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE food_security
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE food_security
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE food_security
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE food_security
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE food_security
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE food_security
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE food_security
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE food_security
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE food_security
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE food_security
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE food_security
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE food_security
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE food_security
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE food_security
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE food_security
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE food_security
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE food_security
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE food_security
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE food_security
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE food_security
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE food_security
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE food_security
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE food_security
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE food_security
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE food_security
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE food_security
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE food_security
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE food_security
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE food_security
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE food_security
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE food_security
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE food_security
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE food_security
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE food_security
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE food_security
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE food_security
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE food_security
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE food_security
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE food_security
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE food_security
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE food_security
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE food_security
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE food_security
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE food_security
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE food_security
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE food_security
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE food_security
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE food_security
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE food_security
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE food_security
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE food_security
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE food_security
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE food_security
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE food_security
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE food_security
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE food_security
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE food_security
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE food_security
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE food_security
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE food_security
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE food_security
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE food_security
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE food_security
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE food_security
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE food_security
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE food_security
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE food_security
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE food_security
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE food_security
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE food_security
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE food_security
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE food_security
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE food_security
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE food_security
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE food_security
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE food_security
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE food_security
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE food_security
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE food_security
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE food_security
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE food_security
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE food_security
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE food_security
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE food_security
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE food_security
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE food_security
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE food_security
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE food_security
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE food_security
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE food_security
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE food_security
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE food_security
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE food_security
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE food_security
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE food_security
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE food_security
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE food_security
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE food_security
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE food_security
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE food_security
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE food_security
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE food_security
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE food_security
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE food_security
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE food_security
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE food_security
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE food_security
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE food_security
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE food_security
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE food_security
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE food_security
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE food_security
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE food_security
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE food_security
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE food_security
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE food_security
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE food_security
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE food_security
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE food_security
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE food_security
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE food_security
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE food_security
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE food_security
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE food_security
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE food_security
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE food_security
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE food_security
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE food_security
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE food_security
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE food_security
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE food_security
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE food_security
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE food_security
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE food_security
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE food_security
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE food_security
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE food_security
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE food_security
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE food_security
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE food_security
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE food_security
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE food_security
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE food_security
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE food_security
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE food_security
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE food_security
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

UPDATE tsunami
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE tsunami
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE tsunami
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE tsunami
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE tsunami
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE tsunami
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE tsunami
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE tsunami
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE tsunami
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE tsunami
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE tsunami
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE tsunami
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE tsunami
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE tsunami
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE tsunami
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE tsunami
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE tsunami
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE tsunami
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE tsunami
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE tsunami
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE tsunami
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE tsunami
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE tsunami
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE tsunami
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE tsunami
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE tsunami
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE tsunami
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE tsunami
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE tsunami
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE tsunami
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE tsunami
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE tsunami
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE tsunami
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE tsunami
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE tsunami
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE tsunami
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE tsunami
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE tsunami
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE tsunami
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE tsunami
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE tsunami
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE tsunami
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE tsunami
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE tsunami
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE tsunami
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE tsunami
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE tsunami
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE tsunami
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE tsunami
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE tsunami
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE tsunami
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE tsunami
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE tsunami
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE tsunami
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE tsunami
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE tsunami
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE tsunami
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE tsunami
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE tsunami
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE tsunami
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE tsunami
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE tsunami
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE tsunami
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE tsunami
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE tsunami
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE tsunami
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE tsunami
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE tsunami
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE tsunami
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE tsunami
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE tsunami
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE tsunami
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE tsunami
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE tsunami
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE tsunami
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE tsunami
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE tsunami
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE tsunami
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE tsunami
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE tsunami
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE tsunami
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE tsunami
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE tsunami
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE tsunami
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE tsunami
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE tsunami
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE tsunami
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE tsunami
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE tsunami
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE tsunami
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE tsunami
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE tsunami
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE tsunami
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE tsunami
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE tsunami
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE tsunami
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE tsunami
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE tsunami
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE tsunami
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE tsunami
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE tsunami
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE tsunami
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE tsunami
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE tsunami
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE tsunami
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE tsunami
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE tsunami
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE tsunami
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE tsunami
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE tsunami
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE tsunami
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE tsunami
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE tsunami
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE tsunami
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE tsunami
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE tsunami
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE tsunami
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE tsunami
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE tsunami
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE tsunami
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE tsunami
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE tsunami
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE tsunami
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE tsunami
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE tsunami
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE tsunami
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE tsunami
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE tsunami
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE tsunami
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE tsunami
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE tsunami
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE tsunami
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE tsunami
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE tsunami
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE tsunami
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE tsunami
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE tsunami
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE tsunami
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE tsunami
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE tsunami
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE tsunami
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE tsunami
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE tsunami
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE tsunami
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE tsunami
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE tsunami
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE tsunami
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE tsunami
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE tsunami
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE tsunami
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE tsunami
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE tsunami
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE tsunami
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE tsunami
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE tsunami
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE tsunami
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE tsunami
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE tsunami
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE tsunami
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE tsunami
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE tsunami
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE tsunami
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE tsunami
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE tsunami
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE tsunami
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE tsunami
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE tsunami
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE tsunami
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE tsunami
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE tsunami
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE tsunami
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE tsunami
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE tsunami
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE tsunami
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE tsunami
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE tsunami
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE tsunami
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE tsunami
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE tsunami
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE tsunami
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE tsunami
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE tsunami
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

UPDATE cyclone
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE cyclone
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE cyclone
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE cyclone
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE cyclone
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE cyclone
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE cyclone
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE cyclone
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE cyclone
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE cyclone
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE cyclone
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE cyclone
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE cyclone
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE cyclone
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE cyclone
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE cyclone
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE cyclone
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE cyclone
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE cyclone
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE cyclone
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE cyclone
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE cyclone
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE cyclone
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE cyclone
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE cyclone
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE cyclone
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE cyclone
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE cyclone
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE cyclone
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE cyclone
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE cyclone
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE cyclone
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE cyclone
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE cyclone
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE cyclone
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE cyclone
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE cyclone
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE cyclone
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE cyclone
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE cyclone
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE cyclone
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE cyclone
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE cyclone
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE cyclone
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE cyclone
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE cyclone
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE cyclone
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE cyclone
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE cyclone
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE cyclone
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE cyclone
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE cyclone
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE cyclone
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE cyclone
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE cyclone
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE cyclone
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE cyclone
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE cyclone
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE cyclone
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE cyclone
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE cyclone
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE cyclone
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE cyclone
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE cyclone
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE cyclone
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE cyclone
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE cyclone
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE cyclone
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE cyclone
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE cyclone
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE cyclone
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE cyclone
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE cyclone
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE cyclone
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE cyclone
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE cyclone
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE cyclone
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE cyclone
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE cyclone
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE cyclone
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE cyclone
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE cyclone
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE cyclone
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE cyclone
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE cyclone
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE cyclone
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE cyclone
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE cyclone
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE cyclone
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE cyclone
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE cyclone
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE cyclone
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE cyclone
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE cyclone
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE cyclone
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE cyclone
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE cyclone
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE cyclone
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE cyclone
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE cyclone
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE cyclone
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE cyclone
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE cyclone
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE cyclone
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE cyclone
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE cyclone
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE cyclone
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE cyclone
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE cyclone
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE cyclone
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE cyclone
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE cyclone
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE cyclone
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE cyclone
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE cyclone
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE cyclone
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE cyclone
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE cyclone
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE cyclone
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE cyclone
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE cyclone
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE cyclone
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE cyclone
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE cyclone
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE cyclone
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE cyclone
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE cyclone
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE cyclone
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE cyclone
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE cyclone
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE cyclone
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE cyclone
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE cyclone
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE cyclone
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE cyclone
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE cyclone
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE cyclone
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE cyclone
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE cyclone
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE cyclone
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE cyclone
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE cyclone
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE cyclone
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE cyclone
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE cyclone
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE cyclone
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE cyclone
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE cyclone
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE cyclone
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE cyclone
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE cyclone
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE cyclone
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE cyclone
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE cyclone
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE cyclone
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE cyclone
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE cyclone
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE cyclone
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE cyclone
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE cyclone
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE cyclone
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE cyclone
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE cyclone
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE cyclone
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE cyclone
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE cyclone
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE cyclone
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE cyclone
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE cyclone
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE cyclone
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE cyclone
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE cyclone
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE cyclone
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE cyclone
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE cyclone
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE cyclone
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE cyclone
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE cyclone
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE cyclone
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE cyclone
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE cyclone
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE cyclone
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

UPDATE volcano
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE volcano
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE volcano
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE volcano
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE volcano
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE volcano
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE volcano
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE volcano
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE volcano
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE volcano
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE volcano
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE volcano
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE volcano
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE volcano
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE volcano
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE volcano
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE volcano
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE volcano
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE volcano
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE volcano
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE volcano
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE volcano
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE volcano
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE volcano
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE volcano
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE volcano
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE volcano
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE volcano
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE volcano
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE volcano
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE volcano
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE volcano
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE volcano
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE volcano
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE volcano
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE volcano
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE volcano
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE volcano
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE volcano
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE volcano
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE volcano
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE volcano
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE volcano
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE volcano
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE volcano
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE volcano
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE volcano
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE volcano
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE volcano
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE volcano
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE volcano
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE volcano
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE volcano
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE volcano
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE volcano
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE volcano
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE volcano
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE volcano
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE volcano
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE volcano
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE volcano
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE volcano
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE volcano
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE volcano
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE volcano
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE volcano
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE volcano
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE volcano
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE volcano
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE volcano
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE volcano
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE volcano
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE volcano
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE volcano
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE volcano
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE volcano
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE volcano
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE volcano
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE volcano
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE volcano
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE volcano
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE volcano
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE volcano
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE volcano
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE volcano
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE volcano
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE volcano
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE volcano
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE volcano
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE volcano
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE volcano
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE volcano
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE volcano
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE volcano
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE volcano
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE volcano
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE volcano
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE volcano
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE volcano
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE volcano
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE volcano
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE volcano
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE volcano
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE volcano
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE volcano
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE volcano
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE volcano
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE volcano
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE volcano
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE volcano
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE volcano
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE volcano
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE volcano
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE volcano
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE volcano
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE volcano
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE volcano
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE volcano
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE volcano
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE volcano
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE volcano
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE volcano
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE volcano
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE volcano
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE volcano
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE volcano
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE volcano
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE volcano
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE volcano
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE volcano
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE volcano
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE volcano
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE volcano
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE volcano
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE volcano
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE volcano
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE volcano
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE volcano
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE volcano
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE volcano
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE volcano
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE volcano
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE volcano
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE volcano
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE volcano
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE volcano
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE volcano
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE volcano
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE volcano
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE volcano
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE volcano
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE volcano
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE volcano
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE volcano
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE volcano
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE volcano
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE volcano
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE volcano
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE volcano
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE volcano
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE volcano
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE volcano
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE volcano
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE volcano
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE volcano
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE volcano
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE volcano
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE volcano
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE volcano
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE volcano
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE volcano
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE volcano
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE volcano
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE volcano
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE volcano
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE volcano
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE volcano
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE volcano
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE volcano
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE volcano
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE volcano
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE volcano
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

UPDATE epidemic
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE epidemic
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE epidemic
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE epidemic
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE epidemic
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE epidemic
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE epidemic
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE epidemic
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE epidemic
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE epidemic
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE epidemic
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE epidemic
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE epidemic
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE epidemic
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE epidemic
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE epidemic
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE epidemic
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE epidemic
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE epidemic
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE epidemic
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE epidemic
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE epidemic
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE epidemic
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE epidemic
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE epidemic
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE epidemic
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE epidemic
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE epidemic
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE epidemic
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE epidemic
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE epidemic
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE epidemic
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE epidemic
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE epidemic
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE epidemic
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE epidemic
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE epidemic
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE epidemic
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE epidemic
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE epidemic
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE epidemic
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE epidemic
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE epidemic
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE epidemic
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE epidemic
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE epidemic
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE epidemic
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE epidemic
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE epidemic
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE epidemic
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE epidemic
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE epidemic
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE epidemic
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE epidemic
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE epidemic
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE epidemic
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE epidemic
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE epidemic
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE epidemic
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE epidemic
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE epidemic
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE epidemic
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE epidemic
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE epidemic
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE epidemic
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE epidemic
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE epidemic
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE epidemic
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE epidemic
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE epidemic
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE epidemic
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE epidemic
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE epidemic
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE epidemic
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE epidemic
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE epidemic
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE epidemic
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE epidemic
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE epidemic
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE epidemic
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE epidemic
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE epidemic
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE epidemic
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE epidemic
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE epidemic
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE epidemic
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE epidemic
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE epidemic
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE epidemic
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE epidemic
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE epidemic
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE epidemic
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE epidemic
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE epidemic
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE epidemic
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE epidemic
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE epidemic
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE epidemic
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE epidemic
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE epidemic
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE epidemic
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE epidemic
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE epidemic
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE epidemic
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE epidemic
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE epidemic
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE epidemic
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE epidemic
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE epidemic
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE epidemic
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE epidemic
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE epidemic
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE epidemic
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE epidemic
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE epidemic
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE epidemic
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE epidemic
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE epidemic
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE epidemic
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE epidemic
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE epidemic
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE epidemic
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE epidemic
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE epidemic
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE epidemic
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE epidemic
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE epidemic
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE epidemic
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE epidemic
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE epidemic
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE epidemic
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE epidemic
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE epidemic
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE epidemic
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE epidemic
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE epidemic
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE epidemic
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE epidemic
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE epidemic
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE epidemic
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE epidemic
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE epidemic
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE epidemic
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE epidemic
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE epidemic
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE epidemic
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE epidemic
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE epidemic
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE epidemic
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE epidemic
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE epidemic
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE epidemic
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE epidemic
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE epidemic
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE epidemic
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE epidemic
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE epidemic
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE epidemic
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE epidemic
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE epidemic
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE epidemic
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE epidemic
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE epidemic
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE epidemic
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE epidemic
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE epidemic
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE epidemic
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE epidemic
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE epidemic
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE epidemic
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE epidemic
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE epidemic
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE epidemic
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE epidemic
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE epidemic
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE epidemic
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE epidemic
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE epidemic
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE epidemic
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE epidemic
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE epidemic
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE epidemic
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

UPDATE disaster
SET country_code = 'mc'
WHERE country_code IS NULL
  AND lat BETWEEN 43.72 AND 43.75
  AND lng BETWEEN 7.41 AND 7.44;

UPDATE disaster
SET country_code = 'sm'
WHERE country_code IS NULL
  AND lat BETWEEN 43.89 AND 43.99
  AND lng BETWEEN 12.4 AND 12.52;

UPDATE disaster
SET country_code = 'li'
WHERE country_code IS NULL
  AND lat BETWEEN 47.05 AND 47.27
  AND lng BETWEEN 9.47 AND 9.64;

UPDATE disaster
SET country_code = 'bb'
WHERE country_code IS NULL
  AND lat BETWEEN 13.04 AND 13.34
  AND lng BETWEEN -59.65 AND -59.43;

UPDATE disaster
SET country_code = 'ad'
WHERE country_code IS NULL
  AND lat BETWEEN 42.43 AND 42.66
  AND lng BETWEEN 1.41 AND 1.79;

UPDATE disaster
SET country_code = 'mt'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 36.08
  AND lng BETWEEN 14.18 AND 14.58;

UPDATE disaster
SET country_code = 'dm'
WHERE country_code IS NULL
  AND lat BETWEEN 15.2 AND 15.64
  AND lng BETWEEN -61.5 AND -61.24;

UPDATE disaster
SET country_code = 'sg'
WHERE country_code IS NULL
  AND lat BETWEEN 1.16 AND 1.48
  AND lng BETWEEN 103.6 AND 104.09;

UPDATE disaster
SET country_code = 'ag'
WHERE country_code IS NULL
  AND lat BETWEEN 16.99 AND 17.73
  AND lng BETWEEN -61.89 AND -61.67;

UPDATE disaster
SET country_code = 'bh'
WHERE country_code IS NULL
  AND lat BETWEEN 25.8 AND 26.33
  AND lng BETWEEN 50.45 AND 50.84;

UPDATE disaster
SET country_code = 'mu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.52 AND -19.98
  AND lng BETWEEN 57.31 AND 57.8;

UPDATE disaster
SET country_code = 'vc'
WHERE country_code IS NULL
  AND lat BETWEEN 12.59 AND 13.38
  AND lng BETWEEN -61.46 AND -61.12;

UPDATE disaster
SET country_code = 'lu'
WHERE country_code IS NULL
  AND lat BETWEEN 49.45 AND 50.18
  AND lng BETWEEN 5.74 AND 6.53;

UPDATE disaster
SET country_code = 'ws'
WHERE country_code IS NULL
  AND lat BETWEEN -14.07 AND -13.44
  AND lng BETWEEN -172.8 AND -171.43;

UPDATE disaster
SET country_code = 'bn'
WHERE country_code IS NULL
  AND lat BETWEEN 4 AND 5.05
  AND lng BETWEEN 114.08 AND 115.36;

UPDATE disaster
SET country_code = 'qa'
WHERE country_code IS NULL
  AND lat BETWEEN 24.56 AND 26.18
  AND lng BETWEEN 50.75 AND 51.61;

UPDATE disaster
SET country_code = 'km'
WHERE country_code IS NULL
  AND lat BETWEEN -12.44 AND -11.37
  AND lng BETWEEN 43.23 AND 44.59;

UPDATE disaster
SET country_code = 'jm'
WHERE country_code IS NULL
  AND lat BETWEEN 17.7 AND 18.52
  AND lng BETWEEN -78.37 AND -76.18;

UPDATE disaster
SET country_code = 'tt'
WHERE country_code IS NULL
  AND lat BETWEEN 10.03 AND 11.37
  AND lng BETWEEN -61.92 AND -60.52;

UPDATE disaster
SET country_code = 'sz'
WHERE country_code IS NULL
  AND lat BETWEEN -27.32 AND -25.72
  AND lng BETWEEN 30.79 AND 32.14;

UPDATE disaster
SET country_code = 'gm'
WHERE country_code IS NULL
  AND lat BETWEEN 13.06 AND 13.82
  AND lng BETWEEN -16.84 AND -13.8;

UPDATE disaster
SET country_code = 'lb'
WHERE country_code IS NULL
  AND lat BETWEEN 33.09 AND 34.69
  AND lng BETWEEN 35.12 AND 36.62;

UPDATE disaster
SET country_code = 'cy'
WHERE country_code IS NULL
  AND lat BETWEEN 34.63 AND 35.7
  AND lng BETWEEN 32.27 AND 34.6;

UPDATE disaster
SET country_code = 'dj'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.71
  AND lng BETWEEN 41.77 AND 43.42;

UPDATE disaster
SET country_code = 'kw'
WHERE country_code IS NULL
  AND lat BETWEEN 28.52 AND 30.11
  AND lng BETWEEN 46.55 AND 48.43;

UPDATE disaster
SET country_code = 'sv'
WHERE country_code IS NULL
  AND lat BETWEEN 13.15 AND 14.45
  AND lng BETWEEN -90.1 AND -87.69;

UPDATE disaster
SET country_code = 'me'
WHERE country_code IS NULL
  AND lat BETWEEN 41.85 AND 43.55
  AND lng BETWEEN 18.45 AND 20.36;

UPDATE disaster
SET country_code = 'rw'
WHERE country_code IS NULL
  AND lat BETWEEN -2.84 AND -1.06
  AND lng BETWEEN 28.86 AND 30.9;

UPDATE disaster
SET country_code = 'bz'
WHERE country_code IS NULL
  AND lat BETWEEN 15.89 AND 18.5
  AND lng BETWEEN -89.22 AND -87.77;

UPDATE disaster
SET country_code = 'mk'
WHERE country_code IS NULL
  AND lat BETWEEN 40.86 AND 42.36
  AND lng BETWEEN 20.46 AND 23.03;

UPDATE disaster
SET country_code = 'bi'
WHERE country_code IS NULL
  AND lat BETWEEN -4.47 AND -2.31
  AND lng BETWEEN 29.02 AND 30.85;

UPDATE disaster
SET country_code = 'tl'
WHERE country_code IS NULL
  AND lat BETWEEN -9.47 AND -8.14
  AND lng BETWEEN 124.04 AND 127.34;

UPDATE disaster
SET country_code = 'si'
WHERE country_code IS NULL
  AND lat BETWEEN 45.42 AND 46.88
  AND lng BETWEEN 13.38 AND 16.61;

UPDATE disaster
SET country_code = 'ls'
WHERE country_code IS NULL
  AND lat BETWEEN -30.65 AND -28.57
  AND lng BETWEEN 27.01 AND 29.46;

UPDATE disaster
SET country_code = 'gw'
WHERE country_code IS NULL
  AND lat BETWEEN 10.93 AND 12.68
  AND lng BETWEEN -16.71 AND -13.64;

UPDATE disaster
SET country_code = 'al'
WHERE country_code IS NULL
  AND lat BETWEEN 39.62 AND 42.67
  AND lng BETWEEN 19.28 AND 21.08;

UPDATE disaster
SET country_code = 'bt'
WHERE country_code IS NULL
  AND lat BETWEEN 26.7 AND 28.33
  AND lng BETWEEN 88.75 AND 92.12;

UPDATE disaster
SET country_code = 'ht'
WHERE country_code IS NULL
  AND lat BETWEEN 18.02 AND 20.09
  AND lng BETWEEN -74.48 AND -71.62;

UPDATE disaster
SET country_code = 'il'
WHERE country_code IS NULL
  AND lat BETWEEN 29.48 AND 33.34
  AND lng BETWEEN 34.27 AND 35.9;

UPDATE disaster
SET country_code = 'cv'
WHERE country_code IS NULL
  AND lat BETWEEN 14.8 AND 17.2
  AND lng BETWEEN -25.36 AND -22.67;

UPDATE disaster
SET country_code = 'be'
WHERE country_code IS NULL
  AND lat BETWEEN 49.5 AND 51.5
  AND lng BETWEEN 2.54 AND 6.41;

UPDATE disaster
SET country_code = 'am'
WHERE country_code IS NULL
  AND lat BETWEEN 38.84 AND 41.3
  AND lng BETWEEN 43.45 AND 46.63;

UPDATE disaster
SET country_code = 'mv'
WHERE country_code IS NULL
  AND lat BETWEEN -0.69 AND 7.1
  AND lng BETWEEN 72.68 AND 73.76;

UPDATE disaster
SET country_code = 'lk'
WHERE country_code IS NULL
  AND lat BETWEEN 5.92 AND 9.84
  AND lng BETWEEN 79.7 AND 81.89;

UPDATE disaster
SET country_code = 'ch'
WHERE country_code IS NULL
  AND lat BETWEEN 45.83 AND 47.81
  AND lng BETWEEN 5.96 AND 10.49;

UPDATE disaster
SET country_code = 'do'
WHERE country_code IS NULL
  AND lat BETWEEN 17.47 AND 19.93
  AND lng BETWEEN -72.01 AND -68.32;

UPDATE disaster
SET country_code = 'sl'
WHERE country_code IS NULL
  AND lat BETWEEN 6.93 AND 10.05
  AND lng BETWEEN -13.31 AND -10.28;

UPDATE disaster
SET country_code = 'tg'
WHERE country_code IS NULL
  AND lat BETWEEN 6.1 AND 11.14
  AND lng BETWEEN -0.15 AND 1.81;

UPDATE disaster
SET country_code = 'nl'
WHERE country_code IS NULL
  AND lat BETWEEN 50.8 AND 53.51
  AND lng BETWEEN 3.36 AND 7.23;

UPDATE disaster
SET country_code = 'ba'
WHERE country_code IS NULL
  AND lat BETWEEN 42.56 AND 45.28
  AND lng BETWEEN 15.75 AND 19.62;

UPDATE disaster
SET country_code = 'md'
WHERE country_code IS NULL
  AND lat BETWEEN 45.47 AND 48.49
  AND lng BETWEEN 26.62 AND 30.16;

UPDATE disaster
SET country_code = 'sk'
WHERE country_code IS NULL
  AND lat BETWEEN 47.73 AND 49.61
  AND lng BETWEEN 16.83 AND 22.57;

UPDATE disaster
SET country_code = 'cr'
WHERE country_code IS NULL
  AND lat BETWEEN 8.03 AND 11.22
  AND lng BETWEEN -85.95 AND -82.55;

UPDATE disaster
SET country_code = 'ee'
WHERE country_code IS NULL
  AND lat BETWEEN 57.51 AND 59.68
  AND lng BETWEEN 21.84 AND 28.21;

UPDATE disaster
SET country_code = 'pa'
WHERE country_code IS NULL
  AND lat BETWEEN 7.2 AND 9.65
  AND lng BETWEEN -83.05 AND -77.16;

UPDATE disaster
SET country_code = 'fj'
WHERE country_code IS NULL
  AND lat BETWEEN -20.68 AND -15.72
  AND lng BETWEEN 177 AND 180;

UPDATE disaster
SET country_code = 'lt'
WHERE country_code IS NULL
  AND lat BETWEEN 53.91 AND 56.45
  AND lng BETWEEN 20.94 AND 26.84;

UPDATE disaster
SET country_code = 'gq'
WHERE country_code IS NULL
  AND lat BETWEEN 0.92 AND 3.77
  AND lng BETWEEN 5.62 AND 11.33;

UPDATE disaster
SET country_code = 'gt'
WHERE country_code IS NULL
  AND lat BETWEEN 13.74 AND 17.82
  AND lng BETWEEN -92.23 AND -88.22;

UPDATE disaster
SET country_code = 'rs'
WHERE country_code IS NULL
  AND lat BETWEEN 42.23 AND 46.18
  AND lng BETWEEN 18.82 AND 22.99;

UPDATE disaster
SET country_code = 'ae'
WHERE country_code IS NULL
  AND lat BETWEEN 22.63 AND 26.08
  AND lng BETWEEN 51.58 AND 56.38;

UPDATE disaster
SET country_code = 'to'
WHERE country_code IS NULL
  AND lat BETWEEN -22.34 AND -15.56
  AND lng BETWEEN -176.21 AND -173.74;

UPDATE disaster
SET country_code = 'ge'
WHERE country_code IS NULL
  AND lat BETWEEN 41.06 AND 43.58
  AND lng BETWEEN 39.99 AND 46.69;

UPDATE disaster
SET country_code = 'cz'
WHERE country_code IS NULL
  AND lat BETWEEN 48.56 AND 51.06
  AND lng BETWEEN 12.09 AND 18.87;

UPDATE disaster
SET country_code = 'sr'
WHERE country_code IS NULL
  AND lat BETWEEN 1.83 AND 6
  AND lng BETWEEN -58.07 AND -53.98;

UPDATE disaster
SET country_code = 'lr'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 8.55
  AND lng BETWEEN -11.49 AND -7.37;

UPDATE disaster
SET country_code = 'lv'
WHERE country_code IS NULL
  AND lat BETWEEN 55.67 AND 58.08
  AND lng BETWEEN 20.97 AND 28.24;

UPDATE disaster
SET country_code = 'pt'
WHERE country_code IS NULL
  AND lat BETWEEN 36.84 AND 42.15
  AND lng BETWEEN -9.52 AND -6.19;

UPDATE disaster
SET country_code = 'ie'
WHERE country_code IS NULL
  AND lat BETWEEN 51.43 AND 55.39
  AND lng BETWEEN -10.48 AND -5.99;

UPDATE disaster
SET country_code = 'jo'
WHERE country_code IS NULL
  AND lat BETWEEN 29.19 AND 33.37
  AND lng BETWEEN 34.92 AND 39.3;

UPDATE disaster
SET country_code = 'bg'
WHERE country_code IS NULL
  AND lat BETWEEN 41.24 AND 44.22
  AND lng BETWEEN 22.36 AND 28.61;

UPDATE disaster
SET country_code = 'bj'
WHERE country_code IS NULL
  AND lat BETWEEN 6.24 AND 12.41
  AND lng BETWEEN 0.8 AND 3.84;

UPDATE disaster
SET country_code = 'kr'
WHERE country_code IS NULL
  AND lat BETWEEN 33.11 AND 38.61
  AND lng BETWEEN 126.12 AND 129.58;

UPDATE disaster
SET country_code = 'hu'
WHERE country_code IS NULL
  AND lat BETWEEN 45.74 AND 48.58
  AND lng BETWEEN 16.11 AND 22.9;

UPDATE disaster
SET country_code = 'ni'
WHERE country_code IS NULL
  AND lat BETWEEN 10.71 AND 14.99
  AND lng BETWEEN -87.69 AND -83.15;

UPDATE disaster
SET country_code = 'at'
WHERE country_code IS NULL
  AND lat BETWEEN 46.38 AND 49.02
  AND lng BETWEEN 9.53 AND 17.16;

UPDATE disaster
SET country_code = 'az'
WHERE country_code IS NULL
  AND lat BETWEEN 38.39 AND 41.9
  AND lng BETWEEN 44.77 AND 50.95;

UPDATE disaster
SET country_code = 'hn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.98 AND 16.52
  AND lng BETWEEN -89.35 AND -83.15;

UPDATE disaster
SET country_code = 'kh'
WHERE country_code IS NULL
  AND lat BETWEEN 10.41 AND 14.69
  AND lng BETWEEN 102.35 AND 107.63;

UPDATE disaster
SET country_code = 'dk'
WHERE country_code IS NULL
  AND lat BETWEEN 54.56 AND 57.75
  AND lng BETWEEN 8.08 AND 15.2;

UPDATE disaster
SET country_code = 'vu'
WHERE country_code IS NULL
  AND lat BETWEEN -20.25 AND -13.07
  AND lng BETWEEN 166.54 AND 169.97;

UPDATE disaster
SET country_code = 'hr'
WHERE country_code IS NULL
  AND lat BETWEEN 42.39 AND 46.55
  AND lng BETWEEN 13.49 AND 19.45;

UPDATE disaster
SET country_code = 'mw'
WHERE country_code IS NULL
  AND lat BETWEEN -17.13 AND -9.37
  AND lng BETWEEN 32.68 AND 35.92;

UPDATE disaster
SET country_code = 'uy'
WHERE country_code IS NULL
  AND lat BETWEEN -34.9 AND -30.11
  AND lng BETWEEN -58.44 AND -53.09;

UPDATE disaster
SET country_code = 'bs'
WHERE country_code IS NULL
  AND lat BETWEEN 23.18 AND 27.26
  AND lng BETWEEN -79.1 AND -72.71;

UPDATE disaster
SET country_code = 'sn'
WHERE country_code IS NULL
  AND lat BETWEEN 12.31 AND 16.69
  AND lng BETWEEN -17.54 AND -11.36;

UPDATE disaster
SET country_code = 'bd'
WHERE country_code IS NULL
  AND lat BETWEEN 20.74 AND 26.63
  AND lng BETWEEN 88.01 AND 92.67;

UPDATE disaster
SET country_code = 'gh'
WHERE country_code IS NULL
  AND lat BETWEEN 4.74 AND 11.17
  AND lng BETWEEN -3.26 AND 1.19;

UPDATE disaster
SET country_code = 'tn'
WHERE country_code IS NULL
  AND lat BETWEEN 30.24 AND 37.54
  AND lng BETWEEN 7.52 AND 11.6;

UPDATE disaster
SET country_code = 'ug'
WHERE country_code IS NULL
  AND lat BETWEEN -1.48 AND 4.23
  AND lng BETWEEN 29.57 AND 35;

UPDATE disaster
SET country_code = 'np'
WHERE country_code IS NULL
  AND lat BETWEEN 26.37 AND 30.42
  AND lng BETWEEN 80.06 AND 88.2;

UPDATE disaster
SET country_code = 'kp'
WHERE country_code IS NULL
  AND lat BETWEEN 37.67 AND 42.84
  AND lng BETWEEN 124.25 AND 130.68;

UPDATE disaster
SET country_code = 'sy'
WHERE country_code IS NULL
  AND lat BETWEEN 32.31 AND 37.32
  AND lng BETWEEN 35.73 AND 42.38;

UPDATE disaster
SET country_code = 'tj'
WHERE country_code IS NULL
  AND lat BETWEEN 36.67 AND 41.04
  AND lng BETWEEN 67.34 AND 75.16;

UPDATE disaster
SET country_code = 'ro'
WHERE country_code IS NULL
  AND lat BETWEEN 43.62 AND 48.27
  AND lng BETWEEN 22.09 AND 29.72;

UPDATE disaster
SET country_code = 'is'
WHERE country_code IS NULL
  AND lat BETWEEN 63.3 AND 66.57
  AND lng BETWEEN -24.54 AND -13.5;

UPDATE disaster
SET country_code = 'gy'
WHERE country_code IS NULL
  AND lat BETWEEN 1.18 AND 8.56
  AND lng BETWEEN -61.41 AND -56.49;

UPDATE disaster
SET country_code = 'ga'
WHERE country_code IS NULL
  AND lat BETWEEN -3.98 AND 2.32
  AND lng BETWEEN 8.7 AND 14.5;

UPDATE disaster
SET country_code = 'ec'
WHERE country_code IS NULL
  AND lat BETWEEN -4.99 AND 1.45
  AND lng BETWEEN -80.97 AND -75.19;

UPDATE disaster
SET country_code = 'cu'
WHERE country_code IS NULL
  AND lat BETWEEN 19.82 AND 23.28
  AND lng BETWEEN -84.95 AND -74.13;

UPDATE disaster
SET country_code = 'er'
WHERE country_code IS NULL
  AND lat BETWEEN 12.36 AND 18
  AND lng BETWEEN 36.43 AND 43.12;

UPDATE disaster
SET country_code = 'ci'
WHERE country_code IS NULL
  AND lat BETWEEN 4.36 AND 10.74
  AND lng BETWEEN -8.6 AND -2.49;

UPDATE disaster
SET country_code = 'gn'
WHERE country_code IS NULL
  AND lat BETWEEN 7.19 AND 12.67
  AND lng BETWEEN -15.08 AND -7.64;

UPDATE disaster
SET country_code = 'kg'
WHERE country_code IS NULL
  AND lat BETWEEN 39.19 AND 43.24
  AND lng BETWEEN 69.28 AND 80.28;

UPDATE disaster
SET country_code = 'bf'
WHERE country_code IS NULL
  AND lat BETWEEN 9.4 AND 15.08
  AND lng BETWEEN -5.52 AND 2.4;

UPDATE disaster
SET country_code = 'by'
WHERE country_code IS NULL
  AND lat BETWEEN 51.26 AND 56.17
  AND lng BETWEEN 23.18 AND 32.78;

UPDATE disaster
SET country_code = 'zw'
WHERE country_code IS NULL
  AND lat BETWEEN -22.42 AND -15.61
  AND lng BETWEEN 25.24 AND 33.07;

UPDATE disaster
SET country_code = 'pl'
WHERE country_code IS NULL
  AND lat BETWEEN 49 AND 54.84
  AND lng BETWEEN 14.12 AND 24.15;

UPDATE disaster
SET country_code = 'gr'
WHERE country_code IS NULL
  AND lat BETWEEN 34.8 AND 41.75
  AND lng BETWEEN 19.38 AND 28.25;

UPDATE disaster
SET country_code = 'la'
WHERE country_code IS NULL
  AND lat BETWEEN 13.93 AND 22.5
  AND lng BETWEEN 100.09 AND 107.64;

UPDATE disaster
SET country_code = 'cg'
WHERE country_code IS NULL
  AND lat BETWEEN -5.03 AND 3.71
  AND lng BETWEEN 11.21 AND 18.65;

UPDATE disaster
SET country_code = 'py'
WHERE country_code IS NULL
  AND lat BETWEEN -27.59 AND -19.29
  AND lng BETWEEN -62.64 AND -54.29;

UPDATE disaster
SET country_code = 'de'
WHERE country_code IS NULL
  AND lat BETWEEN 47.27 AND 55.06
  AND lng BETWEEN 5.87 AND 15.04;

UPDATE disaster
SET country_code = 'ke'
WHERE country_code IS NULL
  AND lat BETWEEN -4.68 AND 4.98
  AND lng BETWEEN 33.91 AND 41.9;

UPDATE disaster
SET country_code = 'om'
WHERE country_code IS NULL
  AND lat BETWEEN 16.65 AND 26.4
  AND lng BETWEEN 51.83 AND 59.85;

UPDATE disaster
SET country_code = 'iq'
WHERE country_code IS NULL
  AND lat BETWEEN 29.07 AND 37.38
  AND lng BETWEEN 38.79 AND 48.57;

UPDATE disaster
SET country_code = 'sb'
WHERE country_code IS NULL
  AND lat BETWEEN -11.86 AND -6
  AND lng BETWEEN 155.51 AND 169.99;

UPDATE disaster
SET country_code = 'ye'
WHERE country_code IS NULL
  AND lat BETWEEN 12.11 AND 19
  AND lng BETWEEN 42.54 AND 54.98;

UPDATE disaster
SET country_code = 'bw'
WHERE country_code IS NULL
  AND lat BETWEEN -26.91 AND -17.78
  AND lng BETWEEN 19.99 AND 29.38;

UPDATE disaster
SET country_code = 'cm'
WHERE country_code IS NULL
  AND lat BETWEEN 1.65 AND 13.08
  AND lng BETWEEN 8.5 AND 16.19;

UPDATE disaster
SET country_code = 'mg'
WHERE country_code IS NULL
  AND lat BETWEEN -25.61 AND -11.95
  AND lng BETWEEN 43.22 AND 50.48;

UPDATE disaster
SET country_code = 'ma'
WHERE country_code IS NULL
  AND lat BETWEEN 27.67 AND 35.93
  AND lng BETWEEN -13.17 AND -0.99;

UPDATE disaster
SET country_code = 'gb'
WHERE country_code IS NULL
  AND lat BETWEEN 49.91 AND 60.85
  AND lng BETWEEN -8.18 AND 1.76;

UPDATE disaster
SET country_code = 'tm'
WHERE country_code IS NULL
  AND lat BETWEEN 35.14 AND 42.8
  AND lng BETWEEN 52.45 AND 66.69;

UPDATE disaster
SET country_code = 'ss'
WHERE country_code IS NULL
  AND lat BETWEEN 3.49 AND 12.22
  AND lng BETWEEN 24.14 AND 36.88;

UPDATE disaster
SET country_code = 'vn'
WHERE country_code IS NULL
  AND lat BETWEEN 8.19 AND 23.39
  AND lng BETWEEN 102.14 AND 109.46;

UPDATE disaster
SET country_code = 'cf'
WHERE country_code IS NULL
  AND lat BETWEEN 2.22 AND 11
  AND lng BETWEEN 14.42 AND 27.46;

UPDATE disaster
SET country_code = 'ng'
WHERE country_code IS NULL
  AND lat BETWEEN 4.27 AND 13.89
  AND lng BETWEEN 2.69 AND 14.68;

UPDATE disaster
SET country_code = 'zm'
WHERE country_code IS NULL
  AND lat BETWEEN -18.08 AND -8.22
  AND lng BETWEEN 21.99 AND 33.7;

UPDATE disaster
SET country_code = 'tz'
WHERE country_code IS NULL
  AND lat BETWEEN -11.75 AND -0.99
  AND lng BETWEEN 29.34 AND 40.44;

UPDATE disaster
SET country_code = 'eg'
WHERE country_code IS NULL
  AND lat BETWEEN 22 AND 31.67
  AND lng BETWEEN 24.7 AND 37.22;

UPDATE disaster
SET country_code = 'tr'
WHERE country_code IS NULL
  AND lat BETWEEN 35.8 AND 42.2
  AND lng BETWEEN 25.6 AND 44.8;

UPDATE disaster
SET country_code = 'th'
WHERE country_code IS NULL
  AND lat BETWEEN 5.61 AND 20.47
  AND lng BETWEEN 97.34 AND 105.64;

UPDATE disaster
SET country_code = 'it'
WHERE country_code IS NULL
  AND lat BETWEEN 36.62 AND 47.1
  AND lng BETWEEN 6.63 AND 18.52;

UPDATE disaster
SET country_code = 'ml'
WHERE country_code IS NULL
  AND lat BETWEEN 10.14 AND 25
  AND lng BETWEEN -4.24 AND 4.27;

UPDATE disaster
SET country_code = 'my'
WHERE country_code IS NULL
  AND lat BETWEEN 0.85 AND 7.36
  AND lng BETWEEN 99.64 AND 119.28;

UPDATE disaster
SET country_code = 'fi'
WHERE country_code IS NULL
  AND lat BETWEEN 59.81 AND 70.09
  AND lng BETWEEN 19.09 AND 31.59;

UPDATE disaster
SET country_code = 'af'
WHERE country_code IS NULL
  AND lat BETWEEN 29.38 AND 38.49
  AND lng BETWEEN 60.52 AND 74.89;

UPDATE disaster
SET country_code = 'so'
WHERE country_code IS NULL
  AND lat BETWEEN -1.68 AND 11.98
  AND lng BETWEEN 40.99 AND 51.41;

UPDATE disaster
SET country_code = 'fr'
WHERE country_code IS NULL
  AND lat BETWEEN 41.33 AND 51.12
  AND lng BETWEEN -5.14 AND 9.56;

UPDATE disaster
SET country_code = 'uz'
WHERE country_code IS NULL
  AND lat BETWEEN 37.18 AND 45.59
  AND lng BETWEEN 55.99 AND 73.13;

UPDATE disaster
SET country_code = 'ua'
WHERE country_code IS NULL
  AND lat BETWEEN 44.39 AND 52.38
  AND lng BETWEEN 22.14 AND 40.23;

UPDATE disaster
SET country_code = 'pg'
WHERE country_code IS NULL
  AND lat BETWEEN -11.66 AND -1.31
  AND lng BETWEEN 141.02 AND 155.65;

UPDATE disaster
SET country_code = 'mr'
WHERE country_code IS NULL
  AND lat BETWEEN 14.72 AND 27.3
  AND lng BETWEEN -17.07 AND -4.83;

UPDATE disaster
SET country_code = 'nz'
WHERE country_code IS NULL
  AND lat BETWEEN -47.29 AND -34.39
  AND lng BETWEEN 166.43 AND 178.57;

UPDATE disaster
SET country_code = 've'
WHERE country_code IS NULL
  AND lat BETWEEN 0.65 AND 12.2
  AND lng BETWEEN -73.35 AND -59.76;

UPDATE disaster
SET country_code = 'ph'
WHERE country_code IS NULL
  AND lat BETWEEN 4.64 AND 21.12
  AND lng BETWEEN 116.93 AND 126.6;

UPDATE disaster
SET country_code = 'bo'
WHERE country_code IS NULL
  AND lat BETWEEN -22.9 AND -9.69
  AND lng BETWEEN -69.64 AND -57.45;

UPDATE disaster
SET country_code = 'na'
WHERE country_code IS NULL
  AND lat BETWEEN -28.97 AND -16.96
  AND lng BETWEEN 11.72 AND 25.26;

UPDATE disaster
SET country_code = 'td'
WHERE country_code IS NULL
  AND lat BETWEEN 7.44 AND 23.45
  AND lng BETWEEN 13.47 AND 24;

UPDATE disaster
SET country_code = 'ao'
WHERE country_code IS NULL
  AND lat BETWEEN -18.04 AND -4.44
  AND lng BETWEEN 11.68 AND 24.08;

UPDATE disaster
SET country_code = 'mm'
WHERE country_code IS NULL
  AND lat BETWEEN 9.78 AND 28.54
  AND lng BETWEEN 92.19 AND 101.18;

UPDATE disaster
SET country_code = 'et'
WHERE country_code IS NULL
  AND lat BETWEEN 3.4 AND 14.9
  AND lng BETWEEN 33 AND 48;

UPDATE disaster
SET country_code = 'mz'
WHERE country_code IS NULL
  AND lat BETWEEN -26.87 AND -10.47
  AND lng BETWEEN 30.22 AND 40.84;

UPDATE disaster
SET country_code = 'se'
WHERE country_code IS NULL
  AND lat BETWEEN 55.34 AND 69.06
  AND lng BETWEEN 11.12 AND 24.16;

UPDATE disaster
SET country_code = 'ne'
WHERE country_code IS NULL
  AND lat BETWEEN 11.69 AND 23.52
  AND lng BETWEEN 0.16 AND 15.9;

UPDATE disaster
SET country_code = 'sd'
WHERE country_code IS NULL
  AND lat BETWEEN 8.69 AND 22.22
  AND lng BETWEEN 23.99 AND 38.68;

UPDATE disaster
SET country_code = 'za'
WHERE country_code IS NULL
  AND lat BETWEEN -34.83 AND -22.13
  AND lng BETWEEN 16.48 AND 32.89;

UPDATE disaster
SET country_code = 'ly'
WHERE country_code IS NULL
  AND lat BETWEEN 19.5 AND 33.17
  AND lng BETWEEN 9.39 AND 25.15;

UPDATE disaster
SET country_code = 'pk'
WHERE country_code IS NULL
  AND lat BETWEEN 23.69 AND 37.1
  AND lng BETWEEN 60.87 AND 77.1;

UPDATE disaster
SET country_code = 'pe'
WHERE country_code IS NULL
  AND lat BETWEEN -18.35 AND -0.06
  AND lng BETWEEN -81.41 AND -68.66;

UPDATE disaster
SET country_code = 'co'
WHERE country_code IS NULL
  AND lat BETWEEN -4.23 AND 12.46
  AND lng BETWEEN -81.73 AND -66.87;

UPDATE disaster
SET country_code = 'ir'
WHERE country_code IS NULL
  AND lat BETWEEN 25.06 AND 39.78
  AND lng BETWEEN 44.03 AND 63.33;

UPDATE disaster
SET country_code = 'sa'
WHERE country_code IS NULL
  AND lat BETWEEN 16.38 AND 32.16
  AND lng BETWEEN 34.49 AND 55.67;

UPDATE disaster
SET country_code = 'mn'
WHERE country_code IS NULL
  AND lat BETWEEN 41.59 AND 52.15
  AND lng BETWEEN 87.76 AND 119.93;

UPDATE disaster
SET country_code = 'no'
WHERE country_code IS NULL
  AND lat BETWEEN 57.97 AND 71.19
  AND lng BETWEEN 4.65 AND 31.1;

UPDATE disaster
SET country_code = 'cl'
WHERE country_code IS NULL
  AND lat BETWEEN -55.98 AND -17.5
  AND lng BETWEEN -75.64 AND -66.42;

UPDATE disaster
SET country_code = 'cd'
WHERE country_code IS NULL
  AND lat BETWEEN -13.46 AND 5.38
  AND lng BETWEEN 12.18 AND 31.31;

UPDATE disaster
SET country_code = 'es'
WHERE country_code IS NULL
  AND lat BETWEEN 27.64 AND 43.99
  AND lng BETWEEN -18.16 AND 4.33;

UPDATE disaster
SET country_code = 'dz'
WHERE country_code IS NULL
  AND lat BETWEEN 18.97 AND 37.09
  AND lng BETWEEN -8.68 AND 11.99;

UPDATE disaster
SET country_code = 'jp'
WHERE country_code IS NULL
  AND lat BETWEEN 24.4 AND 45.55
  AND lng BETWEEN 122.94 AND 145.82;

UPDATE disaster
SET country_code = 'kz'
WHERE country_code IS NULL
  AND lat BETWEEN 40.56 AND 55.43
  AND lng BETWEEN 50.27 AND 87.36;

UPDATE disaster
SET country_code = 'mx'
WHERE country_code IS NULL
  AND lat BETWEEN 14.53 AND 32.72
  AND lng BETWEEN -117.13 AND -86.74;

UPDATE disaster
SET country_code = 'ar'
WHERE country_code IS NULL
  AND lat BETWEEN -55.05 AND -21.78
  AND lng BETWEEN -73.56 AND -53.65;

UPDATE disaster
SET country_code = 'id'
WHERE country_code IS NULL
  AND lat BETWEEN -11 AND 6.08
  AND lng BETWEEN 95.01 AND 141.02;

UPDATE disaster
SET country_code = 'in'
WHERE country_code IS NULL
  AND lat BETWEEN 6.75 AND 35.51
  AND lng BETWEEN 68.18 AND 97.4;

UPDATE disaster
SET country_code = 'au'
WHERE country_code IS NULL
  AND lat BETWEEN -43.63 AND -10.67
  AND lng BETWEEN 113.34 AND 153.57;

UPDATE disaster
SET country_code = 'br'
WHERE country_code IS NULL
  AND lat BETWEEN -33.75 AND 5.27
  AND lng BETWEEN -73.99 AND -34.73;

UPDATE disaster
SET country_code = 'cn'
WHERE country_code IS NULL
  AND lat BETWEEN 18.16 AND 53.56
  AND lng BETWEEN 73.5 AND 135.09;

UPDATE disaster
SET country_code = 'ca'
WHERE country_code IS NULL
  AND lat BETWEEN 41.67 AND 83.11
  AND lng BETWEEN -141 AND -52.65;

UPDATE disaster
SET country_code = 'us'
WHERE country_code IS NULL
  AND lat BETWEEN 24.52 AND 71.35
  AND lng BETWEEN -179.14 AND -66.95;

UPDATE disaster
SET country_code = 'ru'
WHERE country_code IS NULL
  AND lat BETWEEN 41.19 AND 81.86
  AND lng BETWEEN 19.64 AND 190;

