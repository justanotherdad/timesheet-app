-- 2026-11-03: Comp time bank and use requests.
--
-- Internal employees bank or use comp against a Sunday week ending.
-- Hours enter the bank only after a Bank is approved, an admin adds them,
-- or an approved Use is cancelled. Pending Use hours are held.
-- Named reviewers and admins approve, deny, and cancel. Employees cannot cancel.
--
-- Writes go through the service-role client. Idempotent.

create table if not exists public.comp_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  kind text not null,
  week_ending date not null,
  hours numeric(8, 2) not null,
  client_acknowledged boolean not null default false,
  status text not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by_id uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_note text,
  cancelled_at timestamptz,
  cancelled_by_id uuid references public.user_profiles(id) on delete set null,
  decision_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comp_requests_kind_ok check (kind in ('bank', 'use', 'admin_add')),
  constraint comp_requests_hours_ok check (hours > 0),
  constraint comp_requests_status_ok check (status in ('pending', 'approved', 'denied', 'cancelled')),
  constraint comp_requests_sunday_ok check (extract(dow from week_ending) = 0)
);

create index if not exists comp_requests_user_submitted_idx
  on public.comp_requests (user_id, submitted_at desc);

create index if not exists comp_requests_pending_idx
  on public.comp_requests (submitted_at)
  where status = 'pending';

comment on table public.comp_requests is
  'Comp time bank, use, and admin adjustments. Bank hours count only after approval.';

alter table public.comp_requests enable row level security;

drop policy if exists comp_requests_select_own on public.comp_requests;
create policy comp_requests_select_own
  on public.comp_requests
  for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.comp_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.comp_requests(id) on delete set null,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  actor_id uuid references public.user_profiles(id) on delete set null,
  decision text not null,
  week_ending date not null,
  hours numeric(8, 2) not null,
  kind text not null,
  response text,
  created_at timestamptz not null default now(),
  constraint comp_audit_decision_ok check (decision in ('approved', 'denied', 'added', 'removed', 'cancelled'))
);

create index if not exists comp_audit_created_idx
  on public.comp_audit (created_at desc);

comment on table public.comp_audit is
  'Comp time decisions: approved, denied, added, removed, and cancelled. Submits are not recorded here.';

alter table public.comp_audit enable row level security;
