-- Account Manager + recurring expense tracker.
-- Stores credentials (plain-text — only readable via service-role key) and
-- optional recurring-payment metadata so the bookkeeping ledger can suggest
-- accounts that match recurring bank transactions.

create table if not exists vault_accounts (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Other',
  name text not null,
  username text,
  password text,
  passkey text,
  url text,
  notes text,
  -- Recurring expense fields
  is_recurring boolean not null default false,
  amount numeric(10,2),
  frequency text check (frequency in ('weekly','monthly','quarterly','annual','one_time') or frequency is null),
  next_due_date date,
  -- Status
  is_active boolean not null default true,
  -- Optional link to the bank transaction payee that generated the suggestion
  matched_payee text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_accounts_category_idx on vault_accounts(category);
create index if not exists vault_accounts_active_idx on vault_accounts(is_active);
create index if not exists vault_accounts_recurring_idx on vault_accounts(is_recurring) where is_recurring;
create index if not exists vault_accounts_payee_idx on vault_accounts(matched_payee);

-- RLS: deny all anon, allow service role.
alter table vault_accounts enable row level security;
drop policy if exists "vault_no_anon" on vault_accounts;
create policy "vault_no_anon" on vault_accounts for all using (false);
