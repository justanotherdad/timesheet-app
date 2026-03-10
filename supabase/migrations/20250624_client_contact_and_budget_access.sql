-- Add client_contact_name to purchase_orders (per-PO client contact)
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS client_contact_name text;

-- Create po_budget_access for explicit budget access grants (admin can grant access to any user with a profile)
CREATE TABLE IF NOT EXISTS po_budget_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, purchase_order_id)
);

CREATE INDEX IF NOT EXISTS idx_po_budget_access_po ON po_budget_access(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_budget_access_user ON po_budget_access(user_id);

COMMENT ON TABLE po_budget_access IS 'Explicit budget access grants. Users listed here can view the PO budget regardless of site/role.';
