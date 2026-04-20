-- ============================================================
-- Bookkeeping Phase 1 migration
--   * chart_of_accounts  — canonical list of accounts/categories
--   * opening_balances   — per-account starting balance for a year
--   * transaction_images — receipt/check photos linked to bank transactions
--   * bank_transactions  — new columns (account_id, check_number, *_image_id)
--   * accounting_entries — new columns (account_id, check_number)
--   * RLS policies + storage bucket instructions
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- CHART OF ACCOUNTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- asset / liability / equity / revenue / expense / distribution
  account_type TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense','distribution')),
  -- Display name (e.g. "Stock Material", "LPBC Operating Account")
  name TEXT NOT NULL UNIQUE,
  -- Optional sub-grouping for report layout ("SALES", "PURCHASES", "OWNER DISTRIBUTIONS", "ASSETS", etc.)
  report_group TEXT,
  -- Lower = sorts higher in reports
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_active ON chart_of_accounts(is_active);

-- ------------------------------------------------------------
-- OPENING BALANCES (one row per account per year)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opening_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  opening_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  UNIQUE(account_id, year)
);

CREATE INDEX IF NOT EXISTS idx_opening_balances_year ON opening_balances(year);

-- ------------------------------------------------------------
-- TRANSACTION IMAGES (receipts + check photos)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- 'receipt' (ties to an expense transaction) or 'check' (ties to a check payment)
  image_type TEXT NOT NULL CHECK (image_type IN ('receipt','check')),
  file_url TEXT NOT NULL,           -- public URL into Supabase storage
  file_path TEXT NOT NULL,          -- path inside the bucket (for deletes)
  file_name TEXT,                   -- original filename (if known)
  mime_type TEXT,
  size_bytes BIGINT,
  -- Check-specific metadata (optional)
  check_number TEXT,
  -- Receipt-specific metadata (optional)
  vendor TEXT,
  amount DECIMAL(12,2),
  receipt_date DATE,
  notes TEXT,
  -- Link to the matched transaction (nullable until matched)
  matched_bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transaction_images_type ON transaction_images(image_type);
CREATE INDEX IF NOT EXISTS idx_transaction_images_matched ON transaction_images(matched_bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_images_check_number ON transaction_images(check_number);

-- ------------------------------------------------------------
-- bank_transactions: new columns
-- ------------------------------------------------------------
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS check_number TEXT;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS receipt_image_id UUID REFERENCES transaction_images(id) ON DELETE SET NULL;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS check_image_id UUID REFERENCES transaction_images(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_check_number ON bank_transactions(check_number);

-- ------------------------------------------------------------
-- accounting_entries: new columns
-- ------------------------------------------------------------
ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS check_number TEXT;

CREATE INDEX IF NOT EXISTS idx_accounting_entries_account ON accounting_entries(account_id);

-- ------------------------------------------------------------
-- updated_at triggers for the new tables
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS chart_of_accounts_updated_at ON chart_of_accounts;
CREATE TRIGGER chart_of_accounts_updated_at BEFORE UPDATE ON chart_of_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS opening_balances_updated_at ON opening_balances;
CREATE TRIGGER opening_balances_updated_at BEFORE UPDATE ON opening_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS transaction_images_updated_at ON transaction_images;
CREATE TRIGGER transaction_images_updated_at BEFORE UPDATE ON transaction_images FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access" ON chart_of_accounts;
CREATE POLICY "Admin full access" ON chart_of_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access" ON opening_balances;
CREATE POLICY "Admin full access" ON opening_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access" ON transaction_images;
CREATE POLICY "Admin full access" ON transaction_images FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- SEED: pre-populate chart of accounts with the Google Sheet categories.
-- Uses ON CONFLICT DO NOTHING so re-running the migration doesn't duplicate.
-- The (name) column is UNIQUE so this is safe.
-- ============================================================
INSERT INTO chart_of_accounts (account_type, name, report_group, sort_order) VALUES
  -- Assets
  ('asset',        'LPBC Operating Account', 'ASSETS',              10),
  ('asset',        'Accounts Payable',      'ASSETS',              20),
  -- Liabilities
  ('liability',    'Loan',                  'LIABILITIES',         30),
  -- Equity
  ('equity',       'Retained Earnings',     'EQUITY',              40),
  -- Revenue
  ('revenue',      'Services Income',       'SALES',               50),
  -- Expenses
  ('expense',      'Stock Material',        'PURCHASES',           60),
  ('expense',      'Business Operating',    'PURCHASES',           70),
  ('expense',      'Permits',               'PURCHASES',           80),
  ('expense',      'Rental Services',       'PURCHASES',           90),
  ('expense',      'Utilities',             'PURCHASES',          100),
  ('expense',      'Office Supplies',       'PURCHASES',          110),
  ('expense',      'Banking Fees',          'PURCHASES',          120),
  ('expense',      'Taxes',                 'PURCHASES',          130),
  ('expense',      'Insurance',             'PURCHASES',          140),
  ('expense',      'Licenses',              'PURCHASES',          150),
  ('expense',      'Continuing Education',  'PURCHASES',          160),
  ('expense',      'Marketing/Advertising', 'PURCHASES',          170),
  ('expense',      'Subcontract Labor',     'PURCHASES',          180),
  -- Owner distributions
  ('distribution', 'Personal Expense',      'OWNER DISTRIBUTIONS', 190),
  ('distribution', 'Disbursement',          'OWNER DISTRIBUTIONS', 200)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SUPABASE STORAGE BUCKET for receipts and checks
--   After running this migration, create a bucket manually in the
--   Supabase dashboard:
--     Storage → New bucket
--     Name:   bookkeeping-images
--     Public: true  (simplest for MVP; swap to signed URLs later if you want)
-- ============================================================
