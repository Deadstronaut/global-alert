-- =====================================================
-- Spec 028 fix-up: get_access_review() raised "structure of query does not
-- match function result type" because profiles.country_code is
-- `character varying`, not `text` (the declared RETURNS TABLE type) — live
-- transactional testing caught this immediately after applying
-- 20260709120000. Casting the selected column to ::text resolves it; no
-- other part of that migration was affected (confirmed live: columns,
-- record_failed_login, clear_own_login_lock, unlock_profile all work as
-- designed).
-- =====================================================

DROP FUNCTION IF EXISTS get_access_review();
CREATE OR REPLACE FUNCTION get_access_review()
RETURNS TABLE(
  profile_id UUID,
  email TEXT,
  role TEXT,
  country_code TEXT,
  org_id UUID,
  is_active BOOLEAN,
  capabilities TEXT[],
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_profile_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'not authorized to view access review';
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.email,
      p.role,
      p.country_code::text,
      p.org_id,
      p.is_active,
      COALESCE(array_agg(g.capability) FILTER (WHERE g.capability IS NOT NULL), ARRAY[]::text[]),
      u.last_sign_in_at,
      p.created_at
    FROM profiles p
    LEFT JOIN profile_capability_grants g ON g.profile_id = p.id
    LEFT JOIN auth.users u ON u.id = p.id
    GROUP BY p.id, u.last_sign_in_at
    ORDER BY p.email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_access_review() TO authenticated;
