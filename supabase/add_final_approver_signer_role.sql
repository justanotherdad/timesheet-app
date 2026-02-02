-- Add 'final_approver' to timesheet_signatures.signer_role
-- Run this in Supabase SQL Editor if inserts with signer_role = 'final_approver' fail.

-- If signer_role is a CHECK constraint, drop and re-add:
-- ALTER TABLE timesheet_signatures DROP CONSTRAINT IF EXISTS timesheet_signatures_signer_role_check;
-- ALTER TABLE timesheet_signatures ADD CONSTRAINT timesheet_signatures_signer_role_check CHECK (signer_role IN ('supervisor', 'manager', 'final_approver'));

-- If signer_role is a custom enum type (e.g. signer_role_enum):
-- ALTER TYPE signer_role_enum ADD VALUE IF NOT EXISTS 'final_approver';

-- If signer_role is plain text with no constraint, no change needed.

-- Check current column type:
-- SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'timesheet_signatures' AND column_name = 'signer_role';
