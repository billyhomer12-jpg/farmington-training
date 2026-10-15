-- Per-session workout types + additional small-group players. Idempotent.
-- Run after 2026-10-15-multi-programs.sql. Older training_book versions keep working.
alter table public.training_signups add column if not exists workout_types text[];
alter table public.training_signups add column if not exists additional_players jsonb not null default '[]'::jsonb;
update public.training_signups s set workout_types = (select array_agg(distinct r.workout_type) from public.training_requests r where r.signup_id = s.id and r.workout_type is not null)
  where workout_types is null;

create or replace function public.training_book(p_parent text, p_athlete text, p_age int, p_program text,
  p_phone text, p_email text, p_message text, p_starts timestamptz[], p_workout_type text, p_package text, p_players int,
  p_programs text[], p_session_types text[], p_workout_types text[], p_additional_players jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_ref uuid; v_fmt text; v_n int; v_progs text[]; v_types text[]; r record; prev timestamptz; p jsonb;
begin
  if p_package is null or training.package_price_cents(p_package) is null then raise exception 'Pick a package'; end if;
  if coalesce(array_length(p_starts,1),0) <> 4 then raise exception 'Pick exactly 4 session times (one package = four 2-hour sessions)'; end if;
  if coalesce(array_length(p_session_types,1),0) <> 4 then raise exception 'Each session needs a workout type'; end if;
  if exists (select 1 from unnest(p_session_types) x where x is null or x not in ('Gym','Outdoor','Weight room')) then raise exception 'Pick a workout type'; end if;
  if coalesce(array_length(regexp_split_to_array(btrim(coalesce(p_parent,'')), '\s+'),1),0) < 2 or btrim(coalesce(p_parent,'')) = '' then raise exception 'Please enter first and last name.'; end if;
  if length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) < 10 then raise exception 'Please enter a valid phone number'; end if;
  if coalesce(p_email,'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  -- programs: 1-3, known, parent's order kept
  v_progs := array(select x from unnest(p_programs) with ordinality u(x, n) where x is not null group by x order by min(n));
  if coalesce(array_length(v_progs,1),0) = 0 or array_length(v_progs,1) > 3 then raise exception 'Pick 1 to 3 programs'; end if;
  if exists (select 1 from unnest(v_progs) x where not exists (select 1 from public.training_capacity c where c.program = x)) then raise exception 'Unknown program'; end if;
  v_types := array(select x from unnest(coalesce(p_workout_types, p_session_types)) with ordinality u(x, n) where x in ('Gym','Outdoor','Weight room') group by x order by min(n));
  if exists (select 1 from unnest(p_session_types) x where not x = any(v_types)) then v_types := array(select distinct x from unnest(v_types || p_session_types) x); end if;
  v_fmt := case when p_package = '1on1' then '1-on-1' else 'Small group' end;
  v_n := case p_package when '1on1' then 1 when 'group2' then 2 when 'group3' then 3 else 4 end;
  if p_players is not null and p_players <> v_n then raise exception 'Player count does not match the package'; end if;
  -- additional players: exactly group size - 1, each with athlete, parent (two words) and phone
  p_additional_players := coalesce(p_additional_players, '[]'::jsonb);
  if jsonb_typeof(p_additional_players) <> 'array' or jsonb_array_length(p_additional_players) <> v_n - 1 then raise exception 'Add details for every player in the group'; end if;
  for p in select value from jsonb_array_elements(p_additional_players) loop
    if btrim(coalesce(p->>'athlete','')) !~ '\S+\s+\S+' or btrim(coalesce(p->>'parent','')) !~ '\S+\s+\S+' then raise exception 'Please enter first and last name.'; end if;
    if length(regexp_replace(coalesce(p->>'phone',''), '\D', '', 'g')) < 10 then raise exception 'Please enter a valid phone number for every player'; end if;
  end loop;
  p_additional_players := (select coalesce(jsonb_agg(jsonb_build_object('athlete', btrim(e->>'athlete'), 'parent', btrim(e->>'parent'), 'phone', btrim(e->>'phone'))), '[]'::jsonb) from jsonb_array_elements(p_additional_players) e);
  perform pg_advisory_xact_lock(hashtext('training_book'));
  insert into public.training_signups(parent, athlete, age, program, programs, phone, email, message, package, group_size, price_cents, workout_types, additional_players)
  values (btrim(p_parent), btrim(p_athlete), p_age, v_progs[1], v_progs, p_phone, p_email, nullif(p_message,''), p_package, v_n, training.package_price_cents(p_package), v_types, p_additional_players)
  returning id, ref into v_id, v_ref;
  prev := null;
  for r in select s.t, s.w from unnest(p_starts, p_session_types) as s(t, w) order by s.t loop
    if prev is not null and r.t < prev + interval '2 hours' then raise exception 'Your 4 sessions can''t overlap (each is 2 hours)'; end if;
    prev := r.t;
    if r.t < now() or r.t > now() + interval '90 days' or not training.hour_allowed(r.t, r.w) then
      raise exception 'A selected time is outside % hours (sessions are 2 hours) or the gym is closed', r.w; end if;
    if training.seats_left(r.t, v_progs[1]) < 1 then raise exception 'A selected time is no longer available'; end if;
    if v_fmt = '1-on-1' and exists (select 1 from public.training_requests q where q.status in ('requested','confirmed')
         and q.starts_at < r.t + interval '2 hours' and q.starts_at + make_interval(mins => q.duration_min) > r.t) then
      raise exception 'A selected time is already taken'; end if;
    insert into public.training_requests(signup_id, starts_at, program, format, workout_type, duration_min)
    values (v_id, r.t, v_progs[1], v_fmt, r.w, 120);
  end loop;
  return v_ref;
end $$;
revoke all on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text,text,int,text[],text[],text[],jsonb) from public;
grant execute on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text,text,int,text[],text[],text[],jsonb) to anon, authenticated;
