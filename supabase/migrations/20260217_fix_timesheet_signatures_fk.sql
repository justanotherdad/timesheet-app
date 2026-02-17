-- Fix timesheet_signatures foreign key to reference weekly_timesheets
-- The error "timesheet_signatures_timesheet_id_fkey" occurs when the FK points to the old 'timesheets' table
-- but the app uses 'weekly_timesheets'. This migration updates the FK to reference weekly_timesheets.

-- Drop the existing foreign key constraint (if it references wrong table)
ALTER TABLE timesheet_signatures 
  DROP CONSTRAINT IF EXISTS timesheet_signatures_timesheet_id_fkey;

-- Add the correct foreign key to weekly_timesheets
ALTER TABLE timesheet_signatures 
  ADD CONSTRAINT timesheet_signatures_timesheet_id_fkey 
  FOREIGN KEY (timesheet_id) REFERENCES weekly_timesheets(id) ON DELETE CASCADE;
