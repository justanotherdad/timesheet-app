-- Migration: extend PO budget container audit to Budget Summary and Notes
-- Run in the Supabase SQL Editor before deploying the app update.
--
-- Adds 'budget_summary' and 'notes' to the allowed container values so the
-- budget detail page can show a change history for those two containers too.
-- Budget Summary uses detailed (field-level) descriptions like the other
-- containers; Notes uses a generic "changed" description.

ALTER TABLE po_budget_container_audit
  DROP CONSTRAINT IF EXISTS po_budget_container_audit_container_check;

ALTER TABLE po_budget_container_audit
  ADD CONSTRAINT po_budget_container_audit_container_check
  CHECK (container IN ('invoices', 'expenses', 'bill_rates', 'budget_summary', 'notes'));
