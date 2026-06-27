-- Migration: Payroll earning-types configuration + audit trail
-- Run in the Supabase SQL Editor before deploying the app update.
--
-- Global (org-wide) configuration that maps each timesheet "earning type" to
-- its payroll DET / DETCODE and the rules used to allocate hours in the
-- payroll export (e.g. Regular up to 40 billable, Incentive over 40 billable).
--
-- Column meanings (mirrors the Payroll tab in Manage Organization):
--   earning_type  free text  e.g. "Regular Hours"
--   det           free text  e.g. "E"
--   detcode       free text  e.g. "REG"
--   area          dropdown   'Billable' | 'Unbillable'  (which area of the timesheet to look in)
--   dropdown      dropdown   'Y' | 'N'  (does the unbillable "Description" field offer this as a dropdown choice)
--   where_value   dropdown   '' | 'PTO' | 'Internal' | 'Holiday'  (which unbillable row the dropdown lives in)
--   overtime      dropdown   'Y' | 'N'  (can these hours push the week over 40 combined)
--   rule          dropdown   '' | 'can''t go over' | 'can go over' | 'up to' | 'over'
--   rule_value    free text/number  the threshold the rule uses (e.g. 40)
--   looks_at      dropdown   '' | 'billable' | 'unbillable' | 'billable & unbillable'
--   sort_order    int        manual ordering fallback

CREATE TABLE IF NOT EXISTS payroll_earning_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  earning_type TEXT NOT NULL,
  det TEXT,
  detcode TEXT,
  area TEXT,
  dropdown TEXT,
  where_value TEXT,
  overtime TEXT,
  rule TEXT,
  rule_value TEXT,
  looks_at TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only audit log; the Payroll tab shows the most recent 5 entries.
CREATE TABLE IF NOT EXISTS payroll_earning_type_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  earning_type_id UUID,
  actor_id UUID NOT NULL,
  actor_name TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_earning_type_audit_created
  ON payroll_earning_type_audit (created_at DESC);

-- Seed the default earning types from the payroll mapping table.
-- Only inserts when the table is empty so re-running is safe.
INSERT INTO payroll_earning_types
  (earning_type, det, detcode, area, dropdown, where_value, overtime, rule, rule_value, looks_at, sort_order)
SELECT * FROM (VALUES
  ('Bereavement',    'E', 'BRVMT', 'Unbillable', 'Y', 'PTO', 'N', 'can''t go over', '40', 'billable & unbillable', 1),
  ('Comp Time Used', 'E', 'COMP',  'Unbillable', 'Y', 'PTO', 'Y', '',               '',   '',                      2),
  ('Holiday',        'E', 'HOL',   'Unbillable', 'N', '',    'Y', '',               '',   '',                      3),
  ('Incentive Time', 'E', 'ICT',   'Billable',   'N', '',    'Y', 'over',           '40', 'billable',              4),
  ('Jury Duty',      'E', 'JURY',  'Unbillable', 'Y', 'PTO', 'N', 'can''t go over', '40', 'billable & unbillable', 5),
  ('Paid Time Off',  'E', 'PTO',   'Unbillable', 'Y', 'PTO', 'N', 'can''t go over', '40', 'billable & unbillable', 6),
  ('Regular Hours',  'E', 'REG',   'Billable',   'N', '',    'Y', 'up to',          '40', 'billable',              7)
) AS seed(earning_type, det, detcode, area, dropdown, where_value, overtime, rule, rule_value, looks_at, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM payroll_earning_types);
