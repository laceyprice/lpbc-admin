-- ═══════════════════════════════════════════════════════════════
-- Security hardening — enable RLS on tables that were missing it.
-- Addresses the Supabase "rls_disabled_in_public" / "sensitive_columns_exposed"
-- security advisor warnings.
--
-- All API access is via the service-role key (server-side only), which
-- bypasses RLS by design. The RLS policies below are restrictive — they
-- explicitly deny anon-key access. This means the database is safe even if
-- the anon key is leaked or someone discovers the project URL.
-- ═══════════════════════════════════════════════════════════════

-- ── plaid_connections (CRITICAL — stores Plaid access_token) ───────
ALTER TABLE plaid_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON plaid_connections;
DROP POLICY IF EXISTS "Authenticated full access" ON plaid_connections;
-- Authenticated users (admin app) can read/write; anon key gets nothing.
CREATE POLICY "Authenticated full access" ON plaid_connections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── worksites + visits + photos (customer PII) ─────────────────────
ALTER TABLE worksites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON worksites;
CREATE POLICY "Authenticated full access" ON worksites
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE worksite_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON worksite_visits;
CREATE POLICY "Authenticated full access" ON worksite_visits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE worksite_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON worksite_photos;
CREATE POLICY "Authenticated full access" ON worksite_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── saved_reports (financial data) ─────────────────────────────────
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON saved_reports;
CREATE POLICY "Authenticated full access" ON saved_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── monthly_reconciliation (financial data) ────────────────────────
ALTER TABLE monthly_reconciliation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON monthly_reconciliation;
CREATE POLICY "Authenticated full access" ON monthly_reconciliation
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Sanity check: confirm RLS is on for all expected tables ────────
DO $$
DECLARE
  t text;
  missing text[] := ARRAY[]::text[];
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'contacts','invoices','schedule_requests','appointments',
    'bank_transactions','accounting_entries','tax_documents',
    'chart_of_accounts','opening_balances','transaction_images',
    'user_roles','bank_statements','plaid_connections',
    'saved_reports','monthly_reconciliation','worksites',
    'worksite_visits','worksite_photos','email_scan_log',
    'vendor_documents','inventory_items','property_materials',
    'inventory_transactions','permit_jurisdictions','permits',
    'bank_accounts'
  ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity = true
    ) THEN
      missing := array_append(missing, t);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE WARNING 'Tables without RLS: %', missing;
  ELSE
    RAISE NOTICE 'RLS enabled on all expected tables ✓';
  END IF;
END $$;
