-- Add company_name and jobsite_city columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS jobsite_city TEXT;
