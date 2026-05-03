-- 2026-05-03: Project Budget — By system / By individual tabs
--
-- Adds two nullable columns used by the new tabs on the project budget screen.
-- Both columns are additive and backward-compatible: existing rows stay NULL
-- and the application falls back to auto-computed values where appropriate.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f migrations/2026_05_03_status_pct_and_user_title.sql
-- Or paste the body into the Supabase SQL editor.

-- ----------------------------------------------------------------------------
-- 1. project_details.status_pct
--   Stores a manual per-activity completion percentage as a fraction (0..1).
--   When NULL, the application auto-computes status from actual / budget hrs.
--   Used by the "By system" tab to drive Earned Value (EV) and ETC formulas.
-- ----------------------------------------------------------------------------

alter table public.project_details
  add column if not exists status_pct numeric(5, 4);

alter table public.project_details
  drop constraint if exists project_details_status_pct_range;

alter table public.project_details
  add constraint project_details_status_pct_range
    check (status_pct is null or (status_pct >= 0 and status_pct <= 1));

comment on column public.project_details.status_pct is
  'Manual override of completion percentage for this matrix cell, stored as a fraction (0..1). NULL = auto-compute from actual_hours / budgeted_hours.';

-- ----------------------------------------------------------------------------
-- 2. user_profiles.title
--   Free-text job title shown on the "By individual" budget summary table.
--   Defaults to NULL; admins can fill it in from the user edit screen.
-- ----------------------------------------------------------------------------

alter table public.user_profiles
  add column if not exists title text;

comment on column public.user_profiles.title is
  'Display job title shown alongside the user on project budget By Individual reports. Optional; set by admins.';
