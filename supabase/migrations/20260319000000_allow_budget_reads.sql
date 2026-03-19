-- Allow authenticated users to read po_expense_types, user_profiles, and po_expenses.
-- Fixes: (1) Add Expense dropdown empty, (2) Bill Rates "Unknown", (3) Expenses not showing after add.
-- API verifies budget access before returning data.
--
-- Run: supabase db push  OR  paste into Supabase SQL Editor

-- po_expenses: so budget viewers see expenses after adding (RLS may block when admin client unavailable)
ALTER TABLE public.po_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read po_expenses" ON public.po_expenses;
CREATE POLICY "Allow authenticated read po_expenses"
  ON public.po_expenses FOR SELECT
  TO authenticated
  USING (true);

-- po_expense_types: reference data for Add Expense dropdown
ALTER TABLE public.po_expense_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read po_expense_types" ON public.po_expense_types;
CREATE POLICY "Allow authenticated read po_expense_types"
  ON public.po_expense_types FOR SELECT
  TO authenticated
  USING (true);

-- user_profiles: allow budget viewers to resolve employee names in Bill Rates
-- (admins already see all; supervisors with po_budget_access were blocked by RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read user_profiles_for_budget" ON public.user_profiles;
CREATE POLICY "Allow authenticated read user_profiles_for_budget"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (true);
