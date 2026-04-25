-- Email scan log: tracks which Gmail messages have been processed
-- Prevents duplicate imports across scan runs

CREATE TABLE IF NOT EXISTS email_scan_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  gmail_message_id text UNIQUE NOT NULL,
  gmail_thread_id text,
  from_email text,
  subject text,
  email_date date,
  attachment_count int DEFAULT 0,
  imported_count int DEFAULT 0,
  status text DEFAULT 'processed',  -- processed | skipped | failed
  error_message text,
  transaction_image_ids uuid[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_email_scan_log_created ON email_scan_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_scan_log_message ON email_scan_log(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_email_scan_log_status ON email_scan_log(status);

ALTER TABLE email_scan_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON email_scan_log;
CREATE POLICY "Admin full access" ON email_scan_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
