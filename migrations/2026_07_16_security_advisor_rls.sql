-- 2026-07-16: Supabase Security Advisor remediation (safe subset)
--
-- Fixes the two ERROR-level "RLS Disabled in Public" findings and the
-- anon-executable SECURITY DEFINER function findings, WITHOUT changing any
-- app behaviour. Verified against the codebase:
--   * All WRITES to these tables go through the service-role client
--     (createAdminClient), which has BYPASSRLS — so no write policies are
--     needed and enabling RLS cannot break inserts/updates/deletes.
--   * po_budget_access is READ under the user-scoped client in several places:
--       - user pages/routes filter by `user_id = auth.uid()` (self access)
--       - the admin "who can access this PO" screen lists rows by PO and is
--         gated to admin/super_admin in code
--     so the SELECT policy allows self-rows OR admins.
--   * timesheet_confirmation_receipts is only read/written via service role;
--     a self-read policy is added for least-surprise / future use.
--
-- NOT covered here (left intentionally, see chat):
--   * rls_policy_always_true warnings (USING (true) on po_change_orders,
--     po_attachments, po_bill_rates, po_expenses, po_invoices, site_*). Some of
--     these back real browser-side writes and need role-aware policies + testing.
--   * auth_otp_long_expiry and auth_leaked_password_protection are Supabase Auth
--     dashboard settings, not SQL.
--
-- Idempotent: safe to run multiple times.
--
-- Usage: paste into the Supabase SQL editor and Run (or psql -f).

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on the two exposed tables
-- ---------------------------------------------------------------------------

alter table public.po_budget_access enable row level security;
alter table public.timesheet_confirmation_receipts enable row level security;

-- ---------------------------------------------------------------------------
-- 2. SELECT policies (writes stay service-role-only = bypass RLS)
-- ---------------------------------------------------------------------------

-- po_budget_access: a user may see their own grants; admins see all (needed by
-- the PO access-management screen, which lists grants by purchase_order_id).
drop policy if exists po_budget_access_select on public.po_budget_access;
create policy po_budget_access_select
  on public.po_budget_access
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
  );

-- timesheet_confirmation_receipts: app accesses this via service role only, but
-- allow a user to read their own receipts (and admins to read all) in case a
-- user-scoped read is ever added.
drop policy if exists timesheet_confirmation_receipts_select on public.timesheet_confirmation_receipts;
create policy timesheet_confirmation_receipts_select
  on public.timesheet_confirmation_receipts
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. Lock down SECURITY DEFINER helper functions to the anon role
-- ---------------------------------------------------------------------------
-- These are RLS/authorization helpers. The app never calls them via PostgREST
-- RPC (verified: no .rpc('is_admin' | 'can_manage_org' | 'can_access_bid_sheet')
-- anywhere), but they must remain executable by `authenticated` because RLS
-- policies invoke them under the caller's role. So: remove the blanket PUBLIC /
-- anon grant, then re-grant to authenticated only.

revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

revoke execute on function public.can_manage_org() from public, anon;
grant execute on function public.can_manage_org() to authenticated;

revoke execute on function public.can_access_bid_sheet(uuid) from public, anon;
grant execute on function public.can_access_bid_sheet(uuid) to authenticated;
