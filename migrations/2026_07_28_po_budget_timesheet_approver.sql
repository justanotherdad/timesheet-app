-- 2026-07-28: Opt-in timesheet approver flag on PO budget access
--
-- Grant Access remains budget visibility only. Admins may check
-- "Timesheet approver" so that person joins a parallel pre-stage before the
-- employee's normal profile approval chain. Default is FALSE so existing
-- grants do not suddenly become approvers.
--
-- Also widens timesheet_signatures.signer_role (if a check constraint exists)
-- to allow 'budget_approver'.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.po_budget_access
  add column if not exists timesheet_approver boolean not null default false;

comment on column public.po_budget_access.timesheet_approver is
  'When true, this granted user is a required parallel timesheet approver for the PO (hours > 0), before the employee profile chain. Defaults false (opt-in).';

-- Expand signer_role check constraint if present (name may vary).
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
      check (signer_role in ('budget_approver', 'supervisor', 'manager', 'final_approver'));
  end if;
end $$;
