-- 2026-10-15: Client-acknowledged flag on a PTO request.
--
-- The New request form no longer collects employee notes. It records whether
-- the employee checked the client-acknowledged box. The checkbox label and
-- info-popup text live in company_settings and do not need a schema change.
-- Existing notes on older requests are left in place.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

alter table public.pto_requests
  add column if not exists client_acknowledged boolean not null default false;

comment on column public.pto_requests.client_acknowledged is
  'True when the employee checked the client-acknowledged box on the request.';
