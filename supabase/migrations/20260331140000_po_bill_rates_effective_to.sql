-- Optional end date for bill rate rows: after this date (week ending), the rate does not apply.
-- Used for offboarding without deleting rows (preserves historical labor cost).
ALTER TABLE public.po_bill_rates
  ADD COLUMN IF NOT EXISTS effective_to_date date;

COMMENT ON COLUMN public.po_bill_rates.effective_to_date IS
  'Last day this rate applies (inclusive), compared to timesheet week_ending. NULL = open-ended.';
