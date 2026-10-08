-- Private labor profitability report.
-- Not part of generated_reports (admins can open every row there).
-- Access is enforced in the API via the service-role client.
-- RLS is on with no policies so anon/authenticated clients cannot read these tables.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

create table if not exists public.labor_report_settings (
  id integer primary key default 1 check (id = 1),
  path_segment text not null default 'rv',
  w2_overhead numeric(7, 4) not null default 0.25 check (w2_overhead >= 0 and w2_overhead <= 2)
);

insert into public.labor_report_settings (id, path_segment)
values (1, 'rv')
on conflict (id) do nothing;

create table if not exists public.labor_report_access (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  is_owner boolean not null default false,
  granted_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Seed the owner only when there is exactly one super admin.
insert into public.labor_report_access (user_id, is_owner)
select id, true
from public.user_profiles
where role = 'super_admin'
  and (select count(*) from public.user_profiles where role = 'super_admin') = 1
on conflict (user_id) do nothing;

create table if not exists public.labor_pay_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  classification text not null check (classification in ('w2', '1099')),
  amount numeric(15, 4) not null check (amount >= 0),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labor_pay_rates_range check (effective_to is null or effective_to >= effective_from)
);

create index if not exists labor_pay_rates_user_idx
  on public.labor_pay_rates (user_id, effective_from);

create table if not exists public.labor_profit_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 year'),
  snapshot jsonb not null
);

create index if not exists labor_profit_reports_created_at_idx
  on public.labor_profit_reports (created_at desc);
create index if not exists labor_profit_reports_expires_at_idx
  on public.labor_profit_reports (expires_at);

alter table public.labor_report_settings enable row level security;
alter table public.labor_report_access enable row level security;
alter table public.labor_pay_rates enable row level security;
alter table public.labor_profit_reports enable row level security;

comment on table public.labor_report_settings is
  'Single row: unlisted path segment for the labor profitability page. Default rv.';
comment on table public.labor_report_access is
  'Who may open the labor profitability page. is_owner may grant access and change the address. Super admin role alone is not enough.';
comment on table public.labor_pay_rates is
  'W2 or 1099 pay rates with a start date and optional end date. Reports look these up; they are not stored on the user profile.';
comment on table public.labor_profit_reports is
  'Saved labor profitability snapshots. Hours and bill rates are frozen. Pay is read from labor_pay_rates when opened. Kept 1 year.';

-- Existing databases created amount as numeric(12, 2). Widen it so a rate can keep four decimal places.
alter table public.labor_pay_rates
  alter column amount type numeric(15, 4);

-- 0.25 means 25% added to each W2 pay rate. 1099 rates do not use it.
alter table public.labor_report_settings
  add column if not exists w2_overhead numeric(7, 4) not null default 0.25;

alter table public.labor_report_settings
  drop constraint if exists labor_report_settings_w2_overhead_check;

alter table public.labor_report_settings
  add constraint labor_report_settings_w2_overhead_check check (w2_overhead >= 0 and w2_overhead <= 2);
