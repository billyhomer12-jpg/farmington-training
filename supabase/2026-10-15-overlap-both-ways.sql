-- Any 2-hour overlap blocks, both directions, for every insert path (not just training_book).
create or replace function training.requests_slot_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('requested','confirmed') and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.status is distinct from old.status) then
    perform pg_advisory_xact_lock(hashtext('training_book'));
    if training.og_slot_taken(new.starts_at, new.duration_min) then raise exception 'That time is a group session. Please pick an open time'; end if;
    if exists (select 1 from public.training_requests q where q.status in ('requested','confirmed') and q.id is distinct from new.id
         and q.signup_id is distinct from new.signup_id
         and q.starts_at < new.starts_at + make_interval(mins => new.duration_min) and q.starts_at + make_interval(mins => q.duration_min) > new.starts_at
         and (coalesce(new.format,'') = '1-on-1' or coalesce(q.format,'') = '1-on-1')) then
      raise exception 'A selected time is already taken'; end if;
  end if;
  return new;
end $$;
-- Labels: a start hour is marked by anything in its full 2-hour window.
create or replace function public.training_slot_kinds(p_from timestamptz, p_to timestamptz) returns table(starts_at timestamptz, kind text) language sql stable security definer set search_path = '' as $$
  select h, case
    when training.og_slot_taken(h, 120) or exists (select 1 from public.training_requests r where r.status in ('requested','confirmed') and r.format = 'Small group'
         and r.starts_at < h + interval '2 hours' and r.starts_at + make_interval(mins => r.duration_min) > h) then 'group'
    when exists (select 1 from public.training_requests r where r.status in ('requested','confirmed') and r.format = '1-on-1'
         and r.starts_at < h + interval '2 hours' and r.starts_at + make_interval(mins => r.duration_min) > h) then '1on1' end
  from generate_series(date_trunc('hour', greatest(p_from, now())), least(p_to, now() + interval '90 days'), interval '1 hour') h
  where extract(hour from h at time zone 'America/Denver') between 5 and 21
$$;
