-- Worksite / Property database
-- Tracks all work and photos at each address, independent of homeowner

CREATE TABLE IF NOT EXISTS worksites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  address text NOT NULL,
  city text,
  state text DEFAULT 'FL',
  zip text,
  property_type text DEFAULT 'residential', -- residential, commercial, rental
  notes text
);

CREATE INDEX IF NOT EXISTS idx_worksites_address ON worksites(address);

-- Each visit / job performed at a worksite
CREATE TABLE IF NOT EXISTS worksite_visits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  worksite_id uuid NOT NULL REFERENCES worksites(id) ON DELETE CASCADE,
  visit_date date NOT NULL DEFAULT current_date,
  service_type text,           -- Gas Line, Appliance Install, Repair, Inspection, etc.
  work_performed text,         -- detailed description of work done
  technician text,
  customer_name text,          -- who was present / homeowner at time of visit
  customer_phone text,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_worksite_visits_worksite ON worksite_visits(worksite_id);
CREATE INDEX IF NOT EXISTS idx_worksite_visits_date ON worksite_visits(visit_date DESC);

-- Photos taken at a worksite (stored in worksite-photos storage bucket)
CREATE TABLE IF NOT EXISTS worksite_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  worksite_id uuid NOT NULL REFERENCES worksites(id) ON DELETE CASCADE,
  visit_id uuid REFERENCES worksite_visits(id) ON DELETE SET NULL,
  file_url text NOT NULL,
  file_path text,
  file_name text,
  caption text,
  photo_type text DEFAULT 'general', -- before, after, install, meter, inspection, general
  size_bytes bigint
);

CREATE INDEX IF NOT EXISTS idx_worksite_photos_worksite ON worksite_photos(worksite_id);
CREATE INDEX IF NOT EXISTS idx_worksite_photos_visit ON worksite_photos(visit_id);
