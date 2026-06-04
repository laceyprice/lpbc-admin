-- Private storage bucket for Plan New Job uploads (photos, videos, scope docs).
-- Files live here only as long as the estimate session needs them; safe to
-- clean up periodically.
insert into storage.buckets (id, name, public)
values ('job-planning', 'job-planning', false)
on conflict (id) do nothing;
