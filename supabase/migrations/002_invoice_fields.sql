-- Adds the missing invoice fields the admin form has been trying to save.
-- Safe to re-run; uses IF NOT EXISTS where supported.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS job_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_type TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_type TEXT;
