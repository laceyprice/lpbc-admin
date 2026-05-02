-- ═══════════════════════════════════════════════════════════════
-- Persistent Todo List — items the user has chosen to track. Lives
-- alongside the AI-generated suggestions (which stay ephemeral).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS todos (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  title           text NOT NULL,
  description     text,
  priority        text DEFAULT 'medium', -- high | medium | low
  category        text DEFAULT 'general', -- invoicing | scheduling | bookkeeping | follow-up | general
  action_url      text,                  -- optional link to navigate to
  due_date        date,

  status          text NOT NULL DEFAULT 'open', -- open | done | dismissed
  completed_at    timestamptz,

  source          text DEFAULT 'manual',  -- manual | ai
  source_ref      text                    -- the AI todo id this was added from (if any)
);

CREATE INDEX IF NOT EXISTS idx_todos_status   ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
CREATE INDEX IF NOT EXISTS idx_todos_due      ON todos(due_date);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON todos;
CREATE POLICY "Authenticated full access" ON todos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS todos_updated_at ON todos;
CREATE TRIGGER todos_updated_at BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
