-- Holiday & Pay Calendar PDFs (one file per calendar year, replaceable by admins)
CREATE TABLE IF NOT EXISTS holiday_pay_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_year INTEGER NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS holiday_pay_calendars_year_idx ON holiday_pay_calendars (calendar_year);

ALTER TABLE holiday_pay_calendars ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read calendar metadata
CREATE POLICY holiday_pay_calendars_select ON holiday_pay_calendars
  FOR SELECT TO authenticated
  USING (true);

-- Admins manage uploads (enforced in API via service role as well)
CREATE POLICY holiday_pay_calendars_admin_all ON holiday_pay_calendars
  FOR ALL TO authenticated
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
