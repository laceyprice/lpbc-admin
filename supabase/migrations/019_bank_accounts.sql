-- ═══════════════════════════════════════════════════════════════
-- Bank Accounts — separate tracking of actual bank/card accounts
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bank_accounts (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  name              text NOT NULL,         -- "DPG Business Checking"
  account_type      text DEFAULT 'checking', -- checking | savings | credit_card | loan | other
  institution       text,                  -- "Eglin Federal Credit Union"
  last_four         text,                  -- last 4 digits of account
  is_active         boolean DEFAULT true,
  notes             text
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON bank_accounts(is_active);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON bank_accounts;
CREATE POLICY "Admin full access" ON bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS bank_accounts_updated_at ON bank_accounts;
CREATE TRIGGER bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add bank_account_id to bank_transactions
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_bank_account ON bank_transactions(bank_account_id);

-- Add bank_account_id to accounting_entries as well (for direct entries)
ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_entries_bank_account ON accounting_entries(bank_account_id);
