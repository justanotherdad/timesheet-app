-- 2026-08-01: Client role, budget view flag, separate bulletin feeds
--
-- 1) Allow user_profiles.role = 'client' (widens check constraint if present)
-- 2) po_budget_access.can_view_budget (default true for existing grants;
--    Client grants insert false — approve without Budget Detail until enabled)
-- 3) bulletin_posts.audience = 'employee' | 'client' (separate feeds)
-- 4) timesheet_signatures.signer_role allows 'client'
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. user_profiles.role: add 'client'
-- ---------------------------------------------------------------------------
do $$
declare
  cname text;
  def text;
begin
  select con.conname, pg_get_constraintdef(con.oid)
    into cname, def
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'user_profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%'
  limit 1;

  if cname is not null then
    execute format('alter table public.user_profiles drop constraint %I', cname);
    alter table public.user_profiles
      add constraint user_profiles_role_check
      check (role in ('employee', 'supervisor', 'manager', 'admin', 'super_admin', 'client'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. po_budget_access.can_view_budget
-- ---------------------------------------------------------------------------
alter table public.po_budget_access
  add column if not exists can_view_budget boolean not null default true;

comment on column public.po_budget_access.can_view_budget is
  'When true, granted user may open Budget Detail / PO balance popups for this PO. Defaults true for back-compat; Client grants insert false.';

-- ---------------------------------------------------------------------------
-- 3. bulletin_posts.audience (separate Employee vs Client feeds)
-- ---------------------------------------------------------------------------
alter table public.bulletin_posts
  add column if not exists audience text not null default 'employee';

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'bulletin_posts'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%audience%'
  limit 1;

  if cname is not null then
    execute format('alter table public.bulletin_posts drop constraint %I', cname);
  end if;

  alter table public.bulletin_posts
    add constraint bulletin_posts_audience_check
    check (audience in ('employee', 'client'));
end $$;

comment on column public.bulletin_posts.audience is
  'Separate bulletin feeds: employee (internal) vs client. Posts are never shared across audiences.';

drop index if exists bulletin_posts_feed_idx;
create index if not exists bulletin_posts_feed_idx
  on public.bulletin_posts (audience, is_pinned desc, created_at desc)
  where deleted_at is null;

-- Tighten SELECT: clients see client feed; everyone else (non-admin) sees employee feed;
-- admin/super_admin see both. Writes still go through service-role API.
drop policy if exists bulletin_posts_select_authenticated on public.bulletin_posts;
create policy bulletin_posts_select_authenticated
  on public.bulletin_posts
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      exists (
        select 1 from public.user_profiles up
        where up.id = auth.uid()
          and up.role in ('admin', 'super_admin')
      )
      or (
        audience = 'client'
        and exists (
          select 1 from public.user_profiles up
          where up.id = auth.uid() and up.role = 'client'
        )
      )
      or (
        audience = 'employee'
        and exists (
          select 1 from public.user_profiles up
          where up.id = auth.uid() and up.role is distinct from 'client'
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. timesheet_signatures.signer_role: add 'client'
-- ---------------------------------------------------------------------------
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'timesheet_signatures'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%signer_role%'
  limit 1;

  if cname is not null then
    execute format('alter table public.timesheet_signatures drop constraint %I', cname);
    alter table public.timesheet_signatures
      add constraint timesheet_signatures_signer_role_check
      check (signer_role in ('client', 'budget_approver', 'supervisor', 'manager', 'final_approver'));
  end if;
end $$;
