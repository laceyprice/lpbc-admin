-- Link job plans to worksites + customers, and track project status so
-- customers can see a simple read-only view of their estimate/status.

alter table job_plans
  add column if not exists worksite_id uuid references worksites(id) on delete set null,
  add column if not exists status text not null default 'draft',
  add column if not exists shared_with_account_id uuid references financial_accounts(id) on delete set null;

alter table job_plans
  drop constraint if exists job_plans_status_check;
alter table job_plans
  add constraint job_plans_status_check check (status in (
    'draft', 'estimated', 'sent_to_customer', 'approved', 'scheduled', 'in_progress', 'completed'
  ));

create index if not exists job_plans_worksite_idx on job_plans(worksite_id);
create index if not exists job_plans_shared_account_idx on job_plans(shared_with_account_id);
