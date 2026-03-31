-- Timesheet Confirmations: per-approval-cycle receipts for assigned users.
-- Run in Supabase SQL Editor or via supabase db push.

ALTER TABLE weekly_timesheets
  ADD COLUMN IF NOT EXISTS approval_confirmation_sequence integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS timesheet_confirmation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES weekly_timesheets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  approval_sequence integer NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (timesheet_id, user_id, approval_sequence)
);

CREATE INDEX IF NOT EXISTS idx_tcr_user_id ON timesheet_confirmation_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_tcr_timesheet_id ON timesheet_confirmation_receipts(timesheet_id);

COMMENT ON COLUMN weekly_timesheets.approval_confirmation_sequence IS 'Incremented each time status becomes approved; receipts reference this sequence.';
