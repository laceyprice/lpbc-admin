-- Generic business-wide settings store (key/value JSON).
-- Used for shared finish prices; reusable for other app-level settings later.
create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
