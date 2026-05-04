-- 2026-05-04: Project-scoped systems / deliverables / activities
--
-- Bid sheet conversions used to "find or create" rows in the canonical
-- public.systems / public.deliverables / public.activities tables, which
-- meant project-budget items leaked into the global Manage Timesheet
-- Options screen and could silently merge into pre-existing globally-named
-- rows (e.g. a bid sheet "Travel" reusing the global "Travel" activity).
--
-- This migration adds a nullable project_po_id column on each of those
-- three tables so we can mark rows as "owned" by a specific project budget
-- PO. The Manage Timesheet Options screen filters to project_po_id IS NULL
-- so project-scoped rows never appear there. Conversion / sync code paths
-- always insert with project_po_id set, so a project budget gets its own
-- private "Travel" / "Project Management" / etc. that never collides with
-- globals or with other projects.
--
-- ON DELETE CASCADE: when a project PO is deleted (already cascades into
-- project_details), its private systems/deliverables/activities go with it
-- so we don't leak orphan rows into the global lists.
--
-- The columns are nullable and additive — existing rows stay NULL (i.e.
-- global) and the application falls back cleanly. Per user request, this
-- migration does NOT backfill existing data.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f migrations/2026_05_04_project_scoped_options.sql
-- Or paste the body into the Supabase SQL editor.

alter table public.systems
  add column if not exists project_po_id uuid
    references public.purchase_orders(id) on delete cascade;

create index if not exists systems_project_po_id_idx
  on public.systems(project_po_id);

comment on column public.systems.project_po_id is
  'When set, this system row is owned by the referenced project budget PO and is hidden from the global Manage Timesheet Options screen. NULL = global / site-wide row.';

alter table public.deliverables
  add column if not exists project_po_id uuid
    references public.purchase_orders(id) on delete cascade;

create index if not exists deliverables_project_po_id_idx
  on public.deliverables(project_po_id);

comment on column public.deliverables.project_po_id is
  'When set, this deliverable row is owned by the referenced project budget PO and is hidden from the global Manage Timesheet Options screen. NULL = global / site-wide row.';

alter table public.activities
  add column if not exists project_po_id uuid
    references public.purchase_orders(id) on delete cascade;

create index if not exists activities_project_po_id_idx
  on public.activities(project_po_id);

comment on column public.activities.project_po_id is
  'When set, this activity row is owned by the referenced project budget PO and is hidden from the global Manage Timesheet Options screen. NULL = global / site-wide row.';
