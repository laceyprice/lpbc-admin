CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  report_label TEXT NOT NULL,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  report_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
