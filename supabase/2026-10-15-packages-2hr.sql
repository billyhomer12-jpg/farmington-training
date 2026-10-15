-- 4-session packages, 2-hour sessions. Idempotent. Run after 2026-10-15-workout-type-gym-hours.sql.
-- Packages (total price for the 4 sessions): 1on1 $250; group2 $300; group3 $350; group4 $375.
alter table public.training_signups add column if not exists package text;
alter table public.training_signups add column if not exists group_size int;
alter table public.training_signups add column if not exists price_cents int;
alter table public.training_signups drop constraint if exists training_signups_package_check;
alter table public.training_signups add constraint training_signups_package_check check (package is null or package in ('1on1','group2','group3','group4'));
alter table public.training_requests add column if not exists duration_min int not null default 60;
alter table public.training_requests drop constraint if exists training_requests_duration_check;
alter table public.training_requests add constraint training_requests_duration_check check (duration_min between 30 and 240);

create or replace function training.package_price_cents(p text) returns int language sql immutable as $$
  select case p when '1on1' then 25000 when 'group2' then 30000 when 'group3' then 35000 when 'group4' then 37500 end;
$$;

-- Seats left for a 2-hour block starting at p_start (0 = unavailable): coach blockout overlap, overlapping
-- 1-on-1 booking, overlapping booking of another program, or overlapping bookings >= program capacity.
create or replace function training.seats_left(p_start timestamptz, p_program text, p_ignore bigint default null)
returns int language sql stable security definer set search_path = '' as $$
  with ov as (
    select r.* from public.training_requests r
    where r.status in ('requested','confirmed') and r.id is distinct from p_ignore
      and r.starts_at < p_start + interval '2 hours'
      and r.starts_at + make_interval(mins => r.duration_min) > p_start)
  select case
    when exists (select 1 from public.training_blocks b where b.starts_at < p_start + interval '2 hours' and b.ends_at > p_start) then 0
    when exists (select 1 from ov where ov.format = '1-on-1') then 0
    when exists (select 1 from ov where ov.program <> p_program) then 0
    else greatest(0, coalesce((select capacity from public.training_capacity where program = p_program), 1) - (select count(*)::int from ov)) end;
$$;

-- 2-hour session must END by close. Gym (HHPC): Mon-Thu starts 5 AM-7 PM, Fri 5 AM-6 PM, Sat 7 AM-3 PM, Sun closed,
-- and no gym-closure overlap. Outdoor / Weight room: every day, starts 6 AM-7 PM (end by 9 PM).
create or replace function training.hour_allowed(p_start timestamptz, p_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  with l as (select p_start at time zone 'America/Denver' as t)
  select date_trunc('hour', p_start) = p_start and case
    when p_type = 'Gym' then
      (case extract(isodow from t)::int
         when 1 then extract(hour from t) between 5 and 19 when 2 then extract(hour from t) between 5 and 19
         when 3 then extract(hour from t) between 5 and 19 when 4 then extract(hour from t) between 5 and 19
         when 5 then extract(hour from t) between 5 and 18 when 6 then extract(hour from t) between 7 and 15
         else false end)
      and not exists (select 1 from public.training_gym_closures c where c.starts_at < p_start + interval '2 hours' and c.ends_at > p_start)
    when p_type in ('Outdoor','Weight room') then extract(hour from t) between 6 and 19
    else false end
  from l;
$$;
-- (training_availability(text,timestamptz,timestamptz,text) picks these up automatically.)

create or replace function public.training_book(p_parent text, p_athlete text, p_age int, p_program text,
  p_phone text, p_email text, p_message text, p_starts timestamptz[], p_workout_type text, p_package text, p_players int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_ref uuid; t timestamptz; v_fmt text; v_n int; s timestamptz[];
begin
  if p_package is null or training.package_price_cents(p_package) is null then raise exception 'Pick a package'; end if;
  if coalesce(array_length(p_starts,1),0) <> 4 then raise exception 'Pick exactly 4 session times (one package = four 2-hour sessions)'; end if;
  if not exists (select 1 from public.training_capacity where program = p_program) then raise exception 'Unknown program'; end if;
  if p_workout_type is null or p_workout_type not in ('Gym','Outdoor','Weight room') then raise exception 'Pick a workout type'; end if;
  select array_agg(x order by x) into s from unnest(p_starts) x;
  for i in 2..4 loop if s[i] < s[i-1] + interval '2 hours' then raise exception 'Your 4 sessions can''t overlap (each is 2 hours)'; end if; end loop;
  v_fmt := case when p_package = '1on1' then '1-on-1' else 'Small group' end;
  v_n := case p_package when '1on1' then 1 when 'group2' then 2 when 'group3' then 3 else 4 end;
  if p_players is not null and p_players <> v_n then raise exception 'Player count does not match the package'; end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  insert into public.training_signups(parent, athlete, age, program, phone, email, message, package, group_size, price_cents)
  values (p_parent, p_athlete, p_age, p_program, nullif(p_phone,''), p_email, nullif(p_message,''), p_package, v_n, training.package_price_cents(p_package))
  returning id, ref into v_id, v_ref;
  foreach t in array s loop
    if t < now() or t > now() + interval '90 days' or not training.hour_allowed(t, p_workout_type) then
      raise exception 'A selected time is outside % hours (sessions are 2 hours) or the gym is closed', p_workout_type; end if;
    if training.seats_left(t, p_program) < 1 then raise exception 'A selected time is no longer available'; end if;
    if v_fmt = '1-on-1' and exists (select 1 from public.training_requests r where r.status in ('requested','confirmed')
         and r.starts_at < t + interval '2 hours' and r.starts_at + make_interval(mins => r.duration_min) > t) then
      raise exception 'A selected time is already taken'; end if;
    insert into public.training_requests(signup_id, starts_at, program, format, workout_type, duration_min)
    values (v_id, t, p_program, v_fmt, p_workout_type, 120);
  end loop;
  return v_ref;
end $$;
revoke all on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text,text,int) from public;
grant execute on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text,text,int) to anon, authenticated;
-- Close the previous 1-hour / any-count booking path (p_format, p_workout_type version).
revoke execute on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text,text) from public, anon, authenticated;
