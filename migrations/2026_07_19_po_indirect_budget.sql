-- 2026-07-19: Manual BUDGET indirect lines for the project matrix.
--
-- Background: the project matrix "Add indirect cost (Expense)" button used to
-- write a po_expenses row, which counts as an ACTUAL incurred cost (it reduces
-- budget balance and shows in the matrix Actual column). That's wrong for
-- building the budget — adding an indirect line in the matrix is meant to build
-- the overall BUDGET (like a bid sheet), not record a real expense.
--
-- This table stores those manual budget indirect lines. They:
--   * appear in the matrix indirect section's BUDGET column,
--   * do NOT reduce budget balance (they are projections, not spend),
--   * are merged by label (case-insensitive) with real po_expenses so a budget
--     line and its matching actual expense show as one row (Budget vs Actual).
--
-- Actual indirect spend is still entered in the Budget screen's Expense
-- container (po_expenses) — that reduces balance and populates the Actual column.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

create table if not exists public.po_indirect_budget (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  label text not null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists po_indirect_budget_po_id_idx
  on public.po_indirect_budget (po_id);

comment on table public.po_indirect_budget is
  'Manual BUDGET indirect lines for a project PO matrix (projections, like a bid sheet). Shown in the matrix indirect Budget column and merged by label with po_expenses (actual). Does NOT affect budget balance.';

-- Writes go through the service-role client (BYPASSRLS); enabling RLS with no
-- policies keeps the table locked to anon/authenticated direct access, matching
-- po_expenses handling.
alter table public.po_indirect_budget enable row level security;
