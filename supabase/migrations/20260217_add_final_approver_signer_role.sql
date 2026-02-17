-- Fix timesheet_signatures signer_role check constraint to allow 'final_approver'
-- The error "timesheet_signatures_signer_role_check" occurs when the final approver tries to approve
-- because the constraint only allowed 'supervisor' and 'manager'.

-- Drop the existing check constraint
ALTER TABLE timesheet_signatures 
  DROP CONSTRAINT IF EXISTS timesheet_signatures_signer_role_check;

-- Add the updated constraint including 'final_approver'
ALTER TABLE timesheet_signatures 
  ADD CONSTRAINT timesheet_signatures_signer_role_check 
  CHECK (signer_role IN ('supervisor', 'manager', 'final_approver'));
