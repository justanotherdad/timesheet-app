-- 2026-08-15: Distinguish Budget Status vs Timesheet generated reports.
--
-- Timesheet reports are stored in the same generated_reports table (frozen
-- snapshot, 1-year expiry) but have no PO list. report_type lets the
-- repository filter and apply the correct access rule.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run.

alter table public.generated_reports
  add column if not exists report_type text not null default 'budget_status';

update public.generated_reports
  set report_type = 'budget_status'
  where report_type is null or report_type = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'generated_reports_report_type_check'
  ) then
    alter table public.generated_reports
      add constraint generated_reports_report_type_check
      check (report_type in ('budget_status', 'timesheet'));
  end if;
end $$;

create index if not exists generated_reports_report_type_idx
  on public.generated_reports (report_type);

comment on column public.generated_reports.report_type is
  'budget_status (PO budget snapshot) or timesheet (employee × week status snapshot).';
