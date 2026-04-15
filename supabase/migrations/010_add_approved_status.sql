-- Add 'approved' to the invoice_status check constraint
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_status_check
  CHECK (invoice_status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'approved'));
