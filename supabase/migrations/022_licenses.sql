-- ═══════════════════════════════════════════════════════════════
-- Licenses — track contractor / business licenses with renewal dates.
-- Reuses permit_jurisdictions for the issuing authority (so FL Dept of
-- Agriculture, FL Dept of Business & Pro Reg, etc. can be added as
-- jurisdictions).
-- ═══════════════════════════════════════════════════════════════

-- Tag jurisdictions so we can filter licensing-only authorities in the UI
ALTER TABLE permit_jurisdictions
  ADD COLUMN IF NOT EXISTS agency_type text DEFAULT 'permit';
-- agency_type: permit | license | both

CREATE TABLE IF NOT EXISTS licenses (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  -- Classification
  license_number      text,
  license_type        text DEFAULT 'contractor',
  -- contractor | gas_fitter | lp_dealer | master_plumber | business |
  -- occupational | bonded | insurance | other
  classification      text,         -- e.g. "Class A LP Dealer"
  description         text,

  -- Holder (who/what the license is for)
  holder_name         text NOT NULL,        -- "The Gasologist LLC" or "Daniel Price"
  holder_type         text DEFAULT 'business',  -- business | individual

  -- Issuing authority
  jurisdiction_id     uuid REFERENCES permit_jurisdictions(id) ON DELETE SET NULL,
  jurisdiction_name   text,  -- denormalized for display

  -- Status lifecycle:
  -- pending_application | applied | active | renewal_due |
  -- expired | suspended | revoked | cancelled
  status              text NOT NULL DEFAULT 'active',

  -- Key dates
  application_date    date,
  issue_date          date,
  expiry_date         date,         -- when it must be renewed
  last_renewed_date   date,

  -- Renewal info
  renewal_url         text,         -- direct link to renewal portal
  renewal_period_months integer DEFAULT 12, -- 12 = annual, 24 = biennial, etc.

  -- Financials
  fee                 numeric(10,2),
  fee_paid            boolean DEFAULT false,

  -- Source tracking
  source              text DEFAULT 'manual',  -- manual | email
  email_message_id    text,

  notes               text
);

CREATE INDEX IF NOT EXISTS idx_licenses_status      ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_holder      ON licenses(holder_name);
CREATE INDEX IF NOT EXISTS idx_licenses_expiry      ON licenses(expiry_date);
CREATE INDEX IF NOT EXISTS idx_licenses_jurisdiction ON licenses(jurisdiction_id);

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON licenses;
CREATE POLICY "Authenticated full access" ON licenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS licenses_updated_at ON licenses;
CREATE TRIGGER licenses_updated_at BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Pre-seed FL Department of Agriculture as a licensing jurisdiction ──
INSERT INTO permit_jurisdictions (name, state, agency_type, permit_office_name, website_url, instructions, notes)
SELECT
  'Florida Department of Agriculture & Consumer Services (FDACS)',
  'FL',
  'license',
  'Bureau of LP Gas Inspection',
  'https://www.fdacs.gov/Business-Services/Liquefied-Petroleum-Gas',
  'FDACS regulates LP gas dealers, installers, and qualifiers in Florida. Renew your LP gas license annually via the FDACS online portal. Required for any company installing, servicing, or selling propane gas equipment.',
  'Required for all LP gas work in Florida. Categories include Class 1 (LP gas dealer), Class 4 (LP gas installer), and Class 6 (cylinder exchange).'
WHERE NOT EXISTS (
  SELECT 1 FROM permit_jurisdictions WHERE name ILIKE '%FDACS%' OR name ILIKE '%Florida Department of Agriculture%'
);

-- Also seed FL DBPR (Department of Business & Professional Regulation) — common for plumbing/contractor licenses
INSERT INTO permit_jurisdictions (name, state, agency_type, permit_office_name, website_url, instructions, notes)
SELECT
  'Florida Department of Business & Professional Regulation (DBPR)',
  'FL',
  'license',
  'Construction Industry Licensing Board',
  'https://www.myfloridalicense.com/dbpr/',
  'DBPR licenses contractors statewide. Renew online via myfloridalicense.com. Continuing education hours required for renewal.',
  'Issues plumbing, mechanical, and specialty contractor licenses.'
WHERE NOT EXISTS (
  SELECT 1 FROM permit_jurisdictions WHERE name ILIKE '%DBPR%' OR name ILIKE '%Department of Business%'
);
