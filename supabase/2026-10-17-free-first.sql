-- FREE-FIRST (Billy via Cisco, 10/17): First Session Free for new players 12-18, until 2026-10-24 23:59:59 MDT.
-- Also: "How did you hear about us?" + utm_source on every booking. Additive; Grand Opening / Stripe untouched.
alter table public.training_signups add column if not exists heard_from text, add column if not exists heard_from_other text,
  add column if not exists utm_source text, add column if not exists new_player boolean, add column if not exists repeat_free boolean not null default false,
  add column if not exists repeat_note text;
alter table public.training_signups drop constraint if exists training_signups_heard_from_check;
alter table public.training_signups add constraint training_signups_heard_from_check check (heard_from is null or heard_from in ('Facebook','Instagram','TikTok','Google','Friend/family','Flyer','Other'));
alter table public.training_signups drop constraint if exists training_signups_src_len_check;
alter table public.training_signups add constraint training_signups_src_len_check check (length(heard_from_other) <= 120 and length(utm_source) <= 100);
alter table public.training_signups drop constraint if exists training_signups_package_check;
alter table public.training_signups add constraint training_signups_package_check check (package is null or package in ('single','1on1','group2','group3','group4','open_group','free_first'));
alter table public.training_signups drop constraint if exists training_signups_payment_status_check;
alter table public.training_signups add constraint training_signups_payment_status_check check (payment_status in ('pending','paid','refunded','waived','free_confirmed'));
alter table training.email_outbox drop constraint if exists email_outbox_kind_check;
alter table training.email_outbox add constraint email_outbox_kind_check check (kind in ('confirmation','rescheduled','waiver_copy','waiver_reminder','group_under_min','group_moved','coach_notice','free_confirmation'));

-- Keep in sync with window.SITE.FREE_FIRST_END in config.js. Server-side cutoff (front end hides too).
create or replace function training.free_first_end() returns timestamptz language sql immutable as $$ select '2026-10-24T23:59:59-06:00'::timestamptz $$;

create or replace function training.norm_phone(p text) returns text language sql immutable as $$ select right(regexp_replace(coalesce(p,''), '\D', '', 'g'), 10) $$;

-- Source for paid bookings (called right after training_book / training_book_open_group). Only fills empty fields on a fresh booking.
create or replace function public.training_set_source(p_ref uuid, p_heard_from text, p_heard_from_other text default null, p_utm_source text default null)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  if p_heard_from is null or p_heard_from not in ('Facebook','Instagram','TikTok','Google','Friend/family','Flyer','Other') then raise exception 'Tell us how you heard about us'; end if;
  update public.training_signups set heard_from = p_heard_from,
    heard_from_other = case when p_heard_from = 'Other' then left(nullif(btrim(coalesce(p_heard_from_other,'')),''), 120) end,
    utm_source = left(nullif(btrim(coalesce(p_utm_source,'')),''), 100)
  where ref = p_ref and heard_from is null and created_at > now() - interval '2 hours';
  return found;
end $$;
grant execute on function public.training_set_source(uuid,text,text,text) to anon, authenticated;

create or replace function public.training_book_free(p_parent text, p_athlete text, p_age integer, p_programs text[], p_phone text, p_email text, p_message text,
  p_start timestamptz, p_workout_type text, p_new_player boolean, p_heard_from text, p_heard_from_other text default null, p_utm_source text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint; v_ref uuid; v_progs text[]; v_prior int; v_note text; v_email text := lower(btrim(coalesce(p_email,''))); v_ph text := training.norm_phone(p_phone);
begin
  if now() > training.free_first_end() then raise exception 'The free first session offer ended 10/24'; end if;
  if p_new_player is not true then raise exception 'The free first session is for new players. Please check "This is a new player"'; end if;
  if p_age is null or p_age < 12 or p_age > 18 then raise exception 'The free first session is for ages 12-18'; end if;
  if p_heard_from is null or p_heard_from not in ('Facebook','Instagram','TikTok','Google','Friend/family','Flyer','Other') then raise exception 'Tell us how you heard about us'; end if;
  if p_workout_type is null or p_workout_type not in ('Gym','Outdoor') then raise exception 'Pick a workout type'; end if;
  if btrim(coalesce(p_parent,'')) !~ '\S+\s+\S+' then raise exception 'Please enter first and last name.'; end if;
  if length(v_ph) < 10 then raise exception 'Please enter a valid phone number'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  v_progs := array(select x from unnest(p_programs) with ordinality u(x, n) where x is not null group by x order by min(n));
  if coalesce(array_length(v_progs,1),0) = 0 or array_length(v_progs,1) > 3 then raise exception 'Pick 1 to 3 programs'; end if;
  if exists (select 1 from unnest(v_progs) x where not exists (select 1 from public.training_capacity c where c.program = x)) then raise exception 'Unknown program'; end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  if p_start < now() or p_start > now() + interval '90 days' or not training.hour_allowed(p_start, p_workout_type) then
    raise exception 'That time is outside % hours (sessions are 2 hours) or the gym is closed', p_workout_type; end if;
  if training.seats_left(p_start, v_progs[1]) < 1 then raise exception 'That time is no longer available'; end if;
  if exists (select 1 from public.training_requests q where q.status in ('requested','confirmed') and not exists (select 1 from public.training_signups ds where ds.id = q.signup_id and ds.is_demo)
       and q.starts_at < p_start + interval '2 hours' and q.starts_at + make_interval(mins => q.duration_min) > p_start) then raise exception 'That time is already taken'; end if;
  -- One per player: any earlier booking (paid or free) with the same email or phone. Still allowed, but flagged.
  select count(*) into v_prior from public.training_signups s where not s.is_demo
    and (lower(btrim(coalesce(s.email,''))) = v_email or training.norm_phone(s.phone) = v_ph);
  if v_prior > 0 then v_note := 'REPEAT FREE — prior booking found (' || v_prior || ' earlier with same email or phone)'; end if;
  insert into public.training_signups(parent, athlete, age, program, programs, phone, email, message, package, group_size, price_cents, workout_types, additional_players,
    payment_status, heard_from, heard_from_other, utm_source, new_player, repeat_free, repeat_note)
  values (btrim(p_parent), btrim(p_athlete), p_age, v_progs[1], v_progs, btrim(p_phone), v_email, nullif(p_message,''), 'free_first', 1, 0, array[p_workout_type], '[]'::jsonb,
    'free_confirmed', p_heard_from, case when p_heard_from = 'Other' then left(nullif(btrim(coalesce(p_heard_from_other,'')),''),120) end, left(nullif(btrim(coalesce(p_utm_source,'')),''),100), true, v_prior > 0, v_note)
  returning id, ref into v_id, v_ref;
  insert into public.training_requests(signup_id, starts_at, program, format, workout_type, duration_min) values (v_id, p_start, v_progs[1], '1-on-1', p_workout_type, 120);
  insert into training.email_outbox(signup_id, kind, payload) values
    (v_id, 'coach_notice', jsonb_build_object('type','free_booking','flag', v_note, 'starts_at', p_start, 'workout_type', p_workout_type, 'heard_from', p_heard_from,
       'heard_from_other', case when p_heard_from = 'Other' then p_heard_from_other end, 'utm_source', p_utm_source)),
    (v_id, 'free_confirmation', jsonb_build_object('starts_at', p_start, 'workout_type', p_workout_type));
  return jsonb_build_object('ref', v_ref, 'repeat', v_prior > 0);
end $$;
grant execute on function public.training_book_free(text,text,integer,text[],text,text,text,timestamptz,text,boolean,text,text,text) to anon, authenticated;

-- Notify edge function: coach notice for a just-made free booking (by ref, last hour, unsent coach_notice only).
create or replace function public.training_free_notice_for(p_ref uuid) returns bigint language sql stable security definer set search_path to '' as $$
  select s.id from public.training_signups s where s.ref = p_ref and s.package = 'free_first' and s.created_at > now() - interval '1 hour'
$$;
revoke execute on function public.training_free_notice_for(uuid) from anon, authenticated, public;

-- Waiver step works for free bookings (by ref, like an unpaid hold) and reminders cover them like paid ones.
do $$ declare d text; begin
  d := pg_get_functiondef('public.training_waiver_ctx'::regproc);
  if d not like '%free_confirmed%' then
    d := replace(d, 'where ref = p_ref and payment_status = ''pending''', 'where ref = p_ref and payment_status in (''pending'',''free_confirmed'')');
    execute d; end if;
  d := pg_get_functiondef('public.training_waiver_due'::regproc);
  if d not like '%free_confirmed%' then
    d := replace(d, 'payment_status = ''paid''', 'payment_status in (''paid'',''free_confirmed'')');
    execute d; end if;
end $$;
