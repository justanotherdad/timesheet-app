-- Schema v3: Hierarchical structure for Sites -> Departments -> Systems/Deliverables/Activities
-- This migration adds the new structure while maintaining backward compatibility

-- Add week_starting_day to sites (0=Sunday, 1=Monday, etc.)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS week_starting_day INTEGER DEFAULT 1 CHECK (week_starting_day >= 0 AND week_starting_day <= 6);

-- Departments table (belongs to a site)
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(site_id, name)
);

-- Systems table - now belongs to a department
ALTER TABLE systems ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS system_description TEXT;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT FALSE; -- For employee-added items

-- Activities table - now belongs to a department
ALTER TABLE activities ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT FALSE; -- For employee-added items

-- Deliverables table - now belongs to a department
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT FALSE; -- For employee-added items

-- Purchase Orders - now belongs to a site
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS assigned_to_type TEXT CHECK (assigned_to_type IN ('multiple', 'individual')) DEFAULT 'individual';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS assigned_to_user_ids UUID[]; -- Array of user IDs for multiple assignments

-- Custom items table for employee-added items
CREATE TABLE IF NOT EXISTS custom_timesheet_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('system', 'activity', 'deliverable')),
  name TEXT NOT NULL,
  description TEXT,
  is_approved BOOLEAN DEFAULT FALSE, -- Admin can approve to make it available to all
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update timesheet_entries to support custom items
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS custom_system_id UUID REFERENCES custom_timesheet_items(id) ON DELETE SET NULL;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS custom_activity_id UUID REFERENCES custom_timesheet_items(id) ON DELETE SET NULL;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS custom_deliverable_id UUID REFERENCES custom_timesheet_items(id) ON DELETE SET NULL;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_departments_site_id ON departments(site_id);
CREATE INDEX IF NOT EXISTS idx_systems_department_id ON systems(department_id);
CREATE INDEX IF NOT EXISTS idx_systems_site_id ON systems(site_id);
CREATE INDEX IF NOT EXISTS idx_activities_department_id ON activities(department_id);
CREATE INDEX IF NOT EXISTS idx_activities_site_id ON activities(site_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_department_id ON deliverables(department_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_site_id ON deliverables(site_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_site_id ON purchase_orders(site_id);
CREATE INDEX IF NOT EXISTS idx_custom_items_user_id ON custom_timesheet_items(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_items_site_id ON custom_timesheet_items(site_id);

-- Update triggers
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_items_updated_at BEFORE UPDATE ON custom_timesheet_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for new tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_timesheet_items ENABLE ROW LEVEL SECURITY;

-- Departments: Everyone can view, admins can manage
CREATE POLICY "Everyone can view departments"
  ON departments FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage departments"
  ON departments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Custom items: Users can view their own and approved ones, create their own
CREATE POLICY "Users can view their own custom items"
  ON custom_timesheet_items FOR SELECT
  USING (auth.uid() = user_id OR is_approved = true);

CREATE POLICY "Users can create their own custom items"
  ON custom_timesheet_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom items"
  ON custom_timesheet_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can approve custom items"
  ON custom_timesheet_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );
