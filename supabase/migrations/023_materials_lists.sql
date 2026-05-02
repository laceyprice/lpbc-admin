-- ═══════════════════════════════════════════════════════════════
-- Materials Lists — pre-job planning lists assigned to a worksite.
-- "What we need for this job" vs property_materials which tracks
-- "what we actually used".
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS materials_lists (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  name              text NOT NULL,
  -- Worksite link (denormalized address kept for display when worksite_id is null)
  worksite_id       uuid REFERENCES worksites(id) ON DELETE SET NULL,
  property_address  text,
  customer_name     text,
  contact_id        uuid REFERENCES contacts(id) ON DELETE SET NULL,

  -- Job context
  service_type      text,             -- gas line install, retrofit, repair, etc.
  scheduled_date    date,
  appointment_id    uuid REFERENCES appointments(id) ON DELETE SET NULL,

  -- Lifecycle
  status            text NOT NULL DEFAULT 'draft',
  -- draft | ready | in_progress | completed | cancelled

  notes             text
);

CREATE INDEX IF NOT EXISTS idx_materials_lists_worksite ON materials_lists(worksite_id);
CREATE INDEX IF NOT EXISTS idx_materials_lists_address  ON materials_lists(property_address);
CREATE INDEX IF NOT EXISTS idx_materials_lists_status   ON materials_lists(status);
CREATE INDEX IF NOT EXISTS idx_materials_lists_date     ON materials_lists(scheduled_date DESC);

ALTER TABLE materials_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON materials_lists;
CREATE POLICY "Authenticated full access" ON materials_lists
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS materials_lists_updated_at ON materials_lists;
CREATE TRIGGER materials_lists_updated_at BEFORE UPDATE ON materials_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TABLE IF NOT EXISTS materials_list_items (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        timestamptz DEFAULT now(),

  list_id           uuid NOT NULL REFERENCES materials_lists(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,

  -- Snapshot fields so the row is meaningful even if inventory item is deleted
  item_name         text NOT NULL,
  category          text,
  unit              text DEFAULT 'each',
  quantity_needed   numeric(10,2) NOT NULL DEFAULT 1,
  quantity_used     numeric(10,2) DEFAULT 0,
  unit_cost         numeric(10,2),
  supplier          text,

  -- Tracking
  fulfilled         boolean DEFAULT false,  -- have we obtained / staged it
  notes             text
);

CREATE INDEX IF NOT EXISTS idx_materials_list_items_list ON materials_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_materials_list_items_inv  ON materials_list_items(inventory_item_id);

ALTER TABLE materials_list_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON materials_list_items;
CREATE POLICY "Authenticated full access" ON materials_list_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
