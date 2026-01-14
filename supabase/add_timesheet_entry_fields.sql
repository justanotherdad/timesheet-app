-- Migration: Add system_id, deliverable_id, activity_id columns to timesheet_entries table
-- Run this in Supabase SQL Editor

-- Add system_id column (nullable foreign key to systems table)
ALTER TABLE timesheet_entries
ADD COLUMN IF NOT EXISTS system_id UUID REFERENCES systems(id) ON DELETE SET NULL;

-- Add deliverable_id column (nullable foreign key to deliverables table)
ALTER TABLE timesheet_entries
ADD COLUMN IF NOT EXISTS deliverable_id UUID REFERENCES deliverables(id) ON DELETE SET NULL;

-- Add activity_id column (nullable foreign key to activities table)
ALTER TABLE timesheet_entries
ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES activities(id) ON DELETE SET NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_system_id ON timesheet_entries(system_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_deliverable_id ON timesheet_entries(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_activity_id ON timesheet_entries(activity_id);
