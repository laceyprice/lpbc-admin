-- ============================================================
-- User Roles migration
--   * user_roles table — maps Supabase auth user IDs to roles
--   * Roles: admin (full access), bookkeeper (full admin), invoicing (invoices + quotes only)
--   * RLS policies
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL UNIQUE,  -- references auth.users(id)
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'invoicing' CHECK (role IN ('admin', 'bookkeeper', 'invoicing'))
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_email ON user_roles(email);

DROP TRIGGER IF EXISTS user_roles_updated_at ON user_roles;
CREATE TRIGGER user_roles_updated_at BEFORE UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access" ON user_roles;
CREATE POLICY "Admin full access" ON user_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed: make the primary admin the owner
-- After running, insert a row for Lacey@LaceyNPrice.com with role='admin'
-- You'll need to look up the user_id from Supabase Auth → Users
-- INSERT INTO user_roles (user_id, email, display_name, role) VALUES ('your-user-uuid', 'Lacey@LaceyNPrice.com', 'Lacey Price', 'admin');
