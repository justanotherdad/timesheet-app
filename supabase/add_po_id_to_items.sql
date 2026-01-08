-- Add po_id to systems, activities, and deliverables tables
-- This allows these items to be linked to specific purchase orders

-- Add po_id to systems
ALTER TABLE systems ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- Add po_id to activities
ALTER TABLE activities ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- Add po_id to deliverables
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_systems_po_id ON systems(po_id);
CREATE INDEX IF NOT EXISTS idx_activities_po_id ON activities(po_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_po_id ON deliverables(po_id);
