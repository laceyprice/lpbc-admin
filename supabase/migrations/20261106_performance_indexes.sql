-- ═══════════════════════════════════════════════════════════════
-- Performance indexes for the columns the dashboard, calendar, invoices,
-- CRM and bookkeeping pages filter / sort on. Safe to run any time and as
-- many times as you like: each index is only created if its table AND
-- columns exist, and uses IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.ensure_index(idx text, tbl text, cols text[], expr text) RETURNS void AS $$
DECLARE c text; ok boolean := true;
BEGIN
  IF to_regclass('public.' || tbl) IS NULL THEN RETURN; END IF;
  FOREACH c IN ARRAY cols LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = c) THEN ok := false; END IF;
  END LOOP;
  IF ok THEN EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', idx, tbl, expr); END IF;
END $$ LANGUAGE plpgsql;

-- Invoices: list newest-first, dashboard totals by status / paid date, customer lookups
SELECT pg_temp.ensure_index('idx_invoices_created_at',     'invoices', ARRAY['created_at'],                     'created_at DESC');
SELECT pg_temp.ensure_index('idx_invoices_status_type',    'invoices', ARRAY['invoice_status','invoice_type'],  'invoice_status, invoice_type');
SELECT pg_temp.ensure_index('idx_invoices_paid_at',        'invoices', ARRAY['paid_at'],                        'paid_at');
SELECT pg_temp.ensure_index('idx_invoices_customer_email', 'invoices', ARRAY['customer_email'],                 'customer_email');

-- Calendar: "today" and month views filter appointments by start time
SELECT pg_temp.ensure_index('idx_appointments_start_time', 'appointments', ARRAY['start_time'],                 'start_time');
SELECT pg_temp.ensure_index('idx_appointments_gcal_id',    'appointments', ARRAY['google_calendar_event_id'],   'google_calendar_event_id');

-- CRM: contact de-dupe on invoice save, search
SELECT pg_temp.ensure_index('idx_contacts_email',          'contacts', ARRAY['email'],                          'email');
SELECT pg_temp.ensure_index('idx_contacts_phone',          'contacts', ARRAY['phone'],                          'phone');

-- Schedule requests: pending count in the sidebar (polled every minute) + dashboard list
SELECT pg_temp.ensure_index('idx_schedule_requests_status','schedule_requests', ARRAY['status','created_at'],   'status, created_at DESC');

-- Bookkeeping: transactions are listed / filtered by date
SELECT pg_temp.ensure_index('idx_bank_tx_date',            'bank_transactions', ARRAY['transaction_date'],      'transaction_date DESC');
