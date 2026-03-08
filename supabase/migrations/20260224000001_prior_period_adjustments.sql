-- Prior period adjustments: for budgets in use before timesheets were in this system
-- Run in Supabase SQL Editor

-- Hours already billed to this PO before this system (shown in billable activities)
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS prior_hours_billed decimal(10,2) DEFAULT 0;

-- Amount already spent before this system (reduces running balance)
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS prior_amount_spent decimal(10,2) DEFAULT 0;

-- Optional: notes explaining the adjustment (e.g. "Migrated from Excel - hours through Jan 2026")
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS prior_period_notes text;
