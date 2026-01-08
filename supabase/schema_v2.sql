-- Migration to new timesheet structure matching the weekly format
-- This replaces the old timesheets table structure

-- Drop old timesheets table if it exists (be careful in production!)
-- DROP TABLE IF EXISTS timesheet_signatures CASCADE;
-- DROP TABLE IF EXISTS timesheets CASCADE;

-- New Timesheets table (one per week per user)
CREATE TABLE IF NOT EXISTS weekly_timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  week_ending DATE NOT NULL,
  week_starting DATE NOT NULL, -- Monday of the week
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')) DEFAULT 'draft',
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_by_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  employee_signed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, week_ending)
);

-- Timesheet entries table (billable time entries - multiple per timesheet)
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID NOT NULL REFERENCES weekly_timesheets(id) ON DELETE CASCADE,
  client_project_id UUID REFERENCES sites(id) ON DELETE RESTRICT, -- Client/Project
  po_id UUID REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  task_description TEXT NOT NULL,
  mon_hours DECIMAL(10, 2) DEFAULT 0 CHECK (mon_hours >= 0),
  tue_hours DECIMAL(10, 2) DEFAULT 0 CHECK (tue_hours >= 0),
  wed_hours DECIMAL(10, 2) DEFAULT 0 CHECK (wed_hours >= 0),
  thu_hours DECIMAL(10, 2) DEFAULT 0 CHECK (thu_hours >= 0),
  fri_hours DECIMAL(10, 2) DEFAULT 0 CHECK (fri_hours >= 0),
  sat_hours DECIMAL(10, 2) DEFAULT 0 CHECK (sat_hours >= 0),
  sun_hours DECIMAL(10, 2) DEFAULT 0 CHECK (sun_hours >= 0),
  total_hours DECIMAL(10, 2) GENERATED ALWAYS AS (
    mon_hours + tue_hours + wed_hours + thu_hours + fri_hours + sat_hours + sun_hours
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unbillable time entries table
CREATE TABLE IF NOT EXISTS timesheet_unbillable (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID NOT NULL REFERENCES weekly_timesheets(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (description IN ('HOLIDAY', 'INTERNAL', 'PTO')),
  mon_hours DECIMAL(10, 2) DEFAULT 0 CHECK (mon_hours >= 0),
  tue_hours DECIMAL(10, 2) DEFAULT 0 CHECK (tue_hours >= 0),
  wed_hours DECIMAL(10, 2) DEFAULT 0 CHECK (wed_hours >= 0),
  thu_hours DECIMAL(10, 2) DEFAULT 0 CHECK (thu_hours >= 0),
  fri_hours DECIMAL(10, 2) DEFAULT 0 CHECK (fri_hours >= 0),
  sat_hours DECIMAL(10, 2) DEFAULT 0 CHECK (sat_hours >= 0),
  sun_hours DECIMAL(10, 2) DEFAULT 0 CHECK (sun_hours >= 0),
  total_hours DECIMAL(10, 2) GENERATED ALWAYS AS (
    mon_hours + tue_hours + wed_hours + thu_hours + fri_hours + sat_hours + sun_hours
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(timesheet_id, description)
);

-- Timesheet signatures table (updated to reference weekly_timesheets)
CREATE TABLE IF NOT EXISTS timesheet_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID NOT NULL REFERENCES weekly_timesheets(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('supervisor', 'manager')),
  signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  signature_data TEXT, -- For storing signature image/data
  UNIQUE(timesheet_id, signer_id, signer_role)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weekly_timesheets_user_id ON weekly_timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_timesheets_week_ending ON weekly_timesheets(week_ending);
CREATE INDEX IF NOT EXISTS idx_weekly_timesheets_status ON weekly_timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet_id ON timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_unbillable_timesheet_id ON timesheet_unbillable(timesheet_id);

-- Triggers
CREATE TRIGGER update_weekly_timesheets_updated_at BEFORE UPDATE ON weekly_timesheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timesheet_entries_updated_at BEFORE UPDATE ON timesheet_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timesheet_unbillable_updated_at BEFORE UPDATE ON timesheet_unbillable
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

ALTER TABLE weekly_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_unbillable ENABLE ROW LEVEL SECURITY;

-- Weekly timesheets policies
CREATE POLICY "Users can view their own weekly timesheets"
  ON weekly_timesheets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Managers can view weekly timesheets of their reports"
  ON weekly_timesheets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() 
      AND role IN ('manager', 'supervisor', 'admin', 'super_admin')
      AND (
        user_id IN (
          SELECT id FROM user_profiles WHERE reports_to_id = auth.uid()
        )
        OR user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create their own weekly timesheets"
  ON weekly_timesheets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own draft weekly timesheets"
  ON weekly_timesheets FOR UPDATE
  USING (
    auth.uid() = user_id AND status = 'draft'
  );

CREATE POLICY "Admins can update any weekly timesheet"
  ON weekly_timesheets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Managers can approve weekly timesheets"
  ON weekly_timesheets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      WHERE up1.id = auth.uid() 
      AND up1.role IN ('manager', 'supervisor', 'admin', 'super_admin')
      AND (
        EXISTS (
          SELECT 1 FROM user_profiles up2
          WHERE up2.id = weekly_timesheets.user_id
          AND up2.reports_to_id = auth.uid()
        )
        OR weekly_timesheets.user_id = auth.uid()
      )
    )
  );

-- Timesheet entries policies
CREATE POLICY "Users can manage entries for their own timesheets"
  ON timesheet_entries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM weekly_timesheets
      WHERE id = timesheet_entries.timesheet_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can view entries for their reports' timesheets"
  ON timesheet_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM weekly_timesheets wt
      JOIN user_profiles up ON up.id = wt.user_id
      WHERE wt.id = timesheet_entries.timesheet_id
      AND (
        up.reports_to_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_profiles
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      )
    )
  );

-- Unbillable time policies
CREATE POLICY "Users can manage unbillable for their own timesheets"
  ON timesheet_unbillable FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM weekly_timesheets
      WHERE id = timesheet_unbillable.timesheet_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can view unbillable for their reports' timesheets"
  ON timesheet_unbillable FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM weekly_timesheets wt
      JOIN user_profiles up ON up.id = wt.user_id
      WHERE wt.id = timesheet_unbillable.timesheet_id
      AND (
        up.reports_to_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_profiles
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      )
    )
  );

