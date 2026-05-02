-- ═══════════════════════════════════════════════════════════════
-- Suppliers — companies we regularly order inventory from.
-- Each inventory item can be assigned to a primary supplier.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS suppliers (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  name            text NOT NULL,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  website         text,
  account_number  text,           -- our account # at this supplier
  address         text,
  notes           text,
  is_active       boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_name   ON suppliers(name);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON suppliers;
CREATE POLICY "Authenticated full access" ON suppliers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS suppliers_updated_at ON suppliers;
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Link inventory items to a primary supplier
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_items_supplier ON inventory_items(supplier_id);
