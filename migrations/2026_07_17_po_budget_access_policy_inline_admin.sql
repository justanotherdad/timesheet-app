-- 2026-07-17: Harden the SELECT policies from 2026_07_16_security_advisor_rls.sql
--
-- The 2026-07-16 migration created SELECT policies on po_budget_access and
-- timesheet_confirmation_receipts whose admin branch used the public.is_admin()
-- helper. That helper's definition is not in the repo, so we can't guarantee it
-- returns true for BOTH 'admin' and 'super_admin'. If it only covered 'admin',
-- a super_admin viewing the PO access-management list (which lists rows by PO)
-- would see only their own row.
--
-- This migration recreates both policies with a self-contained inline role check
-- that explicitly covers 'admin' and 'super_admin'. The subquery reads only the
-- caller's own user_profiles row — the same self-read lib/auth.ts getCurrentUser
-- already performs under the authenticated role — so it introduces no new access.
--
-- No behaviour change for regular users (self-rows via user_id = auth.uid()).
-- Writes remain service-role-only (BYPASSRLS), so this cannot affect mutations.
--
-- Idempotent: safe to run multiple times. Run this ONLY (the 2026-07-16 file was
-- already applied); this drops and recreates just the two policies.
--
-- Usage: paste into the Supabase SQL editor and Run (or psql -f).

drop policy if exists po_budget_access_select on public.po_budget_access;
create policy po_budget_access_select
  on public.po_budget_access
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role in ('admin', 'super_admin')
    )
  );

drop policy if exists timesheet_confirmation_receipts_select on public.timesheet_confirmation_receipts;
create policy timesheet_confirmation_receipts_select
  on public.timesheet_confirmation_receipts
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role in ('admin', 'super_admin')
    )
  );
