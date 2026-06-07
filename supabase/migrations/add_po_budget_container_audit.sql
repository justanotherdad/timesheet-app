-- Migration: PO budget container audit trail (invoices, expenses, bill rates)
-- Run in the Supabase SQL Editor before deploying the app update.
--
-- Append-only log of saved changes per budget container. Shown on the budget
-- detail page only (last 5 entries per container).

CREATE TABLE IF NOT EXISTS po_budget_container_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  container TEXT NOT NULL CHECK (container IN ('invoices', 'expenses', 'bill_rates')),
  actor_id UUID NOT NULL,
  actor_name TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_budget_container_audit_po_container_created
  ON po_budget_container_audit (po_id, container, created_at DESC);
