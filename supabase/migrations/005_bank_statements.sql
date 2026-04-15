-- Bank Statements table for uploaded PDF statements
CREATE TABLE IF NOT EXISTS bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  label TEXT,
  statement_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_statements_all" ON bank_statements FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket (run in Supabase dashboard if this doesn't work via SQL)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('bank-statements', 'bank-statements', true)
-- ON CONFLICT DO NOTHING;
