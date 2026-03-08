-- Ensure po_change_orders table exists and has RLS for budget detail
-- Run in Supabase SQL Editor if not using migrations

CREATE TABLE IF NOT EXISTS po_change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  co_number text,
  co_date date,
  amount decimal(10,2),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_change_orders_po ON po_change_orders(po_id);

-- RLS: allow authenticated users to read (budget API uses server client)
ALTER TABLE po_change_orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if re-running
DROP POLICY IF EXISTS "Allow read po_change_orders" ON po_change_orders;
DROP POLICY IF EXISTS "Allow insert po_change_orders" ON po_change_orders;
DROP POLICY IF EXISTS "Allow update po_change_orders" ON po_change_orders;
DROP POLICY IF EXISTS "Allow delete po_change_orders" ON po_change_orders;

CREATE POLICY "Allow read po_change_orders" ON po_change_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert po_change_orders" ON po_change_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update po_change_orders" ON po_change_orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow delete po_change_orders" ON po_change_orders FOR DELETE TO authenticated USING (true);
