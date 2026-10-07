-- 2026-10-07: One reviewer note on PTO approve and deny.
--
-- The note is visible to the employee. It is required to deny and optional
-- to approve. Existing denial reasons are copied so older denials still show.
-- New decisions write reviewer_note only.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

alter table public.pto_requests
  add column if not exists reviewer_note text;

update public.pto_requests
set reviewer_note = denial_reason
where reviewer_note is null
  and denial_reason is not null
  and char_length(btrim(denial_reason)) > 0;

comment on column public.pto_requests.reviewer_note is
  'Note from the reviewer, visible to the employee. Required when denied, optional when approved.';
