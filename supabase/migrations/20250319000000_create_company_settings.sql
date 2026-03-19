-- Company settings (key-value) for organization-wide config
CREATE TABLE IF NOT EXISTS company_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read and update
CREATE POLICY "Admins can manage company_settings"
  ON company_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- All authenticated users can read (for display)
CREATE POLICY "Authenticated users can read company_settings"
  ON company_settings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Insert default company_email if not exists
INSERT INTO company_settings (key, value) VALUES ('company_email', '')
ON CONFLICT (key) DO NOTHING;
