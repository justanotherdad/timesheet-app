-- Migration: Add junction tables for systems, activities, and deliverables
-- This allows multiple departments and purchase orders to be assigned to each item

-- Junction table for systems and departments
CREATE TABLE IF NOT EXISTS system_departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(system_id, department_id)
);

-- Junction table for systems and purchase orders
CREATE TABLE IF NOT EXISTS system_purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(system_id, purchase_order_id)
);

-- Junction table for activities and departments
CREATE TABLE IF NOT EXISTS activity_departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, department_id)
);

-- Junction table for activities and purchase orders
CREATE TABLE IF NOT EXISTS activity_purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, purchase_order_id)
);

-- Junction table for deliverables and departments
CREATE TABLE IF NOT EXISTS deliverable_departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deliverable_id UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deliverable_id, department_id)
);

-- Junction table for deliverables and purchase orders
CREATE TABLE IF NOT EXISTS deliverable_purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deliverable_id UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deliverable_id, purchase_order_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_system_departments_system_id ON system_departments(system_id);
CREATE INDEX IF NOT EXISTS idx_system_departments_department_id ON system_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_system_purchase_orders_system_id ON system_purchase_orders(system_id);
CREATE INDEX IF NOT EXISTS idx_system_purchase_orders_purchase_order_id ON system_purchase_orders(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_activity_departments_activity_id ON activity_departments(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_departments_department_id ON activity_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_activity_purchase_orders_activity_id ON activity_purchase_orders(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_purchase_orders_purchase_order_id ON activity_purchase_orders(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_deliverable_departments_deliverable_id ON deliverable_departments(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_departments_department_id ON deliverable_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_purchase_orders_deliverable_id ON deliverable_purchase_orders(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_purchase_orders_purchase_order_id ON deliverable_purchase_orders(purchase_order_id);

-- Migrate existing data (if any) from single department_id/po_id to junction tables
-- This is optional - only run if you have existing data to migrate
DO $$
BEGIN
  -- Migrate systems
  INSERT INTO system_departments (system_id, department_id)
  SELECT id, department_id FROM systems WHERE department_id IS NOT NULL
  ON CONFLICT (system_id, department_id) DO NOTHING;
  
  INSERT INTO system_purchase_orders (system_id, purchase_order_id)
  SELECT id, po_id FROM systems WHERE po_id IS NOT NULL
  ON CONFLICT (system_id, purchase_order_id) DO NOTHING;
  
  -- Migrate activities
  INSERT INTO activity_departments (activity_id, department_id)
  SELECT id, department_id FROM activities WHERE department_id IS NOT NULL
  ON CONFLICT (activity_id, department_id) DO NOTHING;
  
  INSERT INTO activity_purchase_orders (activity_id, purchase_order_id)
  SELECT id, po_id FROM activities WHERE po_id IS NOT NULL
  ON CONFLICT (activity_id, purchase_order_id) DO NOTHING;
  
  -- Migrate deliverables
  INSERT INTO deliverable_departments (deliverable_id, department_id)
  SELECT id, department_id FROM deliverables WHERE department_id IS NOT NULL
  ON CONFLICT (deliverable_id, department_id) DO NOTHING;
  
  INSERT INTO deliverable_purchase_orders (deliverable_id, purchase_order_id)
  SELECT id, po_id FROM deliverables WHERE po_id IS NOT NULL
  ON CONFLICT (deliverable_id, purchase_order_id) DO NOTHING;
END $$;
