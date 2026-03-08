-- Budget feature: PO budget type, bill rates, invoices, expenses
-- Run this migration in Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- Add budget_type to purchase_orders ('basic' | 'project')
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS budget_type text DEFAULT 'basic' CHECK (budget_type IN ('basic', 'project'));

-- Bill rates per person per PO, with effective date (historical rates preserved)
CREATE TABLE IF NOT EXISTS po_bill_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rate decimal(10,2) NOT NULL,
  effective_from_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(po_id, user_id, effective_from_date)
);

CREATE INDEX IF NOT EXISTS idx_po_bill_rates_po ON po_bill_rates(po_id);
CREATE INDEX IF NOT EXISTS idx_po_bill_rates_user ON po_bill_rates(user_id);

-- Invoice history (Admin-entered)
CREATE TABLE IF NOT EXISTS po_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  invoice_date date NOT NULL,
  invoice_number text,
  period_month int NOT NULL,
  period_year int NOT NULL,
  amount decimal(10,2) NOT NULL,
  payment_received_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_po_invoices_po ON po_invoices(po_id);

-- Predefined expense types
CREATE TABLE IF NOT EXISTS po_expense_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_system boolean DEFAULT true
);

INSERT INTO po_expense_types (name, is_system) VALUES
  ('Travel and Living', true),
  ('Equipment Rental', true),
  ('Equipment Purchase', true),
  ('Mileage', true)
ON CONFLICT (name) DO NOTHING;

-- Additional expenses (predefined or custom)
CREATE TABLE IF NOT EXISTS po_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  expense_type_id uuid REFERENCES po_expense_types(id) ON DELETE SET NULL,
  custom_type_name text,
  amount decimal(10,2) NOT NULL,
  expense_date date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_po_expenses_po ON po_expenses(po_id);

-- RLS policies (adjust as needed for your auth)
ALTER TABLE po_bill_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_expense_types ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users (budget page will filter by site access)
CREATE POLICY "Allow read po_bill_rates" ON po_bill_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert po_bill_rates" ON po_bill_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update po_bill_rates" ON po_bill_rates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow delete po_bill_rates" ON po_bill_rates FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow read po_invoices" ON po_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert po_invoices" ON po_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update po_invoices" ON po_invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow delete po_invoices" ON po_invoices FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow read po_expenses" ON po_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert po_expenses" ON po_expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update po_expenses" ON po_expenses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow delete po_expenses" ON po_expenses FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow read po_expense_types" ON po_expense_types FOR SELECT TO authenticated USING (true);
