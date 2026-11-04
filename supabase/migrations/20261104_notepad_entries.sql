-- Running notepad: handwritten (stylus/finger) or typed entries, transcribed to
-- text and kept as one chronological pad. Admin-only: the API uses the service
-- role; RLS blocks everyone else.

create table if not exists notepad_entries (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notepad_entries_created on notepad_entries(created_at desc);

alter table notepad_entries enable row level security;
drop policy if exists "notepad_entries_no_anon" on notepad_entries;
create policy "notepad_entries_no_anon" on notepad_entries for all using (false);
