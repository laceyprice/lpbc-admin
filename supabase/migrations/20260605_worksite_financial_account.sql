-- Link worksites to a bookkeeping financial_account so we can pull job costs
-- automatically and show running totals on the worksite detail page.
alter table worksites
  add column if not exists financial_account_id uuid references financial_accounts(id) on delete set null;

create index if not exists worksites_financial_account_idx on worksites(financial_account_id);
