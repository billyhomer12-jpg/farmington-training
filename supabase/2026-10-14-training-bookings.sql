-- Farmington training: open scheduling (any day, hourly 6 AM-8 PM start, America/Denver),
-- session requests + coach blockouts + payment status. Idempotent; run after 2026-10-14-training-signups.sql.
create extension if not exists pgcrypto with schema extensions;

alter table public.training_signups add column if not exists ref uuid not null default gen_random_uuid();
alter table public.training_signups add column if not exists payment_status text not null default 'pending';
alter table public.training_signups drop constraint if exists training_signups_payment_status_check;
alter table public.training_signups add constraint training_signups_payment_status_check check (payment_status in ('pending','paid','refunded','waived'));
create unique index if not exists training_signups_ref_idx on public.training_signups(ref);
grant update (status, payment_status) on public.training_signups to authenticated;

-- Per-program capacity per hour (1 = private). PLACEHOLDER numbers; coaches can edit.
create table if not exists public.training_capacity (program text primary key, capacity int not null check (capacity between 1 and 50));
insert into public.training_capacity values ('Basketball Skills',6),('Athletic Performance',6),('Youth Strength Training',4) on conflict do nothing;

create table if not exists public.training_requests (
  id bigint generated always as identity primary key,
  signup_id bigint not null references public.training_signups(id) on delete cascade,
  starts_at timestamptz not null,
  program text not null,
  status text not null default 'requested' check (status in ('requested','confirmed','declined','cancelled')),
  coach_note text,
  created_at timestamptz not null default now()
);
create index if not exists training_requests_starts_idx on public.training_requests(starts_at);

create table if not exists public.training_blocks (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  note text,
  created_at timestamptz not null default now()
);

alter table public.training_capacity enable row level security;
alter table public.training_requests enable row level security;
alter table public.training_blocks enable row level security;
revoke all on public.training_capacity, public.training_requests, public.training_blocks from anon;
grant select, insert, update, delete on public.training_capacity, public.training_requests, public.training_blocks to authenticated;
drop policy if exists "coach all" on public.training_capacity;
create policy "coach all" on public.training_capacity for all to authenticated using (training.is_coach()) with check (training.is_coach());
drop policy if exists "coach all" on public.training_requests;
create policy "coach all" on public.training_requests for all to authenticated using (training.is_coach()) with check (training.is_coach());
drop policy if exists "coach all" on public.training_blocks;
create policy "coach all" on public.training_blocks for all to authenticated using (training.is_coach()) with check (training.is_coach());

-- Seats left for a program at an hour (0 = unavailable): blocked, other program booked, or full.
create or replace function training.seats_left(p_start timestamptz, p_program text, p_ignore bigint default null)
returns int language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.training_blocks b where b.starts_at < p_start + interval '1 hour' and b.ends_at > p_start) then 0
    when exists (select 1 from public.training_requests r where r.starts_at = p_start and r.status in ('requested','confirmed')
                 and r.program <> p_program and r.id is distinct from p_ignore) then 0
    else greatest(0, coalesce((select capacity from public.training_capacity where program = p_program), 1)
         - (select count(*)::int from public.training_requests r where r.starts_at = p_start and r.status in ('requested','confirmed')
            and r.id is distinct from p_ignore)) end;
$$;

-- Public availability: only hours that are limited, with seats left for the given program. No personal data.
create or replace function public.training_availability(p_program text, p_from timestamptz, p_to timestamptz)
returns table(starts_at timestamptz, seats_left int)
language sql stable security definer set search_path = '' as $$
  select h, training.seats_left(h, p_program)
  from generate_series(date_trunc('hour', greatest(p_from, now())), least(p_to, now() + interval '90 days'), interval '1 hour') h
  where extract(hour from h at time zone 'America/Denver') between 6 and 20
    and training.seats_left(h, p_program) < coalesce((select capacity from public.training_capacity where program = p_program), 1);
$$;
grant execute on function public.training_availability(text, timestamptz, timestamptz) to anon, authenticated;

-- Public booking: creates signup + requested sessions (pending payment). Returns ref for Stripe client_reference_id.
create or replace function public.training_book(p_parent text, p_athlete text, p_age int, p_program text,
  p_phone text, p_email text, p_message text, p_starts timestamptz[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_ref uuid; t timestamptz;
begin
  if coalesce(array_length(p_starts,1),0) = 0 or array_length(p_starts,1) > 12 then raise exception 'Pick 1 to 12 sessions'; end if;
  if not exists (select 1 from public.training_capacity where program = p_program) then raise exception 'Unknown program'; end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  insert into public.training_signups(parent, athlete, age, program, phone, email, message)
  values (p_parent, p_athlete, p_age, p_program, nullif(p_phone,''), p_email, nullif(p_message,''))
  returning id, ref into v_id, v_ref;
  foreach t in array p_starts loop
    if t <> date_trunc('hour', t) or t < now() or t > now() + interval '90 days'
       or extract(hour from t at time zone 'America/Denver') not between 6 and 20 then raise exception 'Invalid time'; end if;
    if training.seats_left(t, p_program) < 1 then raise exception 'A selected time is no longer available'; end if;
    insert into public.training_requests(signup_id, starts_at, program) values (v_id, t, p_program);
  end loop;
  return v_ref;
end $$;
revoke all on function public.training_book(text,text,int,text,text,text,text,timestamptz[]) from public;
grant execute on function public.training_book(text,text,int,text,text,text,text,timestamptz[]) to anon, authenticated;

-- Coach reschedule with the same capacity/blockout check.
create or replace function public.training_reschedule(p_request bigint, p_start timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_prog text;
begin
  if not training.is_coach() then raise exception 'Not allowed'; end if;
  select program into v_prog from public.training_requests where id = p_request;
  if training.seats_left(p_start, v_prog, p_request) < 1 then raise exception 'That hour is full or blocked'; end if;
  update public.training_requests set starts_at = p_start, status = 'confirmed' where id = p_request;
end $$;
grant execute on function public.training_reschedule(bigint, timestamptz) to authenticated;
grant execute on function training.seats_left(timestamptz, text, bigint) to authenticated;

-- ===================== Coach PIN access for /admin (no login) =====================
create table if not exists training.coach_pins (
  email text primary key, name text not null, pin_hash text, setup_hash text, setup_used_at timestamptz
);
create table if not exists training.pin_attempts (
  id bigint generated always as identity primary key, email text not null, ok boolean not null, kind text not null default 'pin',
  at timestamptz not null default now()
);
create index if not exists pin_attempts_email_at on training.pin_attempts(email, at);
revoke all on training.coach_pins, training.pin_attempts from anon, authenticated;
-- One-time setup codes (bcrypt). Only inserted if the coach row doesn't exist yet; re-running won't reset a chosen PIN.
insert into training.coach_pins(email, name, setup_hash) values
  ('billyhomer12@gmail.com', 'Billy', '$2a$10$wGZXLXHuNZS8Rd1gj2ku4e93PjEb9W5fgTEifk5S6U2eB/t.YcSCi'),
  ('collins.devin2018@gmail.com', 'Devin', '$2a$10$cySADeSjl0rGyekcTgF87OFd8rBq2v/U0mA2GWknlZTjFv9vVyiy.')
on conflict (email) do nothing;

-- Locked if 5 failed tries in the last 15 minutes (per coach), or 30 failed tries site-wide in 15 minutes.
create or replace function training.locked(p_email text) returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from training.pin_attempts where email = lower(p_email) and not ok and at > now() - interval '15 minutes'
          and at > coalesce((select max(at) from training.pin_attempts where email = lower(p_email) and ok), '-infinity')) >= 5
      or (select count(*) from training.pin_attempts where not ok and at > now() - interval '15 minutes') >= 30;
$$;
-- Returns null when OK, else an error message. Records the attempt (no exception, so it commits).
create or replace function training.pin_check(p_email text, p_pin text) returns text language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_ok boolean;
begin
  if training.locked(p_email) then return 'Too many wrong PINs. Try again in 15 minutes.'; end if;
  select pin_hash into v_hash from training.coach_pins where email = lower(p_email);
  v_ok := v_hash is not null and p_pin ~ '^[0-9]{4}$' and extensions.crypt(p_pin, v_hash) = v_hash;
  insert into training.pin_attempts(email, ok) values (lower(coalesce(p_email,'')), v_ok);
  delete from training.pin_attempts where at < now() - interval '7 days';
  return case when v_ok then null else 'Wrong PIN.' end;
end $$;

create or replace function public.coach_set_pin(p_email text, p_setup_code text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r training.coach_pins; v_ok boolean;
begin
  if training.locked(p_email) then return jsonb_build_object('error','Too many attempts. Try again in 15 minutes.'); end if;
  select * into r from training.coach_pins where email = lower(p_email);
  v_ok := r.setup_hash is not null and r.setup_used_at is null and extensions.crypt(upper(trim(p_setup_code)), r.setup_hash) = r.setup_hash;
  insert into training.pin_attempts(email, ok, kind) values (lower(coalesce(p_email,'')), v_ok, 'setup');
  if not v_ok then return jsonb_build_object('error','Setup code is wrong or already used.'); end if;
  if p_new_pin !~ '^[0-9]{4}$' then return jsonb_build_object('error','PIN must be 4 digits.'); end if;
  update training.coach_pins set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)), setup_used_at = now(), setup_hash = null
    where email = r.email;
  return jsonb_build_object('ok', true, 'name', r.name);
end $$;

drop function if exists public.coach_list();

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
    'capacity', (select jsonb_object_agg(program, capacity) from public.training_capacity));
end $$;

create or replace function public.coach_update_signup(p_email text, p_pin text, p_id bigint, p_status text, p_payment text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  update public.training_signups set status = coalesce(p_status, status), payment_status = coalesce(p_payment, payment_status) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.coach_delete_signup(p_email text, p_pin text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  delete from public.training_signups where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- status: requested/confirmed/declined/cancelled; p_start non-null = reschedule (capacity/blockout checked).
create or replace function public.coach_update_request(p_email text, p_pin text, p_id bigint, p_status text, p_start timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin); v_prog text;
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  if p_start is not null then
    select program into v_prog from public.training_requests where id = p_id;
    if training.seats_left(p_start, v_prog, p_id) < 1 then return jsonb_build_object('error','That hour is full or blocked.'); end if;
    update public.training_requests set starts_at = p_start, status = coalesce(p_status,'confirmed') where id = p_id;
  else
    update public.training_requests set status = p_status where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.coach_add_block(p_email text, p_pin text, p_start timestamptz, p_end timestamptz, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  if p_end <= p_start then return jsonb_build_object('error','End must be after start.'); end if;
  insert into public.training_blocks(starts_at, ends_at, note) values (p_start, p_end, left(p_note, 200));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.coach_delete_block(p_email text, p_pin text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  delete from public.training_blocks where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function training.pin_check(text,text), training.locked(text) from public, anon, authenticated;
grant execute on function public.coach_set_pin(text,text,text), public.coach_data(text,text,timestamptz,timestamptz),
  public.coach_update_signup(text,text,bigint,text,text), public.coach_delete_signup(text,text,bigint),
  public.coach_update_request(text,text,bigint,text,timestamptz), public.coach_add_block(text,text,timestamptz,timestamptz,text),
  public.coach_delete_block(text,text,bigint) to anon, authenticated;
