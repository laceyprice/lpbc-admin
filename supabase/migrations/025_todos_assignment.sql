-- ═══════════════════════════════════════════════════════════════
-- Add assignment fields to todos
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE todos ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS assigned_to_name    text;

CREATE INDEX IF NOT EXISTS idx_todos_assigned_to ON todos(assigned_to_user_id);
