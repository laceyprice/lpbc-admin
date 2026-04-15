-- Add city, state, zip, company_name, and source columns to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Migrate existing company data to company_name if company column exists
UPDATE contacts SET company_name = company WHERE company IS NOT NULL AND (company_name IS NULL OR company_name = '');
