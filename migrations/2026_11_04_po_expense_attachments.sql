-- 2026-11-04: Files attached to an individual additional expense.
--
-- Up to 10 files per po_expenses row (enforced in the API). Bytes live in the
-- existing site-attachments bucket under expense_attachments/{poId}/{expenseId}/.
-- Allowed types: PDF, photos, Word, and Excel.
--
-- Writes go through the service-role client. Idempotent.

create table if not exists public.po_expense_attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.po_expenses(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_type text,
  file_size bigint,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists po_expense_attachments_expense_idx
  on public.po_expense_attachments (expense_id);

create index if not exists po_expense_attachments_po_idx
  on public.po_expense_attachments (po_id);

comment on table public.po_expense_attachments is
  'Files for one additional expense line. At most 10 per expense, 10 MB each. PDF, photo, Word, or Excel.';

alter table public.po_expense_attachments enable row level security;

drop policy if exists po_expense_attachments_select on public.po_expense_attachments;
create policy po_expense_attachments_select
  on public.po_expense_attachments
  for select
  to authenticated
  using (true);
