-- Migration: Employee ID on user profiles
-- Run in the Supabase SQL Editor before deploying the app update.
--
-- Optional free-text payroll/HR employee identifier shown on the user profile
-- and emitted in the payroll export. Not enforced unique.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS employee_id TEXT;
