-- Add invoice_type column to distinguish invoices from reimbursements
-- Defaults to 'invoice' for all existing rows

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'invoice'
  CHECK (invoice_type IN ('invoice', 'reimbursement'));
