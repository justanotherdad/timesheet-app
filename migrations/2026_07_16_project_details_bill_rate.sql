-- 2026-07-16: Project matrix per-row bill rate (item #7)
--
-- Adds an optional per-row bill rate to the project budget matrix. This rate
-- drives the "Est. budget $" for that activity line (budgeted_hours × bill_rate)
-- and is independent of the per-user `po_bill_rates` used to cost ACTUAL logged
-- timesheet hours.
--
-- Behaviour:
--   * When bill_rate IS NULL, the app falls back to the prior model
--     (bid-sheet effective rate per cell, else the blended per-user bill rate).
--   * When converting from a bid matrix, this column is auto-populated with the
--     cell's bid rate, but remains editable from the matrix Add/Edit row dialog.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f migrations/2026_07_16_project_details_bill_rate.sql
-- Or paste the body into the Supabase SQL editor.

alter table public.project_details
  add column if not exists bill_rate numeric(12, 2);

alter table public.project_details
  drop constraint if exists project_details_bill_rate_nonneg;

alter table public.project_details
  add constraint project_details_bill_rate_nonneg
    check (bill_rate is null or bill_rate >= 0);

comment on column public.project_details.bill_rate is
  'Optional per-row budget bill rate ($/hr). Budget cost for this matrix line = budgeted_hours × bill_rate. NULL = fall back to bid-sheet cell rate, then the blended per-user PO bill rate. Independent of po_bill_rates (which cost actual logged hours).';
