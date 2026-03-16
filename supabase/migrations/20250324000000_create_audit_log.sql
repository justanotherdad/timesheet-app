-- Audit log table for admin audit trail
-- Run this in Supabase SQL Editor or via: supabase db push

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);

-- RLS: Only admins can read audit log (API uses admin client which bypasses RLS)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit_log"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- Inserts are done via service role (admin client) which bypasses RLS
