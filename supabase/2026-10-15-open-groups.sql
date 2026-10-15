-- Open groups: a solo parent books one athlete ($125, 4 x 2-hr sessions) into a coach-run group.
-- Slot rule: an active open-group session owns its slot (no 1-on-1, no other bookings); a slot with a 1-on-1 takes no group joins.
-- All writes serialize on pg_advisory_xact_lock(hashtext('training_book')) (same lock as training_book).

alter table public.training_signups drop constraint if exists training_signups_package_check;
alter table public.training_signups add constraint training_signups_package_check
  check (package is null or package in ('single','1on1','group2','group3','group4','open_group'));

create or replace function training.package_price_cents(p text) returns int language sql immutable as $$
  select case p when 'single' then 7500 when '1on1' then 25000 when 'group2' then 30000 when 'group3' then 35000 when 'group4' then 37500 when 'open_group' then 12500 end;
$$;

-- Minutes an unpaid open-group spot is held while the parent signs + pays.
alter table training.email_outbox drop constraint email_outbox_kind_check;
alter table training.email_outbox add constraint email_outbox_kind_check check (kind in ('confirmation','rescheduled','waiver_copy','waiver_reminder','group_under_min','group_moved'));

create or replace function training.open_group_hold_min() returns int language sql immutable as $$ select 60 $$;

create table if not exists training.open_groups (
  id bigserial primary key,
  label text,
  weekdays int[] not null check (weekdays <@ array[1,2,3,4,5,6] and cardinality(weekdays) between 1 and 3),
  start_hour int not null check (start_hour between 5 and 20),
  first_date date not null,
  sessions int not null default 4 check (sessions = 4),
  capacity int not null check (capacity between 2 and 4),
  min_players int not null default 2,
  age_min int check (age_min between 4 and 25), age_max int check (age_max between 4 and 25),
  program text not null default 'Basketball Skills',
  status text not null default 'forming' check (status in ('forming','running','cancelled')),
  needs_action boolean not null default false,
  checked_at timestamptz,
  note text,
  created_at timestamptz not null default now());
create table if not exists training.open_group_sessions (
  id bigserial primary key,
  group_id bigint not null references training.open_groups(id) on delete cascade,
  starts_at timestamptz not null,
  duration_min int not null default 120,
  unique (group_id, starts_at));
create table if not exists training.open_group_members (
  id bigserial primary key,
  group_id bigint not null references training.open_groups(id) on delete cascade,
  signup_id bigint not null unique references public.training_signups(id) on delete cascade,
  status text not null default 'held' check (status in ('held','paid','expired','moved','cancelled')),
  flag text, -- e.g. 'Refund/move needed'
  created_at timestamptz not null default now());
create table if not exists training.group_move_links (
  token text primary key, signup_id bigint not null references public.training_signups(id) on delete cascade,
  expires_at timestamptz not null, used_at timestamptz);
alter table training.open_groups enable row level security;
alter table training.open_group_sessions enable row level security;
alter table training.open_group_members enable row level security;
alter table training.group_move_links enable row level security;

-- Default capacity: Tue/Thu groups hold 4, Mon/Wed/Fri/Sat groups hold 3.
create or replace function training.og_default_cap(d int[]) returns int language sql immutable as $$
  select case when d <@ array[2,4] then 4 else 3 end $$;

-- Taken spots: paid, or held and still inside the hold window.
create or replace function training.og_taken(p_group bigint) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from training.open_group_members m where m.group_id = p_group
    and (m.status = 'paid' or (m.status = 'held' and m.created_at > now() - make_interval(mins => training.open_group_hold_min()))) $$;
create or replace function training.og_paid(p_group bigint) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from training.open_group_members m where m.group_id = p_group and m.status = 'paid' $$;

-- 1-on-1 requests overlapping any of this group's sessions.
create or replace function training.og_conflicts(p_group bigint) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(distinct g.starts_at), '[]') from training.open_group_sessions g join public.training_requests q
    on q.status in ('requested','confirmed') and q.format = '1-on-1'
   and q.starts_at < g.starts_at + make_interval(mins => g.duration_min) and q.starts_at + make_interval(mins => q.duration_min) > g.starts_at
  where g.group_id = p_group $$;

-- Is a 2-hour slot at p_start owned by an active open group?
create or replace function training.og_slot_taken(p_start timestamptz, p_min int default 120) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from training.open_group_sessions s join training.open_groups g on g.id = s.group_id and g.status <> 'cancelled'
    where s.starts_at < p_start + make_interval(mins => p_min) and s.starts_at + make_interval(mins => s.duration_min) > p_start) $$;

-- Generate the group's session dates: next N matching weekdays from first_date at start_hour (Denver), skipping closures/past.
create or replace function training.og_build_sessions(p_group bigint) returns int language plpgsql security definer set search_path = '' as $$
declare g training.open_groups; d date; t timestamptz; n int := 0;
begin
  select * into g from training.open_groups where id = p_group;
  delete from training.open_group_sessions where group_id = p_group;
  d := g.first_date;
  while n < g.sessions and d < g.first_date + 120 loop
    t := (d + make_time(g.start_hour, 0, 0)) at time zone 'America/Denver';
    if extract(isodow from d)::int = any(g.weekdays) and t > now() and training.hour_allowed(t, 'Gym') then
      insert into training.open_group_sessions(group_id, starts_at) values (p_group, t); n := n + 1; end if;
    d := d + 1;
  end loop;
  if n < g.sessions then raise exception 'Only % gym-hour dates fit this pattern (check the start time and closures)', n; end if;
  return n;
end $$;

create or replace function training.og_json(p_group bigint, p_admin boolean default false) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', g.id, 'label', g.label, 'weekdays', g.weekdays, 'start_hour', g.start_hour, 'capacity', g.capacity,
    'min_players', g.min_players, 'age_min', g.age_min, 'age_max', g.age_max, 'program', g.program, 'status', g.status,
    'taken', training.og_taken(g.id), 'paid', training.og_paid(g.id),
    'spots_left', greatest(0, g.capacity - training.og_taken(g.id)),
    'blocked', jsonb_array_length(training.og_conflicts(g.id)) > 0,
    'sessions', (select coalesce(jsonb_agg(s.starts_at order by s.starts_at), '[]') from training.open_group_sessions s where s.group_id = g.id))
  || case when p_admin then jsonb_build_object('note', g.note, 'needs_action', g.needs_action, 'first_date', g.first_date, 'conflicts', training.og_conflicts(g.id),
    'roster', (select coalesce(jsonb_agg(jsonb_build_object('member_id', m.id, 'signup_id', s.id, 'athlete', s.athlete, 'age', s.age, 'parent', s.parent,
       'phone', s.phone, 'email', s.email, 'status', m.status, 'payment_status', s.payment_status, 'flag', m.flag, 'joined', m.created_at) order by m.created_at), '[]')
     from training.open_group_members m join public.training_signups s on s.id = m.signup_id where m.group_id = g.id and m.status in ('held','paid','expired'))) else '{}'::jsonb end
  from training.open_groups g where g.id = p_group $$;

-- PUBLIC: upcoming joinable groups with spots left.
create or replace function public.training_open_groups() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(training.og_json(g.id) order by (select min(starts_at) from training.open_group_sessions s where s.group_id = g.id)), '[]')
  from training.open_groups g where g.status <> 'cancelled'
    and (select min(starts_at) from training.open_group_sessions s where s.group_id = g.id) > now() + interval '2 hours' $$;

-- PUBLIC: book one athlete into an open group (pay-first; the spot is held for open_group_hold_min minutes).
create or replace function public.training_book_open_group(p_group bigint, p_parent text, p_athlete text, p_age int,
  p_phone text, p_email text, p_message text, p_programs text[]) returns uuid language plpgsql security definer set search_path = '' as $$
declare g training.open_groups; v_id bigint; v_ref uuid; v_progs text[];
begin
  if btrim(coalesce(p_parent,'')) !~ '\S+\s+\S+' or btrim(coalesce(p_athlete,'')) !~ '\S+\s+\S+' then raise exception 'Please enter first and last name.'; end if;
  if length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) < 10 then raise exception 'Please enter a valid phone number'; end if;
  if coalesce(p_email,'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  v_progs := array(select x from unnest(coalesce(p_programs, array['Basketball Skills'])) with ordinality u(x, n) where x is not null group by x order by min(n));
  if coalesce(array_length(v_progs,1),0) = 0 or array_length(v_progs,1) > 3
     or exists (select 1 from unnest(v_progs) x where not exists (select 1 from public.training_capacity c where c.program = x)) then raise exception 'Pick 1 to 3 programs'; end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  select * into g from training.open_groups where id = p_group for update;
  if not found or g.status = 'cancelled' then raise exception 'That group is no longer available'; end if;
  if (select min(starts_at) from training.open_group_sessions where group_id = g.id) <= now() + interval '2 hours' then raise exception 'That group has already started'; end if;
  if g.age_min is not null and p_age < g.age_min or g.age_max is not null and p_age > g.age_max then raise exception 'This group is for ages %-%', g.age_min, g.age_max; end if;
  if jsonb_array_length(training.og_conflicts(g.id)) > 0 then raise exception 'That group isn''t taking new players right now. Please pick another group'; end if;
  if training.og_taken(g.id) >= g.capacity then raise exception 'Sorry, that group just filled up. Please pick another group'; end if;
  insert into public.training_signups(parent, athlete, age, program, programs, phone, email, message, package, group_size, price_cents, workout_types, additional_players)
  values (btrim(p_parent), btrim(p_athlete), p_age, v_progs[1], v_progs, p_phone, p_email, nullif(p_message,''), 'open_group', 1, 12500, array['Gym'], '[]')
  returning id, ref into v_id, v_ref;
  insert into training.open_group_members(group_id, signup_id) values (g.id, v_id);
  return v_ref;
end $$;

-- PUBLIC (by unpaid booking ref): group info for the pay screen.
create or replace function public.training_open_group_for(p_ref uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select training.og_json(m.group_id) || jsonb_build_object('member_status', m.status)
  from public.training_signups s join training.open_group_members m on m.signup_id = s.id where s.ref = p_ref $$;

-- Slot rule on every request write: nothing may overlap an active open-group session.
create or replace function training.requests_slot_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('requested','confirmed') and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.status is distinct from old.status) then
    perform pg_advisory_xact_lock(hashtext('training_book'));
    if training.og_slot_taken(new.starts_at, new.duration_min) then raise exception 'That time is a group session. Please pick an open time'; end if;
  end if;
  return new;
end $$;
drop trigger if exists requests_slot_guard on public.training_requests;
create trigger requests_slot_guard before insert or update on public.training_requests for each row execute function training.requests_slot_guard();

-- seats_left: group-session slots are full for everyone else.
create or replace function training.seats_left(p_start timestamp with time zone, p_program text, p_ignore bigint default null) returns integer
language sql stable security definer set search_path = '' as $function$
  with ov as (
    select r.* from public.training_requests r
    where r.status in ('requested','confirmed') and r.id is distinct from p_ignore
      and r.starts_at < p_start + interval '2 hours'
      and r.starts_at + make_interval(mins => r.duration_min) > p_start)
  select case
    when exists (select 1 from public.training_blocks b where b.starts_at < p_start + interval '2 hours' and b.ends_at > p_start) then 0
    when training.og_slot_taken(p_start) then 0
    when exists (select 1 from ov where ov.format = '1-on-1') then 0
    when exists (select 1 from ov where ov.program <> p_program) then 0
    else greatest(0, coalesce((select capacity from public.training_capacity where program = p_program), 1) - (select count(*)::int from ov)) end;
$function$;

-- PUBLIC: what's in a slot, for the availability page: 'group' (any group session) / '1on1' / null (open).
drop function if exists public.training_slot_kinds(timestamptz, timestamptz);
create function public.training_slot_kinds(p_from timestamptz, p_to timestamptz) returns table(starts_at timestamptz, kind text)
language sql stable security definer set search_path = '' as $$
  select h, case
    when training.og_slot_taken(h, 60) or exists (select 1 from public.training_requests r where r.status in ('requested','confirmed') and r.format = 'Small group'
         and r.starts_at < h + interval '1 hour' and r.starts_at + make_interval(mins => r.duration_min) > h) then 'group'
    when exists (select 1 from public.training_requests r where r.status in ('requested','confirmed') and r.format = '1-on-1'
         and r.starts_at < h + interval '1 hour' and r.starts_at + make_interval(mins => r.duration_min) > h) then '1on1' end
  from generate_series(date_trunc('hour', greatest(p_from, now())), least(p_to, now() + interval '90 days'), interval '1 hour') h
  where extract(hour from h at time zone 'America/Denver') between 5 and 21 $$;

-- Payment: mark the member paid. If the hold had lapsed and the group refilled, keep it paid but flag it for a coach.
create or replace function public.training_mark_paid(p_ref uuid, p_stripe_session text, p_amount_cents integer) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare s public.training_signups; v_token text; m training.open_group_members; g training.open_groups;
begin
  select * into s from public.training_signups where ref = p_ref for update;
  if not found then return jsonb_build_object('error','unknown ref'); end if;
  if s.stripe_session_id = p_stripe_session then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  update public.training_signups set payment_status = 'paid', paid_at = now(), amount_paid_cents = p_amount_cents,
    stripe_session_id = p_stripe_session, token_hash = training.token_hash(v_token) where id = s.id;
  if s.package = 'open_group' then
    perform pg_advisory_xact_lock(hashtext('training_book'));
    select * into m from training.open_group_members where signup_id = s.id for update;
    if found then
      select * into g from training.open_groups where id = m.group_id;
      if m.status = 'held' and m.created_at > now() - make_interval(mins => training.open_group_hold_min()) then
        update training.open_group_members set status = 'paid' where id = m.id;
      else
        -- hold lapsed: count everyone else; if there's still room, take the spot, otherwise flag.
        update training.open_group_members set status = 'paid',
          flag = case when g.status = 'cancelled' or training.og_taken(g.id) >= g.capacity then 'Refund/move needed (paid after hold expired, group full)' end
        where id = m.id;
      end if;
    end if;
  end if;
  insert into training.email_outbox(signup_id, kind, payload) values (s.id, 'confirmation', jsonb_build_object('amount_cents', p_amount_cents));
  return jsonb_build_object('ok', true, 'signup_id', s.id, 'token', v_token);
end $function$;

-- Email data: open-group bookings get the group's sessions and fill count.
create or replace function public.training_outbox_for(p_signup bigint) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'signup', (select to_jsonb(s) - 'token_hash' from public.training_signups s where s.id = p_signup),
    'sessions', case when exists (select 1 from training.open_group_members m where m.signup_id = p_signup)
      then (select coalesce(jsonb_agg(jsonb_build_object('starts_at', g.starts_at, 'duration_min', g.duration_min, 'workout_type', 'Gym', 'program', og.program, 'status', 'confirmed') order by g.starts_at), '[]')
            from training.open_group_members m join training.open_group_sessions g on g.group_id = m.group_id join training.open_groups og on og.id = m.group_id where m.signup_id = p_signup)
      else (select coalesce(jsonb_agg(to_jsonb(r) order by r.starts_at), '[]') from public.training_requests r where r.signup_id = p_signup and r.status <> 'declined') end,
    'group', (select training.og_json(m.group_id) from training.open_group_members m where m.signup_id = p_signup),
    'emails', (select coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]') from training.email_outbox o where o.signup_id = p_signup and o.sent_at is null));
$$;

-- my.html: open-group bookings show the group.
create or replace function public.parent_view(p_token text) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare s public.training_signups; v_g bigint;
begin
  if length(coalesce(p_token,'')) < 32 then return jsonb_build_object('error','invalid link'); end if;
  select * into s from public.training_signups where token_hash = training.token_hash(p_token);
  if not found then return jsonb_build_object('error','invalid link'); end if;
  select group_id into v_g from training.open_group_members where signup_id = s.id;
  return jsonb_build_object(
    'signup', jsonb_build_object('id', s.id, 'parent', s.parent, 'athlete', s.athlete, 'email', s.email,
      'additional_players', coalesce((select jsonb_agg(jsonb_build_object('athlete', p->>'athlete')) from jsonb_array_elements(s.additional_players) p), '[]'),
      'package', s.package, 'group_size', s.group_size, 'price_cents', s.price_cents, 'amount_paid_cents', s.amount_paid_cents,
      'payment_status', s.payment_status, 'paid_at', s.paid_at,
      'programs', coalesce(s.programs, array[s.program]), 'workout_types', s.workout_types),
    'group', case when v_g is not null then training.og_json(v_g) end,
    'sessions', case when v_g is not null then
        (select coalesce(jsonb_agg(jsonb_build_object('id', null, 'starts_at', g.starts_at, 'duration_min', g.duration_min, 'workout_type', 'Gym', 'program', s.program, 'status', 'confirmed', 'group', true) order by g.starts_at), '[]')
         from training.open_group_sessions g where g.group_id = v_g)
      else (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'starts_at', r.starts_at, 'duration_min', r.duration_min,
        'workout_type', r.workout_type, 'program', r.program, 'status', r.status, 'moved_from', r.moved_from) order by r.starts_at), '[]')
      from public.training_requests r where r.signup_id = s.id and r.status <> 'declined') end,
    'cutoff_hours', 24);
end $function$;

-- Move link (from the under-minimum email): view + move to another group, or ask for a refund.
create or replace function public.group_move_view(p_move text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l training.group_move_links; s public.training_signups; v_g bigint;
begin
  select * into l from training.group_move_links where token = p_move and expires_at > now();
  if not found then return jsonb_build_object('error','This link has expired. Please call or email us.'); end if;
  select * into s from public.training_signups where id = l.signup_id;
  select group_id into v_g from training.open_group_members where signup_id = s.id;
  return jsonb_build_object('athlete', s.athlete, 'parent', s.parent, 'age', s.age, 'used', l.used_at is not null,
    'current', training.og_json(v_g),
    'options', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(public.training_open_groups()) x
       where (x->>'id')::bigint <> v_g and (x->>'spots_left')::int > 0 and not (x->>'blocked')::boolean
         and (x->>'age_min' is null or s.age >= (x->>'age_min')::int) and (x->>'age_max' is null or s.age <= (x->>'age_max')::int)));
end $$;
create or replace function public.group_move(p_move text, p_group bigint) returns jsonb language plpgsql security definer set search_path = '' as $$
declare l training.group_move_links; g training.open_groups; m training.open_group_members;
begin
  perform pg_advisory_xact_lock(hashtext('training_book'));
  select * into l from training.group_move_links where token = p_move and expires_at > now() for update;
  if not found then return jsonb_build_object('error','This link has expired. Please call or email us.'); end if;
  select * into m from training.open_group_members where signup_id = l.signup_id for update;
  if p_group is null then -- refund request
    update training.open_group_members set flag = 'Refund requested by parent' where id = m.id;
    update training.group_move_links set used_at = now() where token = p_move;
    return jsonb_build_object('ok', true, 'refund', true);
  end if;
  select * into g from training.open_groups where id = p_group for update;
  if not found or g.status = 'cancelled' or p_group = m.group_id then return jsonb_build_object('error','Pick another group.'); end if;
  if jsonb_array_length(training.og_conflicts(g.id)) > 0 then return jsonb_build_object('error','That group isn''t taking new players right now.'); end if;
  if training.og_taken(g.id) >= g.capacity then return jsonb_build_object('error','Sorry, that group just filled up.'); end if;
  update training.open_group_members set group_id = g.id, flag = null, created_at = now() where id = m.id;
  update training.group_move_links set used_at = now() where token = p_move;
  insert into training.email_outbox(signup_id, kind, payload) values (m.signup_id, 'group_moved', jsonb_build_object('group_id', g.id));
  return jsonb_build_object('ok', true, 'group', training.og_json(g.id));
end $$;

-- 48-hour check (pg_cron, hourly): groups starting within 48 h with < min paid players get flagged; each paid parent is emailed once.
create or replace function training.open_group_check() returns int language plpgsql security definer set search_path = '' as $$
declare g record; m record; v_tok text; n int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('training_book'));
  -- release expired holds
  update training.open_group_members set status = 'expired' where status = 'held' and created_at < now() - make_interval(mins => training.open_group_hold_min());
  for g in select og.* from training.open_groups og where og.status = 'forming' and og.checked_at is null
      and (select min(starts_at) from training.open_group_sessions s where s.group_id = og.id) between now() and now() + interval '48 hours' loop
    update training.open_groups set checked_at = now() where id = g.id;
    if training.og_paid(g.id) >= g.min_players then
      update training.open_groups set status = 'running' where id = g.id;
    else
      update training.open_groups set needs_action = true where id = g.id;
      for m in select * from training.open_group_members where group_id = g.id and status = 'paid' loop
        update training.open_group_members set flag = 'Refund/move needed' where id = m.id;
        v_tok := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
        insert into training.group_move_links(token, signup_id, expires_at) values (v_tok, m.signup_id, now() + interval '14 days');
        insert into training.email_outbox(signup_id, kind, payload) values (m.signup_id, 'group_under_min',
          jsonb_build_object('group', training.og_json(g.id), 'move_url', 'https://fourcornershoopsandperformance.com/my.html?move=' || v_tok));
        n := n + 1;
      end loop;
    end if;
  end loop;
  return n;
end $$;
-- for the notify function's cron run: signups with queued tokenless group notices
create or replace function public.training_open_group_cron(p_key text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.training_cron_key_ok(p_key) then return jsonb_build_object('error','bad key'); end if;
  perform training.open_group_check();
  return jsonb_build_object('ids', (select coalesce(jsonb_agg(distinct signup_id), '[]') from training.email_outbox where sent_at is null and kind in ('group_under_min','group_moved')));
end $$;

-- COACH: list / save / close groups.
create or replace function public.coach_open_groups(p_email text, p_pin text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  return jsonb_build_object('groups', (select coalesce(jsonb_agg(training.og_json(g.id, true) order by g.status = 'cancelled', g.first_date, g.start_hour), '[]')
    from training.open_groups g where g.first_date > current_date - 60));
end $$;
create or replace function public.coach_save_group(p_email text, p_pin text, p_id bigint, p_label text, p_weekdays int[], p_start_hour int,
  p_first_date date, p_capacity int, p_age_min int, p_age_max int, p_status text, p_note text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin); v_id bigint; v_c jsonb;
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  if p_id is null then
    insert into training.open_groups(label, weekdays, start_hour, first_date, capacity, age_min, age_max, note)
    values (nullif(btrim(p_label),''), p_weekdays, p_start_hour, p_first_date, coalesce(p_capacity, training.og_default_cap(p_weekdays)), p_age_min, p_age_max, nullif(p_note,''))
    returning id into v_id;
  else
    if exists (select 1 from training.open_group_members where group_id = p_id and status in ('held','paid'))
       and exists (select 1 from training.open_groups where id = p_id and (weekdays <> p_weekdays or start_hour <> p_start_hour or first_date <> p_first_date)) then
      return jsonb_build_object('error','This group has players, so its days and times are locked. Close it and create a new one, or move players first.'); end if;
    if p_capacity < training.og_taken(p_id) then return jsonb_build_object('error','Capacity can''t be below the players already in the group.'); end if;
    update training.open_groups set label = nullif(btrim(p_label),''), weekdays = p_weekdays, start_hour = p_start_hour, first_date = p_first_date,
      capacity = coalesce(p_capacity, capacity), age_min = p_age_min, age_max = p_age_max, status = coalesce(p_status, status),
      note = nullif(p_note,''), needs_action = case when p_status = 'cancelled' then needs_action else needs_action end where id = p_id;
    v_id := p_id;
  end if;
  perform training.og_build_sessions(v_id);
  v_c := training.og_conflicts(v_id);
  return jsonb_build_object('ok', true, 'id', v_id, 'conflicts', v_c,
    'warning', case when jsonb_array_length(v_c) > 0 then 'Heads-up: a 1-on-1 is already booked at ' || jsonb_array_length(v_c) || ' of these session times, so this group won''t take new players until that 1-on-1 moves.' end);
exception when others then return jsonb_build_object('error', sqlerrm);
end $$;
create or replace function public.coach_group_action(p_email text, p_pin text, p_id bigint, p_action text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  if p_action = 'close' then update training.open_groups set status = 'cancelled' where id = p_id;
    update training.open_group_members set flag = coalesce(flag, 'Refund/move needed') where group_id = p_id and status = 'paid';
  elsif p_action = 'reopen' then update training.open_groups set status = 'forming' where id = p_id;
  elsif p_action = 'resolved' then update training.open_groups set needs_action = false where id = p_id;
    update training.open_group_members set flag = null where group_id = p_id;
  elsif p_action = 'run' then update training.open_groups set status = 'running', needs_action = false where id = p_id;
  else return jsonb_build_object('error','unknown action'); end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.coach_member_action(p_email text, p_pin text, p_member bigint, p_action text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  if p_action = 'remove' then update training.open_group_members set status = 'cancelled' where id = p_member;
  elsif p_action = 'clear_flag' then update training.open_group_members set flag = null where id = p_member;
  else return jsonb_build_object('error','unknown action'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function training.og_build_sessions(bigint), training.open_group_check() from public, anon, authenticated;
grant execute on function public.training_open_groups(), public.training_book_open_group(bigint,text,text,int,text,text,text,text[]),
  public.training_open_group_for(uuid), public.training_slot_kinds(timestamptz,timestamptz), public.group_move_view(text), public.group_move(text,bigint),
  public.coach_open_groups(text,text), public.coach_save_group(text,text,bigint,text,int[],int,date,int,int,int,text,text),
  public.coach_group_action(text,text,bigint,text), public.coach_member_action(text,text,bigint,text) to anon, authenticated;
revoke all on function public.training_open_group_cron(text) from public, anon, authenticated;
grant execute on function public.training_open_group_cron(text) to service_role;

-- Hourly 48-hour check via the notify function (it sends the queued notices).
select cron.unschedule('open-group-check') where exists (select 1 from cron.job where jobname = 'open-group-check');
select cron.schedule('open-group-check', '15 * * * *', $c$
  select net.http_post(url := 'https://jrcozcrfbjcsuqkmoaki.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('action','group-cron','key',(select value from training.app_secrets where name = 'waiver_cron')))
$c$);

-- Seed (only if no groups yet). Coaches edit these in the back office > Open groups.
do $$ declare v bigint; r record; begin
  if exists (select 1 from training.open_groups) then return; end if;
  for r in select * from (values
    ('Mon/Wed 4 PM', array[1,3], 16, date '2026-10-26', 3),
    ('Tue/Thu 4 PM', array[2,4], 16, date '2026-10-27', 4),
    ('Friday 4 PM',  array[5],   16, date '2026-10-30', 3),
    ('Mon/Wed 6 PM', array[1,3], 18, date '2026-11-02', 3),
    ('Tue/Thu 6 PM', array[2,4], 18, date '2026-11-03', 4),
    ('Saturday 10 AM', array[6], 10, date '2026-10-31', 3)) t(l, d, h, f, c) loop
    insert into training.open_groups(label, weekdays, start_hour, first_date, capacity) values (r.l, r.d, r.h, r.f, r.c) returning id into v;
    perform training.og_build_sessions(v);
  end loop;
end $$;

create or replace function public.training_signup_by_move(p_move text) returns bigint language sql stable security definer set search_path = '' as $$
  select signup_id from training.group_move_links where token = p_move and expires_at > now() $$;
revoke all on function public.training_signup_by_move(text) from public, anon, authenticated;
grant execute on function public.training_signup_by_move(text) to service_role;
