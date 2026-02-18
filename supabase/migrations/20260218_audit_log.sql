-- Audit log table for security events
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  user_id uuid,
  email text,
  ip_address text,
  user_agent text,
  details jsonb,
  success boolean
);

-- RLS: only admins can read audit logs
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

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

-- Service role (createAdminClient) bypasses RLS for insert - no policy needed
COMMENT ON TABLE public.audit_log IS 'Security audit log for auth and sensitive actions';
