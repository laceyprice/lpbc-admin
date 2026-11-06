-- ═══════════════════════════════════════════════════════════════
-- Operations suite: job profitability, service agreements, collections,
-- customer texts, mileage, safety checklists, subcontractors.
-- Safe to run more than once. All tables are service-role only (RLS deny-all).
-- ═══════════════════════════════════════════════════════════════

-- ── Job profitability: labor + other costs per job (a job = an invoice) ──
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  work_date date not null default current_date,
  worker text,
  hours numeric(6,2) not null check (hours >= 0),
  hourly_rate numeric(8,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_time_entries_invoice on time_entries(invoice_id);

create table if not exists job_costs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  cost_date date not null default current_date,
  category text not null default 'materials',          -- materials | subcontractor | permit | equipment | fuel | other
  description text,
  vendor text,
  amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_job_costs_invoice on job_costs(invoice_id);

-- ── Recurring service agreements (annual inspections, maintenance contracts) ──
create table if not exists service_agreements (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text,
  customer_phone text,
  service_address text,
  service_description text,
  amount numeric(10,2) not null default 0,
  frequency text not null default 'annual',            -- monthly | quarterly | semiannual | annual
  next_service_date date,
  last_service_date date,
  remind_customer boolean not null default false,      -- email the customer ~30 days before it's due
  last_reminded_for date,                              -- next_service_date we last reminded about (no duplicate reminders)
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_service_agreements_due on service_agreements(is_active, next_service_date);

-- ── Collections: track follow-ups on unpaid invoices ──
alter table invoices add column if not exists last_reminder_at timestamptz;
alter table invoices add column if not exists reminder_count integer not null default 0;

-- ── Everything we text / email customers (reminders, "on my way", review requests, missed calls) ──
create table if not exists message_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                                  -- collection | otw | review | missed_call | agreement
  channel text not null,                               -- sms | email
  to_contact text,
  invoice_id uuid,
  body text,
  status text,
  created_at timestamptz not null default now()
);
create index if not exists idx_message_log_created on message_log(created_at desc);

-- ── Mileage log ──
create table if not exists mileage_entries (
  id uuid primary key default gen_random_uuid(),
  trip_date date not null default current_date,
  miles numeric(8,1) not null check (miles >= 0),
  purpose text,
  from_location text,
  to_location text,
  vehicle text,
  rate numeric(5,3) not null default 0.70,             -- $/mile when the trip was logged (IRS rate)
  created_at timestamptz not null default now()
);
create index if not exists idx_mileage_date on mileage_entries(trip_date desc);

-- ── Safety / pressure-test checklists with a signature ──
create table if not exists checklist_runs (
  id uuid primary key default gen_random_uuid(),
  template text not null,
  title text,
  job_address text,
  customer_name text,
  invoice_id uuid references invoices(id) on delete set null,
  tech_name text,
  answers jsonb not null default '{}'::jsonb,
  passed boolean,
  notes text,
  signature text,                                      -- data URL of the drawn signature
  signed_by text,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_checklist_runs_created on checklist_runs(created_at desc);

-- ── Subcontractors + 1099 tracking ──
create table if not exists subcontractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text,
  trade text,
  email text,
  phone text,
  tax_id_last4 text,                                   -- last 4 only — never store a full SSN/EIN here
  w9_on_file boolean not null default false,
  coi_expiry date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists sub_payments (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references subcontractors(id) on delete cascade,
  pay_date date not null default current_date,
  amount numeric(10,2) not null check (amount >= 0),
  description text,
  invoice_id uuid references invoices(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_sub_payments_sub on sub_payments(subcontractor_id, pay_date desc);

-- ── lock everything to the service role ──
do $$
declare t text;
begin
  foreach t in array array['time_entries','job_costs','service_agreements','message_log','mileage_entries','checklist_runs','subcontractors','sub_payments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_no_anon', t);
    execute format('create policy %I on %I for all using (false)', t || '_no_anon', t);
  end loop;
end $$;
