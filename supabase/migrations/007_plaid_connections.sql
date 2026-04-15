-- Plaid bank connections table
CREATE TABLE IF NOT EXISTS plaid_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  institution_name TEXT NOT NULL,
  institution_id TEXT,
  access_token TEXT NOT NULL,
  item_id TEXT NOT NULL UNIQUE,
  cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add plaid_transaction_id to bank_transactions for dedup
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT UNIQUE;
