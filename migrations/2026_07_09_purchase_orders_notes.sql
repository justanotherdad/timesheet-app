-- 2026-07-09: purchase_orders.notes
--
-- Free-form notes for a budget / purchase order. Surfaced as an editable
-- "Notes" container on the Budget Detail view. Distinct from
-- prior_period_notes (which only annotates the prior-period figures) — this
-- column is a general-purpose scratchpad for the whole budget.
--
-- The column is nullable and additive; existing rows default to NULL (no notes).
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f migrations/2026_07_09_purchase_orders_notes.sql
-- Or paste the body into the Supabase SQL editor.

alter table public.purchase_orders
  add column if not exists notes text;

comment on column public.purchase_orders.notes is
  'Free-form budget notes shown in the Budget Detail "Notes" container. NULL = no notes.';
