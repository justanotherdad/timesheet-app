-- Add site_id and department_id to user_profiles table
-- This allows employees to be assigned to a specific site and department

-- Add site_id to user_profiles (required for employees)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

-- Add department_id to user_profiles (optional - employees can be assigned to a department)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_site_id ON user_profiles(site_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department_id ON user_profiles(department_id);
