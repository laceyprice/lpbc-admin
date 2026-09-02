-- Customers can be assigned MULTIPLE projects and MULTIPLE bank accounts.
-- (Supersedes the single assigned_project_id / assigned_account_id, which are
-- kept in sync with the first element for backward compatibility.)
alter table user_roles add column if not exists assigned_project_ids uuid[] default '{}';
alter table user_roles add column if not exists assigned_account_ids uuid[] default '{}';
