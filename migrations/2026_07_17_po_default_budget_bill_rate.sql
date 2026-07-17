-- 2026-07-17: Per-PO default budget bill rate (project matrix)
--
-- Adds an optional, PER-PURCHASE-ORDER default bill rate used only to estimate
-- the budget $ for project-matrix rows that have NO explicit per-row bill_rate.
--
-- Scope / isolation:
--   * The value lives on the purchase_orders row itself, so it is scoped to a
--     single PO. Setting it on one PO can never affect any other PO.
--   * NULL (the default for every existing and future PO) means "behave exactly
--     as before" — fall back to the bid-sheet cell rate, then the blended team
--     rate. So this migration changes nothing until a value is explicitly set on
--     a given PO.
--
-- Rate precedence for a matrix row's budget $ estimate becomes:
--   1. project_details.bill_rate            (explicit per-row: typed or bid-imported)
--   2. bid-sheet effective rate for the cell (legacy rows without an explicit rate)
--   3. purchase_orders.default_budget_bill_rate  (this column — PO default)
--   4. blended average of the team's per-user po_bill_rates
--
-- Only affects the budget ESTIMATE. Actual $ still uses each person's real
-- per-user timesheet rate.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

alter table public.purchase_orders
  add column if not exists default_budget_bill_rate numeric(12, 2);

alter table public.purchase_orders
  drop constraint if exists purchase_orders_default_budget_bill_rate_nonneg;

alter table public.purchase_orders
  add constraint purchase_orders_default_budget_bill_rate_nonneg
    check (default_budget_bill_rate is null or default_budget_bill_rate >= 0);

comment on column public.purchase_orders.default_budget_bill_rate is
  'Optional per-PO default bill rate ($/hr) for project-matrix budget $ estimates. Used only for rows with no explicit project_details.bill_rate and no bid-sheet cell rate, in place of the blended team rate. NULL = fall back to blended rate (prior behaviour). Scoped to this PO only.';
