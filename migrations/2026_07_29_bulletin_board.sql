-- 2026-07-29: Bulletin Board posts for the Timesheet Dashboard.
--
-- A feed of rich-text announcements visible to all authenticated users.
-- Only admin / super_admin may create, update, or soft-delete (enforced in API
-- via the service-role client; RLS keeps the table locked for direct client
-- access, matching generated_reports).
--
-- Media (images / short videos) lives in the existing `site-attachments` bucket
-- under bulletin/… and is served through /api/bulletin/media.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

create table if not exists public.bulletin_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_html text not null default '',
  author_id uuid references public.user_profiles(id) on delete set null,
  author_name text,
  is_pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bulletin_posts_feed_idx
  on public.bulletin_posts (is_pinned desc, created_at desc)
  where deleted_at is null;

comment on table public.bulletin_posts is
  'Dashboard Bulletin Board posts. Rich HTML body; visible to all authenticated users; writable by admin/super_admin via API.';

alter table public.bulletin_posts enable row level security;

-- Allow all signed-in users to read non-deleted posts (dashboard feed).
drop policy if exists bulletin_posts_select_authenticated on public.bulletin_posts;
create policy bulletin_posts_select_authenticated
  on public.bulletin_posts
  for select
  to authenticated
  using (deleted_at is null);

-- Writes go through the service-role client (BYPASSRLS) in /api/bulletin.
-- No insert/update/delete policies for authenticated keeps direct client writes locked.

-- Allow video MIME types on the shared site-attachments bucket (images already allowed).
update storage.buckets
set allowed_mime_types = (
  select array(
    select distinct unnest(
      coalesce(allowed_mime_types, array[]::text[])
      || array[
        'video/mp4',
        'video/webm',
        'video/quicktime'
      ]
    )
  )
)
where id = 'site-attachments'
  and allowed_mime_types is not null;
