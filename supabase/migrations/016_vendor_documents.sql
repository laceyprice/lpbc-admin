-- Vendor compliance documents: W9s, Certificates of Insurance, contracts, etc.
-- Populated manually or auto-imported from email scanner.

CREATE TABLE IF NOT EXISTS vendor_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Document classification
  doc_type text NOT NULL DEFAULT 'other',
  -- w9 | coi | contract | license | other

  -- Vendor / contractor info
  vendor_name text,
  vendor_email text,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,

  -- File
  file_url text NOT NULL,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,

  -- Dates
  issued_date date,
  expiry_date date,     -- especially important for COIs

  -- COI-specific
  insurance_company text,
  policy_number text,
  coverage_amount numeric(12,2),

  -- W9-specific
  tax_year integer,
  ein_ssn text,         -- last 4 only or redacted

  -- Source and status
  source text DEFAULT 'manual',   -- manual | email
  email_message_id text,          -- links back to email_scan_log
  status text DEFAULT 'active',   -- active | expired | archived
  notes text
);

CREATE INDEX IF NOT EXISTS idx_vendor_docs_type ON vendor_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_vendor_docs_contact ON vendor_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_vendor_docs_expiry ON vendor_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_vendor_docs_email ON vendor_documents(email_message_id);

ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON vendor_documents;
CREATE POLICY "Admin full access" ON vendor_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
DROP TRIGGER IF EXISTS vendor_documents_updated_at ON vendor_documents;
CREATE TRIGGER vendor_documents_updated_at BEFORE UPDATE ON vendor_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
