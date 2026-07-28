-- 2026-07-28: Allow managers to manage systems / activities / deliverables
--
-- Background: Access Levels.md, the in-app Guide, and Manage Timesheet Options
-- all treat managers as full writers for these catalogs (supervisors stay
-- view-only). Junction tables (system_purchase_orders, etc.) and org tables
-- were already updated to include manager, but the three base tables kept the
-- original "Admins can manage …" FOR ALL policies (admin / super_admin only).
-- Result: managers hit "new row violates row-level security policy" on Add /
-- Import while the UI still offered the buttons.
--
-- This migration replaces those admin-only policies with manager + admin +
-- super_admin, matching the junction-table pattern. SELECT policies
-- ("Everyone can view …") are left untouched. Admins keep working because
-- they still match the role check.
--
-- Run in the Supabase SQL editor (or psql). Safe to re-run: DROP IF EXISTS
-- before CREATE.

-- systems
drop policy if exists "Admins can manage systems" on public.systems;
drop policy if exists "Managers and admins can manage systems" on public.systems;
create policy "Managers and admins can manage systems"
  on public.systems
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid()
        and role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid()
        and role in ('manager', 'admin', 'super_admin')
    )
  );

-- activities
drop policy if exists "Admins can manage activities" on public.activities;
drop policy if exists "Managers and admins can manage activities" on public.activities;
create policy "Managers and admins can manage activities"
  on public.activities
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid()
        and role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid()
        and role in ('manager', 'admin', 'super_admin')
    )
  );

-- deliverables
drop policy if exists "Admins can manage deliverables" on public.deliverables;
drop policy if exists "Managers and admins can manage deliverables" on public.deliverables;
create policy "Managers and admins can manage deliverables"
  on public.deliverables
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid()
        and role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid()
        and role in ('manager', 'admin', 'super_admin')
    )
  );
