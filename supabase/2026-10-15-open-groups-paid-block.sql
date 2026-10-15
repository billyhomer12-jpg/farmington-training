-- Group slots block other bookings only once the group has >= 1 PAID player. Empty/unpaid-hold groups leave the slot open;
-- if a 1-on-1 (or own group) takes that slot, the group drops off the public list and its unpaid holds can't pay.
create or replace function training.og_slot_taken(p_start timestamptz, p_min int default 120) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from training.open_group_sessions s join training.open_groups g on g.id = s.group_id and g.status <> 'cancelled'
    where s.starts_at < p_start + make_interval(mins => p_min) and s.starts_at + make_interval(mins => s.duration_min) > p_start
      and exists (select 1 from training.open_group_members m where m.group_id = g.id and m.status = 'paid')) $$;

-- Any other active booking (1-on-1 or own group) overlapping a session of this group.
create or replace function training.og_conflicts(p_group bigint) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(distinct g.starts_at), '[]') from training.open_group_sessions g join public.training_requests q
    on q.status in ('requested','confirmed')
   and q.starts_at < g.starts_at + make_interval(mins => g.duration_min) and q.starts_at + make_interval(mins => q.duration_min) > g.starts_at
  where g.group_id = p_group $$;

-- Public list hides groups whose slot was taken by another booking.
create or replace function public.training_open_groups() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(training.og_json(g.id) order by (select min(starts_at) from training.open_group_sessions s where s.group_id = g.id)), '[]')
  from training.open_groups g where g.status <> 'cancelled' and jsonb_array_length(training.og_conflicts(g.id)) = 0
    and (select min(starts_at) from training.open_group_sessions s where s.group_id = g.id) > now() + interval '2 hours' $$;

-- Payment after the slot was lost: keep it paid but flag it (the static Stripe link can't be stopped server-side).
create or replace function training.og_paid_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and jsonb_array_length(training.og_conflicts(new.group_id)) > 0 then
    new.flag := 'Refund/move needed (group time was booked by another session before payment)';
  end if;
  return new;
end $$;
drop trigger if exists og_paid_guard on training.open_group_members;
create trigger og_paid_guard before update on training.open_group_members for each row execute function training.og_paid_guard();

-- Slot kinds: 'group' only for a booked group (paid player) or an own-group booking.
create or replace function public.training_slot_kinds(p_from timestamptz, p_to timestamptz) returns table(starts_at timestamptz, kind text)
language sql stable security definer set search_path = '' as $$
  select h, case
    when training.og_slot_taken(h, 60) or exists (select 1 from public.training_requests r where r.status in ('requested','confirmed') and r.format = 'Small group'
         and r.starts_at < h + interval '1 hour' and r.starts_at + make_interval(mins => r.duration_min) > h) then 'group'
    when exists (select 1 from public.training_requests r where r.status in ('requested','confirmed') and r.format = '1-on-1'
         and r.starts_at < h + interval '1 hour' and r.starts_at + make_interval(mins => r.duration_min) > h) then '1on1' end
  from generate_series(date_trunc('hour', greatest(p_from, now())), least(p_to, now() + interval '90 days'), interval '1 hour') h
  where extract(hour from h at time zone 'America/Denver') between 5 and 21 $$;

-- coach warning wording
CREATE OR REPLACE FUNCTION public.coach_save_group(p_email text, p_pin text, p_id bigint, p_label text, p_weekdays integer[], p_start_hour integer, p_first_date date, p_capacity integer, p_age_min integer, p_age_max integer, p_status text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'warning', case when jsonb_array_length(v_c) > 0 then 'Heads-up: another session (1-on-1 or own group) is already booked at ' || jsonb_array_length(v_c) || ' of these times, so this group is hidden from parents and won''t take players until that session moves.' end);
exception when others then return jsonb_build_object('error', sqlerrm);
end $function$

;
