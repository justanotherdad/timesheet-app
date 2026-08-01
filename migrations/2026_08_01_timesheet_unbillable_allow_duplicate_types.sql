-- 2026-08-01: Allow multiple non-billable rows of the same type per timesheet
--
-- Background:
--   timesheet_unbillable.description stores the row TYPE (HOLIDAY / INTERNAL / PTO).
--   Free-text detail lives in notes. The UI supports "+ Add Row" for a second
--   INTERNAL (etc.) activity, but UNIQUE(timesheet_id, description) rejected that
--   with: duplicate key value violates unique constraint
--   "timesheet_unbillable_timesheet_id_description_key".
--
-- This migration drops that uniqueness only. It does not change RLS, grants,
-- or who can read/write rows — access remains gated by existing policies on
-- timesheet_unbillable / weekly_timesheets.
--
-- App impact:
--   Save path already delete-all + insert-all for a timesheet (no upsert on
--   description). Payroll/hour totals already iterate/sum multiple rows.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Drop UNIQUE constraint (and its backing index), if present
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'timesheet_unbillable'
      and con.conname = 'timesheet_unbillable_timesheet_id_description_key'
  ) then
    alter table public.timesheet_unbillable
      drop constraint timesheet_unbillable_timesheet_id_description_key;
  end if;
end $$;

-- If it was created as a unique INDEX (not a table CONSTRAINT), drop that too.
drop index if exists public.timesheet_unbillable_timesheet_id_description_key;

-- ---------------------------------------------------------------------------
-- 2. Keep lookups by timesheet_id fast (the dropped unique index covered this)
-- ---------------------------------------------------------------------------
create index if not exists timesheet_unbillable_timesheet_id_idx
  on public.timesheet_unbillable (timesheet_id);
