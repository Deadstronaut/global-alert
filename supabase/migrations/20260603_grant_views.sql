-- View'lara anon + authenticated okuma izni ver
-- (DROP+CREATE sonrası grant'lar sıfırlanır)

GRANT SELECT ON earthquake_view    TO anon, authenticated;
GRANT SELECT ON wildfire_view      TO anon, authenticated;
GRANT SELECT ON flood_view         TO anon, authenticated;
GRANT SELECT ON drought_view       TO anon, authenticated;
GRANT SELECT ON food_security_view TO anon, authenticated;
GRANT SELECT ON tsunami_view       TO anon, authenticated;
GRANT SELECT ON cyclone_view       TO anon, authenticated;
GRANT SELECT ON volcano_view       TO anon, authenticated;
GRANT SELECT ON epidemic_view      TO anon, authenticated;
