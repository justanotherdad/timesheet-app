-- Add system_name column to timesheet_entries for custom system values
-- This allows users to type custom system names without creating new system records

ALTER TABLE timesheet_entries
ADD COLUMN IF NOT EXISTS system_name TEXT;

-- Add index for better query performance (optional)
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_system_name ON timesheet_entries(system_name) WHERE system_name IS NOT NULL;
