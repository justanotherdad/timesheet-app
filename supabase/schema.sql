-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee', 'supervisor', 'manager', 'admin', 'super_admin')) DEFAULT 'employee',
  reports_to_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sites table
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number TEXT NOT NULL UNIQUE,
  description TEXT,
  manager_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Systems table
CREATE TABLE IF NOT EXISTS systems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activities table
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Deliverables table
CREATE TABLE IF NOT EXISTS deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Timesheets table
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  week_ending DATE NOT NULL,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  system_id UUID NOT NULL REFERENCES systems(id) ON DELETE RESTRICT,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  deliverable_id UUID NOT NULL REFERENCES deliverables(id) ON DELETE RESTRICT,
  hours DECIMAL(10, 2) NOT NULL CHECK (hours >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')) DEFAULT 'draft',
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_by_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, week_ending, site_id, po_id, system_id, activity_id, deliverable_id)
);

-- Timesheet signatures table
CREATE TABLE IF NOT EXISTS timesheet_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('supervisor', 'manager')),
  signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  signature_data TEXT, -- For storing signature image/data
  UNIQUE(timesheet_id, signer_id, signer_role)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_timesheets_user_id ON timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_week_ending ON timesheets(week_ending);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_reports_to ON user_profiles(reports_to_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_manager ON purchase_orders(manager_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_systems_updated_at BEFORE UPDATE ON systems
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activities_updated_at BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deliverables_updated_at BEFORE UPDATE ON deliverables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timesheets_updated_at BEFORE UPDATE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_signatures ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update user profiles"
  ON user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can insert user profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Sites policies
CREATE POLICY "Everyone can view sites"
  ON sites FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage sites"
  ON sites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Purchase Orders policies
CREATE POLICY "Everyone can view purchase orders"
  ON purchase_orders FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage purchase orders"
  ON purchase_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Systems policies
CREATE POLICY "Everyone can view systems"
  ON systems FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage systems"
  ON systems FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Activities policies
CREATE POLICY "Everyone can view activities"
  ON activities FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage activities"
  ON activities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Deliverables policies
CREATE POLICY "Everyone can view deliverables"
  ON deliverables FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage deliverables"
  ON deliverables FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Timesheets policies
CREATE POLICY "Users can view their own timesheets"
  ON timesheets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Managers can view timesheets of their reports"
  ON timesheets FOR SELECT
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

CREATE POLICY "Users can create their own timesheets"
  ON timesheets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own draft timesheets"
  ON timesheets FOR UPDATE
  USING (
    auth.uid() = user_id AND status = 'draft'
  );

CREATE POLICY "Admins can update any timesheet"
  ON timesheets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Managers can approve timesheets"
  ON timesheets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      WHERE up1.id = auth.uid() 
      AND up1.role IN ('manager', 'supervisor', 'admin', 'super_admin')
      AND (
        EXISTS (
          SELECT 1 FROM user_profiles up2
          WHERE up2.id = timesheets.user_id
          AND up2.reports_to_id = auth.uid()
        )
        OR timesheets.user_id = auth.uid()
      )
    )
  );

-- Timesheet signatures policies
CREATE POLICY "Users can view signatures on their timesheets"
  ON timesheet_signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM timesheets
      WHERE id = timesheet_signatures.timesheet_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can create signatures"
  ON timesheet_signatures FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN timesheets t ON t.id = timesheet_signatures.timesheet_id
      WHERE up1.id = auth.uid()
      AND up1.role IN ('manager', 'supervisor', 'admin', 'super_admin')
      AND (
        EXISTS (
          SELECT 1 FROM user_profiles up2
          WHERE up2.id = t.user_id
          AND up2.reports_to_id = auth.uid()
        )
        OR t.user_id = auth.uid()
      )
    )
  );

