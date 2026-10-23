-- Recurring expenses: what it costs each month to keep the business (and the
-- household) running. scope = 'business' (operating expenses) | 'personal'.
-- Admin-only: the API reads/writes with the service role; RLS blocks everyone else.

create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'business' check (scope in ('business', 'personal')),
  name text not null,
  category text,
  amount numeric(10,2) not null default 0,
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'one_time')),
  next_due_date date,
  vendor text,
  matched_payee text,          -- normalized bank payee this row was created from (de-dupes "Suggest from Bank")
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_expenses_scope on recurring_expenses(scope, is_active);

alter table recurring_expenses enable row level security;
drop policy if exists "recurring_expenses_no_anon" on recurring_expenses;
create policy "recurring_expenses_no_anon" on recurring_expenses for all using (false);
