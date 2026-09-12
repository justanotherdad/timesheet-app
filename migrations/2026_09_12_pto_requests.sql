-- 2026-09-12: Employee PTO / leave requests with a shared admin review queue.
--
-- Internal employees submit a date range and hours per day. Named reviewers
-- (company_settings.pto_request_approver_ids) see a pending inbox; the first
-- Approve or Deny settles the request for everyone.
--
-- Writes go through the service-role client (BYPASSRLS) in /api/pto.
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

create table if not exists public.pto_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  hours_per_day numeric(4, 2) not null,
  notes text,
  status text not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by_id uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  denial_reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pto_requests_dates_ok check (end_date >= start_date),
  constraint pto_requests_hours_ok check (hours_per_day > 0 and hours_per_day <= 8),
  constraint pto_requests_status_ok check (status in ('pending', 'approved', 'denied', 'cancelled'))
);

create index if not exists pto_requests_user_submitted_idx
  on public.pto_requests (user_id, submitted_at desc);

create index if not exists pto_requests_pending_idx
  on public.pto_requests (submitted_at)
  where status = 'pending';

comment on table public.pto_requests is
  'Employee leave requests (PTO, vacation, bereavement, etc.). Single-approval inbox for named reviewers.';

alter table public.pto_requests enable row level security;

drop policy if exists pto_requests_select_own on public.pto_requests;
create policy pto_requests_select_own
  on public.pto_requests
  for select
  to authenticated
  using (user_id = auth.uid());

-- Writes and reviewer reads go through createAdminClient (BYPASSRLS) in /api/pto.
-- No insert/update/delete policies for authenticated keeps direct client writes locked.
