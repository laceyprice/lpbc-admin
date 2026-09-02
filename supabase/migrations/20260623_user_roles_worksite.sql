-- Customers are now assigned to a PROJECT (worksite) rather than a bank account
-- directly. Their financial access is derived from the bank account attached to
-- that project (worksites.financial_account_id). assigned_account_id is still
-- written (derived from the project) so the customer portal keeps working.
alter table user_roles
  add column if not exists assigned_worksite_id uuid references worksites(id) on delete set null;
