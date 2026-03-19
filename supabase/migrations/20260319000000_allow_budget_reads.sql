-- Allow authenticated users to read po_expense_types and user_profiles (id, name).
-- Fixes: (1) Add Expense dropdown empty for non-admins, (2) Bill Rates showing "Unknown"
-- for supervisors with budget access when RLS blocks them from seeing that profile.
--
-- Run: supabase db push  OR  paste into Supabase SQL Editor

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
