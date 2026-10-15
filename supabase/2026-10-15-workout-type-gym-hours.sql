-- Workout type (Gym / Outdoor / Weight room), HHPC gym hours, gym closures. Idempotent.
-- Run after 2026-10-14-training-bookings.sql and 2026-10-14-session-format.sql.
alter table public.training_requests add column if not exists workout_type text;
alter table public.training_requests drop constraint if exists training_requests_workout_type_check;
alter table public.training_requests add constraint training_requests_workout_type_check
  check (workout_type is null or workout_type in ('Gym','Outdoor','Weight room'));

create table if not exists public.training_gym_closures (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text check (length(reason) <= 200),
  created_at timestamptz not null default now()
);
alter table public.training_gym_closures enable row level security;
grant select on public.training_gym_closures to anon, authenticated;
drop policy if exists "public read" on public.training_gym_closures;
create policy "public read" on public.training_gym_closures for select to anon, authenticated using (true);
-- No future closures were posted on sanjuancollege.edu as of 2026-10-15 (Apr 11 and Oct 8-9 are past). Add new ones in /admin.

-- Is a 1-hour session starting at p_start allowed for this workout type? (America/Denver)
-- Gym (HHPC): Mon-Thu starts 5 AM-8 PM, Fri 5 AM-7 PM, Sat 7 AM-4 PM, Sun closed; never during a gym closure.
-- Outdoor / Weight room: every day, starts 6 AM-8 PM.
create or replace function training.hour_allowed(p_start timestamptz, p_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  with l as (select p_start at time zone 'America/Denver' as t)
  select date_trunc('hour', p_start) = p_start and case
    when p_type = 'Gym' then
      (case extract(isodow from t)::int
         when 1 then extract(hour from t) between 5 and 20 when 2 then extract(hour from t) between 5 and 20
         when 3 then extract(hour from t) between 5 and 20 when 4 then extract(hour from t) between 5 and 20
         when 5 then extract(hour from t) between 5 and 19 when 6 then extract(hour from t) between 7 and 16
         else false end)
      and not exists (select 1 from public.training_gym_closures c where c.starts_at < p_start + interval '1 hour' and c.ends_at > p_start)
    when p_type in ('Outdoor','Weight room') then extract(hour from t) between 6 and 20
    else false end
  from l;
$$;

-- Public availability by workout type: returns every hour 5 AM-8 PM that is NOT fully open, with seats left (0 = unavailable)
-- and whether the gym is closed (closure) that hour. No personal data.
create or replace function public.training_availability(p_program text, p_from timestamptz, p_to timestamptz, p_workout_type text)
returns table(starts_at timestamptz, seats_left int, gym_closed boolean)
language sql stable security definer set search_path = '' as $$
  select h,
    case when training.hour_allowed(h, p_workout_type) then training.seats_left(h, p_program) else 0 end,
    exists (select 1 from public.training_gym_closures c where c.starts_at < h + interval '1 hour' and c.ends_at > h)
  from generate_series(date_trunc('hour', greatest(p_from, now())), least(p_to, now() + interval '90 days'), interval '1 hour') h
  where extract(hour from h at time zone 'America/Denver') between 5 and 20
    and (not training.hour_allowed(h, p_workout_type)
         or training.seats_left(h, p_program) < coalesce((select capacity from public.training_capacity where program = p_program), 1));
$$;
grant execute on function public.training_availability(text, timestamptz, timestamptz, text) to anon, authenticated;

create or replace function public.training_book(p_parent text, p_athlete text, p_age int, p_program text,
  p_phone text, p_email text, p_message text, p_starts timestamptz[], p_format text, p_workout_type text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_ref uuid; t timestamptz;
begin
  if coalesce(array_length(p_starts,1),0) = 0 or array_length(p_starts,1) > 12 then raise exception 'Pick 1 to 12 sessions'; end if;
  if not exists (select 1 from public.training_capacity where program = p_program) then raise exception 'Unknown program'; end if;
  if p_format is not null and p_format not in ('1-on-1','Small group') then raise exception 'Invalid session type'; end if;
  if p_workout_type is null or p_workout_type not in ('Gym','Outdoor','Weight room') then raise exception 'Pick a workout type'; end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  insert into public.training_signups(parent, athlete, age, program, phone, email, message)
  values (p_parent, p_athlete, p_age, p_program, nullif(p_phone,''), p_email, nullif(p_message,''))
  returning id, ref into v_id, v_ref;
  foreach t in array p_starts loop
    if t < now() or t > now() + interval '90 days' or not training.hour_allowed(t, p_workout_type) then
      raise exception 'A selected time is outside % hours or the gym is closed', p_workout_type; end if;
    if training.seats_left(t, p_program) < 1 then raise exception 'A selected time is no longer available'; end if;
    insert into public.training_requests(signup_id, starts_at, program, format, workout_type) values (v_id, t, p_program, p_format, p_workout_type);
  end loop;
  return v_ref;
end $$;
revoke all on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text,text) from public;
grant execute on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text,text) to anon, authenticated;
-- Close the old booking paths so gym hours/closures can't be bypassed.
revoke execute on function public.training_book(text,text,int,text,text,text,text,timestamptz[]) from anon, authenticated;
revoke execute on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text) from anon, authenticated;
revoke execute on function public.training_availability(text, timestamptz, timestamptz) from anon, authenticated;

-- Coach data now includes gym closures.
create or replace function public.coach_data(p_email text, p_pin text, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  return jsonb_build_object(
    'name', (select name from training.coach_pins where email = lower(p_email)),
    'signups', (select coalesce(jsonb_agg(to_jsonb(s) - 'ref' order by s.created_at desc), '[]') from public.training_signups s),
    'requests', (select coalesce(jsonb_agg(to_jsonb(r) order by r.starts_at), '[]') from public.training_requests r where r.starts_at between p_from and p_to),
    'blocks', (select coalesce(jsonb_agg(to_jsonb(b) order by b.starts_at), '[]') from public.training_blocks b where b.ends_at > p_from and b.starts_at < p_to),
    'closures', (select coalesce(jsonb_agg(to_jsonb(c) order by c.starts_at), '[]') from public.training_gym_closures c where c.ends_at > p_from and c.starts_at < p_to),
    'capacity', (select jsonb_object_agg(program, capacity) from public.training_capacity));
end $$;

create or replace function public.coach_add_closure(p_email text, p_pin text, p_start timestamptz, p_end timestamptz, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  if p_end <= p_start then return jsonb_build_object('error','End must be after start.'); end if;
  insert into public.training_gym_closures(starts_at, ends_at, reason) values (p_start, p_end, left(p_reason, 200));
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.coach_delete_closure(p_email text, p_pin text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  delete from public.training_gym_closures where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.coach_add_closure(text,text,timestamptz,timestamptz,text), public.coach_delete_closure(text,text,bigint) to anon, authenticated;
