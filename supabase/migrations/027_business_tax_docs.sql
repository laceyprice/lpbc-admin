-- Business (S-corp) tax document repository for the Business Tax Center.
-- Separate from tax_documents (which tracks vendor W-9/1099s).
create table if not exists business_tax_docs (
  id uuid primary key default gen_random_uuid(),
  category text not null,          -- e.g. 'Formation & Election'
  doc_type text not null,          -- e.g. 'S-Corp Election (Form 2553)'
  tax_year int,
  file_path text,
  file_url text,
  file_name text,
  notes text,
  created_at timestamptz not null default now()
);
