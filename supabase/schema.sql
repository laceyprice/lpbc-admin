-- ============================================================
-- THE GASOLOGIST — Supabase Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CONTACTS (CRM)
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  company TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(last_name, first_name);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_type TEXT NOT NULL DEFAULT 'invoice' CHECK (invoice_type IN ('invoice', 'quote')),
  invoice_status TEXT NOT NULL DEFAULT 'draft' CHECK (invoice_status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  job_address TEXT,
  service_type TEXT,
  service_date DATE,
  payment_type TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  service_description TEXT,
  line_items JSONB,
  amount_due DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  due_date DATE,
  notes TEXT,
  stripe_payment_link TEXT,
  stripe_session_id TEXT,
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(invoice_status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_name);
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id);

-- ============================================================
-- SCHEDULE REQUESTS (public form submissions)
-- ============================================================
CREATE TABLE IF NOT EXISTS schedule_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  jobsite_address TEXT NOT NULL,
  service_type TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  notes TEXT,
  is_owner BOOLEAN DEFAULT TRUE,
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  company_name TEXT,
  is_company_owner BOOLEAN DEFAULT TRUE,
  billing_address TEXT,
  billing_phone TEXT,
  billing_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'declined'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_requests_status ON schedule_requests(status);
CREATE INDEX IF NOT EXISTS idx_schedule_requests_created ON schedule_requests(created_at DESC);

-- ============================================================
-- APPOINTMENTS (Calendar)
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  service_address TEXT,
  service_type TEXT,
  notes TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  schedule_request_id UUID REFERENCES schedule_requests(id) ON DELETE SET NULL,
  google_calendar_event_id TEXT,
  reminder_24_sent BOOLEAN DEFAULT FALSE,
  reminder_12_sent BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_reminders ON appointments(start_time) WHERE reminder_24_sent = FALSE OR reminder_12_sent = FALSE;

-- ============================================================
-- BANK TRANSACTIONS (Bookkeeping)
-- ============================================================
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payee TEXT,
  category TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  UNIQUE(transaction_date, description, amount)
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_category ON bank_transactions(category);

-- ============================================================
-- ACCOUNTING ENTRIES (synced from bank, categorized)
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payee TEXT,
  category TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_accounting_entries_date ON accounting_entries(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_category ON accounting_entries(category);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_bank_tx ON accounting_entries(bank_transaction_id);

-- ============================================================
-- TAX DOCUMENTS (W-9 / 1099)
-- ============================================================
CREATE TABLE IF NOT EXISTS tax_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  vendor_name TEXT NOT NULL,
  vendor_email TEXT,
  vendor_phone TEXT,
  vendor_address TEXT,
  ein_ssn TEXT,
  document_type TEXT NOT NULL DEFAULT 'w9' CHECK (document_type IN ('w9', '1099-nec', '1099-misc')),
  tax_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  amount_paid DECIMAL(12,2),
  file_url TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending_w9' CHECK (status IN ('pending_w9', 'w9_received', '1099_generated', '1099_filed')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_tax_documents_year ON tax_documents(tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_documents_status ON tax_documents(status);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update updated_at)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tax_documents_updated_at BEFORE UPDATE ON tax_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- All tables: only the service role (backend) can read/write.
-- Public users have NO access to any table directly.
-- ============================================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_documents ENABLE ROW LEVEL SECURITY;

-- Allow authenticated admin users (Supabase Auth) full access
CREATE POLICY "Admin full access" ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access" ON schedule_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access" ON appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access" ON bank_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access" ON accounting_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access" ON tax_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon INSERT on schedule_requests (public contact form)
CREATE POLICY "Public can submit schedule requests" ON schedule_requests FOR INSERT TO anon WITH CHECK (true);

-- ============================================================
-- SUPABASE STORAGE BUCKET for tax documents
-- Create this in Storage → New Bucket in the Supabase dashboard
-- Bucket name: tax-documents
-- Public: true (or configure signed URLs for private access)
-- ============================================================

-- ============================================================
-- SAMPLE ADMIN USER CREATION
-- After running this schema, create your admin user at:
-- Supabase Dashboard → Authentication → Users → Add User
-- Email: office@thegasologist.com
-- Set a strong password
-- ============================================================
