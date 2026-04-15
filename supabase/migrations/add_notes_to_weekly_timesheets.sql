-- Migration: Add notes column to weekly_timesheets
-- Run this in the Supabase SQL Editor before deploying the app update.
--
-- This adds a free-text notes field that employees can fill in at the bottom
-- of their timesheet (below the Unbillable Time section).

ALTER TABLE weekly_timesheets
  ADD COLUMN IF NOT EXISTS notes TEXT;
