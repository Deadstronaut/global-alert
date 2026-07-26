-- =====================================================
-- Fixes log_table_change(): audit_log.changed_by has NEVER been set by this
-- trigger (live-verified 2026-07-26 — every INSERT/UPDATE/DELETE row on
-- profiles/data_sources/organizations/etc. has changed_by=NULL going back
-- to the very first migration that created it, 20260605120000, and the
-- later search_path fix, 20260703120200, carried the same omission
-- forward). The table has a changed_by UUID REFERENCES auth.users(id)
-- column specifically so a super_admin could answer "who did this" from
-- the audit log — that question has silently never been answerable.
--
-- Fix: SECURITY DEFINER functions still see the CALLING request's JWT via
-- auth.uid() (it's session/request-scoped, not owner-scoped) — this was
-- simply never written into the INSERT statements.
-- =====================================================

CREATE OR REPLACE FUNCTION log_table_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (action, table_name, record_id, new_data, changed_by)
    VALUES ('INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (action, table_name, record_id, old_data, new_data, changed_by)
    VALUES ('UPDATE', TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (action, table_name, record_id, old_data, changed_by)
    VALUES ('DELETE', TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
