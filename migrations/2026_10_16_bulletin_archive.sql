-- 2026-10-16: Archive bulletin posts without deleting them.
--
-- Admins can move a post off the Employee and Client feeds and restore it
-- later. Delete still sets deleted_at. Non-admins cannot read archived posts.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

alter table public.bulletin_posts
  add column if not exists archived_at timestamptz;

comment on column public.bulletin_posts.archived_at is
  'When set, the post is hidden from Employee and Client views and listed in Archive. Null means it is on its live feed.';

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
        archived_at is null
        and audience = 'client'
        and exists (
          select 1 from public.user_profiles up
          where up.id = auth.uid() and up.role = 'client'
        )
      )
      or (
        archived_at is null
        and audience = 'employee'
        and exists (
          select 1 from public.user_profiles up
          where up.id = auth.uid() and up.role is distinct from 'client'
        )
      )
    )
  );
