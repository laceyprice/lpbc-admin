-- Customers are assigned to a PROJECT (a job plan from Plan & Design Studio),
-- which they view read-only in their portal. Supersedes the earlier
-- worksite-based assignment.
alter table user_roles
  add column if not exists assigned_project_id uuid references job_plans(id) on delete set null;
