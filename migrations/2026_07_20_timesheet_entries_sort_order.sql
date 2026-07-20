-- 2026-07-20: Persist billable row order on timesheets
--
-- Adds an explicit sort_order to timesheet_entries so the order the user arranges
-- billable rows in (via the up/down arrows on the New/Edit timesheet form) is
-- preserved everywhere the timesheet is rendered: the form, the detail view, the
-- PDF/print export, and admin exports.
--
-- Previously row order relied on created_at, which is unreliable because the app
-- saves entries with a single bulk INSERT (rows can share the same created_at).
--
-- Existing rows are backfilled per timesheet using their current created_at order
-- so nothing visibly reorders on first load after this migration.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f migrations/2026_07_20_timesheet_entries_sort_order.sql
-- Or paste the body into the Supabase SQL editor.

alter table public.timesheet_entries
  add column if not exists sort_order integer;

-- Backfill: sequential order (0-based) within each timesheet by created_at.
update public.timesheet_entries te
set sort_order = sub.rn
from (
  select id,
         row_number() over (partition by timesheet_id order by created_at, id) - 1 as rn
  from public.timesheet_entries
) sub
where te.id = sub.id
  and te.sort_order is null;

comment on column public.timesheet_entries.sort_order is
  'Display order of billable rows within a timesheet (0-based). Set from the New/Edit timesheet form; read ordering uses sort_order then created_at as a tiebreaker.';
