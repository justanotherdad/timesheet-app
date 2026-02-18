-- Fix audit_log RLS policy: use user_profiles instead of profiles
-- Run this if you got "column p.id does not exist" from the original migration

DROP POLICY IF EXISTS "Admins can read audit_log" ON public.audit_log;

CREATE POLICY "Admins can read audit_log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role IN ('admin', 'super_admin')
    )
  );
