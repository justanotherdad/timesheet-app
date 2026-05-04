-- 2026-05-04: purchase_orders.archived_at
--
-- Records when a PO was archived (i.e. when active was flipped from true
-- to false). Lets the Budget Detail "Show archived POs" view display the
-- archive date on each row and lets users sort by archive recency.
--
-- The column is nullable (NULL = currently active, never archived) and
-- additive — existing archived rows keep archived_at = NULL until they're
-- reactivated and re-archived. No backfill (we don't have a reliable
-- timestamp for prior archive events).
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f migrations/2026_05_04_purchase_orders_archived_at.sql
-- Or paste the body into the Supabase SQL editor.

alter table public.purchase_orders
  add column if not exists archived_at timestamptz;

create index if not exists purchase_orders_archived_at_idx
  on public.purchase_orders(archived_at);

comment on column public.purchase_orders.archived_at is
  'Timestamp captured when active flipped from true to false. NULL while active or for legacy archived rows that pre-date this column.';
