-- =====================================================
-- Spec 028 fix-up: get_access_review() never returned locked_until, so the
-- UsersPanel.vue lock badge/unlock button and the CSV/JSON access review
-- export always showed accounts as unlocked regardless of actual lockout
-- state (isLocked() in UsersPanel.vue reads row?.locked_until, which was
-- always undefined). Adding the column here fixes both the on-screen badge
-- and the export without touching UsersPanel.vue, since it already reads
-- this field defensively from whatever get_access_review() returns.
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
  created_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ
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
      p.created_at,
      p.locked_until
    FROM profiles p
    LEFT JOIN profile_capability_grants g ON g.profile_id = p.id
    LEFT JOIN auth.users u ON u.id = p.id
    GROUP BY p.id, u.last_sign_in_at
    ORDER BY p.email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_access_review() TO authenticated;
