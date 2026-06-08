-- Design Studio: mood boards, sketches, before/after comparisons, and AI
-- design-direction suggestions, stored as one flexible JSON blob per plan.
-- Shape (all keys optional, default empty arrays):
-- {
--   "board":        [{ id, path, signed_url, name, room, label, notes, price }],
--   "sketches":     [{ id, path, signed_url, name, created_at }],
--   "comparisons":  [{ id, before_path, after_path, note }],
--   "ai_suggestions": [{ id, style_name, description, key_materials: [], estimated_cost_impact, selected }]
-- }

alter table job_plans
  add column if not exists design jsonb not null default '{}'::jsonb;
