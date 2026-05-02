-- ═══════════════════════════════════════════════════════════════
-- Permit Management System
--   permit_jurisdictions  reference library of local permit offices
--   permits               actual permit records per job
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Jurisdiction reference library ─────────────────────────
CREATE TABLE IF NOT EXISTS permit_jurisdictions (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),

  name                    text NOT NULL,  -- "City of Baton Rouge"
  state                   text,
  county                  text,

  -- Permit office contact
  permit_office_name      text,
  permit_office_phone     text,
  permit_office_email     text,
  permit_office_address   text,

  -- Online resources
  website_url             text,
  application_url         text,
  online_portal_url       text,

  -- Process
  instructions            text,          -- step-by-step how to pull
  required_documents      text[],        -- what to submit
  typical_fee_range       text,          -- "$50–$150"
  typical_processing_days integer,
  inspection_required     boolean DEFAULT true,

  -- Gas-specific
  gas_permit_required     boolean DEFAULT true,
  lp_permit_required      boolean DEFAULT true,

  -- Meta
  notes                   text,
  ai_populated            boolean DEFAULT false,
  last_verified           date
);

CREATE INDEX IF NOT EXISTS idx_jurisdictions_state ON permit_jurisdictions(state);
CREATE INDEX IF NOT EXISTS idx_jurisdictions_name  ON permit_jurisdictions(name);

ALTER TABLE permit_jurisdictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON permit_jurisdictions;
CREATE POLICY "Admin full access" ON permit_jurisdictions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS permit_jurisdictions_updated_at ON permit_jurisdictions;
CREATE TRIGGER permit_jurisdictions_updated_at BEFORE UPDATE ON permit_jurisdictions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 2. Permit records ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permits (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  -- Classification
  permit_number       text,
  permit_type         text DEFAULT 'gas',
  -- gas | lp | hvac | electrical | mechanical | plumbing | other

  description         text,

  -- Location
  job_address         text NOT NULL,
  city                text,
  state               text,

  -- Jurisdiction (reference)
  jurisdiction_id     uuid REFERENCES permit_jurisdictions(id) ON DELETE SET NULL,
  jurisdiction_name   text,  -- denormalized for display without join

  -- Customer / job links
  contact_id          uuid REFERENCES contacts(id) ON DELETE SET NULL,
  customer_name       text,
  invoice_id          uuid REFERENCES invoices(id) ON DELETE SET NULL,

  -- Status lifecycle:
  -- inquiry | not_required | pending_application | applied |
  -- approved | issued | inspection_scheduled | passed | closed
  status              text NOT NULL DEFAULT 'pending_application',

  -- Key dates
  application_date    date,
  approved_date       date,
  issued_date         date,
  expiry_date         date,
  inspection_date     date,
  final_date          date,

  -- Inspector
  inspector_name      text,
  inspector_phone     text,
  inspector_notes     text,

  -- Financials
  permit_fee          numeric(10,2),
  fee_paid            boolean DEFAULT false,

  -- Source tracking
  source              text DEFAULT 'manual',  -- manual | invoice | email
  email_message_id    text,

  notes               text
);

CREATE INDEX IF NOT EXISTS idx_permits_status      ON permits(status);
CREATE INDEX IF NOT EXISTS idx_permits_address     ON permits(job_address);
CREATE INDEX IF NOT EXISTS idx_permits_contact     ON permits(contact_id);
CREATE INDEX IF NOT EXISTS idx_permits_invoice     ON permits(invoice_id);
CREATE INDEX IF NOT EXISTS idx_permits_jurisdiction ON permits(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_permits_email       ON permits(email_message_id);

ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON permits;
CREATE POLICY "Admin full access" ON permits FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS permits_updated_at ON permits;
CREATE TRIGGER permits_updated_at BEFORE UPDATE ON permits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
