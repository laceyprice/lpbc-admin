-- ═══════════════════════════════════════════════════════════════
-- Materials & Inventory
-- Three tables:
--   inventory_items       master catalog with stock levels
--   property_materials    what was used at each job site
--   inventory_transactions  stock movement audit log
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Master inventory catalog ───────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),

  name                  text NOT NULL,
  description           text,
  sku                   text,

  -- Categories for gas service company
  -- regulators | valves | pipe_fittings | connectors | lp_tank |
  -- appliance_parts | safety | consumables | tools | other
  category              text NOT NULL DEFAULT 'other',

  unit                  text NOT NULL DEFAULT 'each',
  -- each | ft | lb | gallon | box | pair | roll | kit

  -- Stock levels
  quantity_on_hand      numeric(10,2) NOT NULL DEFAULT 0,
  reorder_point         numeric(10,2) DEFAULT 0,
  reorder_quantity      numeric(10,2) DEFAULT 0,

  -- Pricing / sourcing
  unit_cost             numeric(10,2),
  supplier              text,
  supplier_part_number  text,

  -- Gas type applicability
  gas_type              text DEFAULT 'both', -- natural_gas | propane | both

  is_active             boolean DEFAULT true,
  notes                 text,
  tags                  text[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_inv_items_category  ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inv_items_gas_type  ON inventory_items(gas_type);
CREATE INDEX IF NOT EXISTS idx_inv_items_active    ON inventory_items(is_active);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON inventory_items;
CREATE POLICY "Admin full access" ON inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS inventory_items_updated_at ON inventory_items;
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 2. Property materials (what was used at each job site) ────
CREATE TABLE IF NOT EXISTS property_materials (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at                timestamptz DEFAULT now(),

  -- Property/customer references
  worksite_id               uuid REFERENCES worksites(id) ON DELETE SET NULL,
  contact_id                uuid REFERENCES contacts(id) ON DELETE SET NULL,
  property_address          text,      -- denormalized for easy display

  -- What was used
  inventory_item_id         uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name                 text NOT NULL,
  category                  text DEFAULT 'other',
  quantity                  numeric(10,2) DEFAULT 1,
  unit                      text DEFAULT 'each',
  unit_cost                 numeric(10,2),

  -- How it was recorded
  source                    text DEFAULT 'manual', -- manual | invoice | calendar
  invoice_id                uuid REFERENCES invoices(id) ON DELETE SET NULL,
  calendar_event_id         text,

  date_used                 date DEFAULT CURRENT_DATE,
  notes                     text,
  deducted_from_inventory   boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_prop_mat_contact   ON property_materials(contact_id);
CREATE INDEX IF NOT EXISTS idx_prop_mat_worksite  ON property_materials(worksite_id);
CREATE INDEX IF NOT EXISTS idx_prop_mat_item      ON property_materials(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_prop_mat_invoice   ON property_materials(invoice_id);
CREATE INDEX IF NOT EXISTS idx_prop_mat_date      ON property_materials(date_used);

ALTER TABLE property_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON property_materials;
CREATE POLICY "Admin full access" ON property_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 3. Inventory transaction log ──────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            timestamptz DEFAULT now(),

  inventory_item_id     uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,

  -- received | used | adjusted | returned | damaged
  transaction_type      text NOT NULL,

  quantity              numeric(10,2) NOT NULL, -- positive = stock in, negative = stock out
  quantity_before       numeric(10,2),
  quantity_after        numeric(10,2),

  -- What triggered this
  reference_type        text, -- invoice | manual | purchase_order | sync
  reference_id          text,
  notes                 text
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_item ON inventory_transactions(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_type ON inventory_transactions(transaction_type);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON inventory_transactions;
CREATE POLICY "Admin full access" ON inventory_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
