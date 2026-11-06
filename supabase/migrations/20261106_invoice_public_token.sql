-- ═══════════════════════════════════════════════════════════════
-- Unguessable customer links for invoices & quotes.
-- New invoices get a random token that must be in the emailed link.
-- Every EXISTING invoice is marked "legacy" so links already sent keep working.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_token text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_link_legacy boolean NOT NULL DEFAULT false;

-- existing rows: give them a token (so admin-generated links work) and flag them legacy (old emails still open)
UPDATE invoices SET public_token = replace(gen_random_uuid()::text, '-', ''), public_link_legacy = true WHERE public_token IS NULL;

-- every new row gets its own random token automatically
ALTER TABLE invoices ALTER COLUMN public_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token ON invoices(public_token);
