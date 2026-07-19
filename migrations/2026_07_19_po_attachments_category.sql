-- 2026-07-19: Categorize PO attachments so Notes-tab images/files are separate
-- from the existing PO / Proposal document attachments.
--
-- The Budget Detail "Notes" container is becoming a two-tab section: a typed
-- notes tab (unchanged, purchase_orders.notes) and a new "Images / Files" tab
-- for pasted or uploaded images + PDFs that render inline. Those note files are
-- stored in the SAME place as existing attachments (the `site-attachments`
-- Supabase Storage bucket + `po_attachments` table); this column keeps them from
-- showing up in the existing "Attachments" list and vice-versa.
--
-- Values:
--   'attachment' (default / legacy NULL) — the existing PO / Proposal docs list.
--   'note_image'                          — files shown in the Notes image tab.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

alter table public.po_attachments
  add column if not exists category text not null default 'attachment';

alter table public.po_attachments
  drop constraint if exists po_attachments_category_check;

alter table public.po_attachments
  add constraint po_attachments_category_check
    check (category in ('attachment', 'note_image'));

comment on column public.po_attachments.category is
  'Which UI surface owns this file: attachment = PO/Proposal documents list; note_image = the Budget Notes "Images / Files" tab. Defaults to attachment so existing rows are unchanged.';
