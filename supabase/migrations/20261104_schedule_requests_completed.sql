-- Allow schedule requests to be closed out as 'completed' (done) without
-- scheduling an appointment or declining — nothing is sent to the customer.
-- The original CHECK only allowed pending | scheduled | declined.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.schedule_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.schedule_requests drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.schedule_requests
  add constraint schedule_requests_status_check
  check (status in ('pending', 'scheduled', 'declined', 'completed'));
