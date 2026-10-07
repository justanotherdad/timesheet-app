-- 2026-10-07: Badge on the employee's Request PTO button for new decisions.
--
-- decision_seen_at is set when the employee opens Request PTO. A null value
-- on an approved or denied request means that decision still counts on the
-- badge. Existing decisions are marked seen so only later ones notify.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).

alter table public.pto_requests
  add column if not exists decision_seen_at timestamptz;

update public.pto_requests
set decision_seen_at = coalesce(reviewed_at, updated_at)
where status in ('approved', 'denied')
  and decision_seen_at is null;

comment on column public.pto_requests.decision_seen_at is
  'When the employee opened Request PTO after this approval or denial. Null means it still counts on their Request PTO badge.';

create index if not exists pto_requests_unseen_decision_idx
  on public.pto_requests (user_id)
  where decision_seen_at is null and status in ('approved', 'denied');
