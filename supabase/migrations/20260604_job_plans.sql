-- Saved job planning sessions — drafts (no estimate yet) and completed plans.
-- Links to attachments by session_id (folder prefix in the job-planning bucket).

create table if not exists job_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  measurements text not null default '',
  session_id text not null,        -- ties to job-planning bucket folder
  attachments jsonb not null default '[]'::jsonb,
  estimate jsonb,                  -- null until estimate is generated
  estimate_generated_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_plans_updated_idx on job_plans(updated_at desc);
create index if not exists job_plans_archived_idx on job_plans(is_archived);

alter table job_plans enable row level security;
drop policy if exists "job_plans_no_anon" on job_plans;
create policy "job_plans_no_anon" on job_plans for all using (false);
