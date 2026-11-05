-- Documents/images attached to licenses and permits (license scans, permit
-- approvals, inspection photos). The file itself lives in the private Supabase
-- storage bucket "record-files"; when Google Drive is connected for writing, a
-- copy is also saved to Drive ("Licenses & Permits" folder) and linked here.

create table if not exists record_files (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('license', 'permit')),
  entity_id uuid not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  drive_file_id text,
  drive_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_record_files_entity on record_files(entity_type, entity_id);

alter table record_files enable row level security;
drop policy if exists "record_files_no_anon" on record_files;
create policy "record_files_no_anon" on record_files for all using (false);
