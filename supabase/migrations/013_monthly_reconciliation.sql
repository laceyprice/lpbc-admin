-- Monthly reconciliation status tracking
-- Stores human-verified reconciliation status per calendar month

CREATE TABLE IF NOT EXISTS monthly_reconciliation (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month varchar(7) NOT NULL UNIQUE,  -- 'YYYY-MM' format
  status varchar(20) NOT NULL DEFAULT 'auto_reconciled',  -- 'not_reconciled' | 'auto_reconciled' | 'verified'
  notes text,
  verified_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups by month
CREATE INDEX IF NOT EXISTS idx_monthly_reconciliation_month ON monthly_reconciliation(month);
