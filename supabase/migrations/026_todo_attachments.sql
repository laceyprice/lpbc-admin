-- Attach images/documents to todos.
-- attachments: jsonb array of { path, name, type, size } (files live in the
-- private 'todo-attachments' storage bucket; signed URLs are generated on read).
alter table todos add column if not exists attachments jsonb not null default '[]'::jsonb;
