-- 2026-07-24: Generated Budget Status Reports repository.
--
-- Stores point-in-time budget status reports produced by the "Generate Report"
-- wizard on the Reports screen. Each row holds a frozen SNAPSHOT (jsonb) of the
-- computed numbers so the report always reflects the figures at generation time,
-- even as budgets change later. Reports are retained for 1 year (expires_at);
-- expired rows are purged when the repository list is loaded.
--
-- Access model (enforced in the API, like the rest of the budget routes, via the
-- service-role client): a viewer can see a report only if they are an
-- admin/super_admin OR have po_budget_access to EVERY PO in the report (po_ids).
-- Search columns (po_numbers / project_names / client_names) let the repository
-- filter by PO number, project name, or client.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

create table if not exists public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 year'),
  include_hours boolean not null default true,
  -- Access + search denormalized from the snapshot for cheap filtering.
  po_ids uuid[] not null default '{}',
  po_numbers text[] not null default '{}',
  project_names text[] not null default '{}',
  client_names text[] not null default '{}',
  -- Full frozen report used to render the on-screen view / PDF.
  snapshot jsonb not null
);

create index if not exists generated_reports_created_at_idx
  on public.generated_reports (created_at desc);
create index if not exists generated_reports_expires_at_idx
  on public.generated_reports (expires_at);
create index if not exists generated_reports_po_ids_idx
  on public.generated_reports using gin (po_ids);

comment on table public.generated_reports is
  'Point-in-time budget status reports from the Reports "Generate Report" wizard. snapshot holds frozen figures; retained 1 year (expires_at). Access: admins or users with po_budget_access to all po_ids.';

-- Writes/reads go through the service-role client (BYPASSRLS); enabling RLS with
-- no policies keeps the table locked to anon/authenticated direct access,
-- matching po_indirect_budget / po_expenses handling.
alter table public.generated_reports enable row level security;
