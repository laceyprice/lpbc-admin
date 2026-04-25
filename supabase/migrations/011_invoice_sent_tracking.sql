-- Track when invoices are sent/resent
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

-- Backfill: any invoice already in 'sent' or 'paid' status was sent at some point
UPDATE invoices SET sent_at = created_at, last_sent_at = created_at
WHERE invoice_status IN ('sent', 'paid') AND sent_at IS NULL;
