-- ═══════════════════════════════════════════════════════════════
-- Leads Generator (cabinet sales): contractor leads in the CRM, permits pulled
-- daily from the county portals, and a marketing-email queue + send log.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

-- ── CRM contacts: tags + contractor licence + email opt-out ──
alter table contacts add column if not exists tags text[] not null default '{}';
alter table contacts add column if not exists license_number text;          -- DBPR full licence no, e.g. CGC1512345
alter table contacts add column if not exists license_type text;            -- CGC / CBC / RG / RB …
alter table contacts add column if not exists county text;                  -- Okaloosa / Walton / Santa Rosa
alter table contacts add column if not exists email_opt_out boolean not null default false;
alter table contacts add column if not exists email_opt_out_at timestamptz;
alter table contacts add column if not exists last_marketing_email_at timestamptz;
alter table contacts add column if not exists unsubscribe_token text;
create index if not exists idx_contacts_tags on contacts using gin (tags);
create index if not exists idx_contacts_license on contacts (license_number);
create unique index if not exists idx_contacts_unsub_token on contacts (unsubscribe_token) where unsubscribe_token is not null;

-- ── Permits found on the county portals ──
create table if not exists lead_permits (
  id uuid primary key default gen_random_uuid(),
  source text not null,                  -- okaloosa | walton | santa_rosa | manual
  county text,
  permit_number text not null,
  case_id text,                          -- portal's internal id (EnerGov CaseId)
  permit_type text,
  work_class text,
  status text,
  description text,
  address text,
  city text,
  apply_date timestamptz,
  issue_date timestamptz,
  valuation numeric,
  square_feet numeric,
  contractor_company text,
  contractor_name text,
  contractor_email text,
  contractor_phone text,
  contractor_license text,               -- licence/contact no. as the county shows it
  contact_id uuid references contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source, permit_number)
);
create index if not exists idx_lead_permits_created on lead_permits (created_at desc);
create index if not exists idx_lead_permits_contact on lead_permits (contact_id);

-- ── Marketing emails: queue (needs approval) + send log ──
create table if not exists lead_emails (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  permit_id uuid references lead_permits(id) on delete set null,
  to_email text not null,
  subject text,
  status text not null default 'queued', -- queued | sent | failed | skipped | cancelled
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by text                           -- 'auto' (daily job) or the staff user who approved it
);
create index if not exists idx_lead_emails_status on lead_emails (status, created_at desc);
create index if not exists idx_lead_emails_contact on lead_emails (contact_id, created_at desc);

-- ── lock the new tables to the service role (API routes use it) ──
do $$
declare t text;
begin
  foreach t in array array['lead_permits','lead_emails']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_no_anon', t);
    execute format('create policy %I on %I for all using (false)', t || '_no_anon', t);
  end loop;
end $$;
