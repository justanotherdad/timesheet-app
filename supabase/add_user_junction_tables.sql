-- Create junction tables for multiple sites, departments, and purchase orders per user
-- This allows users to be assigned to multiple sites, departments, and POs

-- User Sites junction table
CREATE TABLE IF NOT EXISTS user_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, site_id)
);

-- User Departments junction table
CREATE TABLE IF NOT EXISTS user_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, department_id)
);

-- User Purchase Orders junction table
CREATE TABLE IF NOT EXISTS user_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, purchase_order_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_sites_user_id ON user_sites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sites_site_id ON user_sites(site_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_user_id ON user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_department_id ON user_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_user_purchase_orders_user_id ON user_purchase_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_user_purchase_orders_po_id ON user_purchase_orders(purchase_order_id);

-- Migrate existing single assignments to junction tables (if any exist)
-- This preserves existing data when migrating from single to multiple assignments
INSERT INTO user_sites (user_id, site_id)
SELECT id, site_id FROM user_profiles WHERE site_id IS NOT NULL
ON CONFLICT (user_id, site_id) DO NOTHING;

INSERT INTO user_departments (user_id, department_id)
SELECT id, department_id FROM user_profiles WHERE department_id IS NOT NULL
ON CONFLICT (user_id, department_id) DO NOTHING;

-- Note: Purchase orders weren't directly linked to users before, so no migration needed

-- Enable RLS
ALTER TABLE user_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_purchase_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_sites
CREATE POLICY "Users can view their own site assignments"
  ON user_sites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all site assignments"
  ON user_sites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can manage site assignments"
  ON user_sites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for user_departments
CREATE POLICY "Users can view their own department assignments"
  ON user_departments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all department assignments"
  ON user_departments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can manage department assignments"
  ON user_departments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for user_purchase_orders
CREATE POLICY "Users can view their own PO assignments"
  ON user_purchase_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all PO assignments"
  ON user_purchase_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can manage PO assignments"
  ON user_purchase_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );
