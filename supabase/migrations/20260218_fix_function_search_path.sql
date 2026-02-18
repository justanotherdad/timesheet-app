-- Fix Function Search Path Mutable (Security Advisor warning)
-- Sets search_path on functions to prevent search_path injection attacks.
-- Run each ALTER for functions that exist; adjust signatures if your schema differs.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN ('is_admin', 'update_updated_at_column')
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.nspname, r.proname, r.args);
  END LOOP;
END $$;
