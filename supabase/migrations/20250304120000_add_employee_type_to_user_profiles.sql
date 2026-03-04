-- Add employee_type column to user_profiles table
-- Values: 'internal' or 'external', defaulting to 'internal'

ALTER TABLE user_profiles
ADD COLUMN employee_type text NOT NULL DEFAULT 'internal' CHECK (employee_type IN ('internal', 'external'));

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.employee_type IS 'Employee classification: internal or external';
