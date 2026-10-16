-- MEMBERSHIP v2 (additive only): config, date picks, reschedule limit, back office
create table if not exists public.membership_config (key text primary key, value text not null);
insert into public.membership_config values ('reschedule_limit_mode','per_month'),('reschedule_limit','1') on conflict (key) do update set value=excluded.value;
alter table public.membership_config enable row level security;
alter table public.memberships add column if not exists token_hash text unique,
  add column if not exists reschedules_used int not null default 0,
  add column if not exists reschedules_lifetime int not null default 0,
  add column if not exists program text, add column if not exists workout_type text default 'Gym',
  add column if not exists ref uuid unique, add column if not exists is_test boolean not null default true;
create table if not exists public.membership_pending (ref uuid primary key default gen_random_uuid(), tier text not null, parent text, athlete text, email text, phone text,
  program text, workout_type text, starts timestamptz[] not null, token_hash text, checkout_session text, created_at timestamptz default now(), consumed boolean default false);
alter table public.membership_pending enable row level security;
create table if not exists public.membership_sessions (id bigserial primary key, membership_id uuid references public.memberships(id) on delete cascade,
  starts_at timestamptz not null, status text not null default 'confirmed', period_start timestamptz, moved_from timestamptz, created_at timestamptz default now());
alter table public.membership_sessions enable row level security;
create index if not exists membership_sessions_start on public.membership_sessions(starts_at) where status='confirmed';

-- slot is free if real availability allows it AND no other membership session overlaps
create or replace function public.membership_slot_ok(p_start timestamptz, p_program text, p_type text, p_ignore bigint default null)
returns text language plpgsql stable security definer set search_path=public as $$
begin
  if p_start <> date_trunc('hour',p_start) then return 'Pick a time on the hour.'; end if;
  if p_start < now() + interval '24 hours' then return 'Pick a time at least 24 hours from now.'; end if;
  if p_start > now() + interval '4 weeks' then return 'Members can book up to 4 weeks ahead.'; end if;
  if p_type = 'OpenGroup' then
    if not exists (select 1 from training.open_group_sessions gs join training.open_groups g on g.id=gs.group_id
        where gs.starts_at=p_start and g.status in ('forming','running','confirmed','open') and not coalesce(g.is_demo,false)
        and g.capacity > (select count(*) from training.open_group_members om where om.group_id=g.id and om.status not in ('removed','canceled','cancelled'))
                        + (select count(*) from membership_sessions ms where ms.status='confirmed' and ms.starts_at=p_start and (p_ignore is null or ms.id<>p_ignore)))
      then return 'That open group time is full or not available.'; end if;
    return null;
  end if;
  if not training.hour_allowed(p_start, coalesce(p_type,'Gym')) then return 'That time is outside gym hours or the gym is closed.'; end if;
  if training.seats_left(p_start, p_program, null) < 1 then return 'That time is no longer available.'; end if;
  if exists (select 1 from membership_sessions s where s.status='confirmed' and (p_ignore is null or s.id<>p_ignore)
       and s.starts_at < p_start + interval '2 hours' and s.starts_at + interval '2 hours' > p_start) then return 'That time is no longer available.'; end if;
  return null;
end $$;

-- validate picks at checkout: plan needs exactly 4 picks
create or replace function public.membership_validate_picks(p_tier text, p_program text, p_type text, p_starts timestamptz[])
returns text language plpgsql stable security definer set search_path=public as $$
declare t timestamptz; e text;
begin
  if coalesce(array_length(p_starts,1),0) <> 4 then return 'Pick 4 session dates.'; end if;
  if (select count(distinct x) from unnest(p_starts) x) <> 4 then return 'Pick 4 different times.'; end if;
  foreach t in array p_starts loop e := membership_slot_ok(t,p_program,p_type); if e is not null then return e; end if; end loop;
  return null;
end $$;
revoke all on function public.membership_validate_picks(text,text,text,timestamptz[]) from anon, authenticated;
revoke all on function public.membership_slot_ok(timestamptz,text,text,bigint) from anon, authenticated;

-- member view by reschedule link token
create or replace function public.membership_view(p_token text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m memberships; lim int := (select value::int from membership_config where key='reschedule_limit'); mode text := (select value from membership_config where key='reschedule_limit_mode');
begin
  select * into m from memberships where token_hash = training.token_hash(p_token) and length(coalesce(p_token,''))>=32;
  if not found then return jsonb_build_object('error','invalid link'); end if;
  return jsonb_build_object('athlete',m.athlete,'program',m.program,'workout_type',m.workout_type,'tier',m.tier,'status',m.status,'canceling',m.cancel_at_period_end,'period_end',m.current_period_end,
    'sessions_left', m.sessions_granted+m.rollover+m.closure_rollover-m.sessions_used,'rollover',m.rollover,'granted',m.sessions_granted,
    'reschedules_left', greatest(0, lim - case when mode='per_month' then m.reschedules_used else m.reschedules_lifetime end),
    'picks_needed', greatest(0, m.sessions_granted+m.rollover+m.closure_rollover-m.sessions_used),
    'picks_due', case when m.tier='1on1_monthly_plus' then m.current_period_start + interval '14 days' end,
    'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'starts_at',s.starts_at) order by s.starts_at),'[]') from membership_sessions s where s.membership_id=m.id and s.status='confirmed' and s.starts_at>now()));
end $$;
grant execute on function public.membership_view(text) to anon, authenticated;

-- pick remaining dates (Monthly Plus second 4, or rollover credits)
create or replace function public.membership_pick(p_token text, p_start timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$
declare m memberships; e text;
begin
  select * into m from memberships where token_hash = training.token_hash(p_token) and length(coalesce(p_token,''))>=32 for update;
  if not found then return jsonb_build_object('error','invalid link'); end if;
  if m.status not in ('active','trialing') or m.payment_failed then return jsonb_build_object('error','Your membership is not active. Update your payment method in the billing portal.'); end if;
  if m.sessions_granted+m.rollover+m.closure_rollover-m.sessions_used < 1 then return jsonb_build_object('error','No sessions left this month.'); end if;
  if m.cancel_at_period_end and p_start > m.current_period_end then return jsonb_build_object('error','Your membership ends before that date.'); end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  e := membership_slot_ok(p_start, m.program, m.workout_type); if e is not null then return jsonb_build_object('error',e); end if;
  insert into membership_sessions(membership_id,starts_at,period_start) values (m.id,p_start,m.current_period_start);
  update memberships set sessions_used=sessions_used+1 where id=m.id;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.membership_pick(text,timestamptz) to anon, authenticated;

-- reschedule: ONE per billing month (config), resets at renewal
create or replace function public.membership_reschedule(p_token text, p_session bigint, p_start timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$
declare m memberships; s membership_sessions; e text; lim int := (select value::int from membership_config where key='reschedule_limit'); mode text := (select value from membership_config where key='reschedule_limit_mode');
begin
  select * into m from memberships where token_hash = training.token_hash(p_token) and length(coalesce(p_token,''))>=32 for update;
  if not found then return jsonb_build_object('error','invalid link'); end if;
  if (case when mode='per_month' then m.reschedules_used else m.reschedules_lifetime end) >= lim then
    return jsonb_build_object('error', case when mode='per_month' then 'You''ve already used your 1 reschedule for this billing month. It resets when your membership renews on '||to_char(m.current_period_end at time zone 'America/Denver','Mon DD')||'. Text (505) 469-3851 if something urgent came up.' else 'You''ve already used your reschedule for this plan.' end); end if;
  select * into s from membership_sessions where id=p_session and membership_id=m.id and status='confirmed' for update;
  if not found then return jsonb_build_object('error','Session not found.'); end if;
  if s.starts_at < now() + interval '24 hours' then return jsonb_build_object('error','Sessions can be moved up to 24 hours before they start.'); end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  e := membership_slot_ok(p_start, m.program, m.workout_type, s.id); if e is not null then return jsonb_build_object('error',e); end if;
  update membership_sessions set moved_from=starts_at, starts_at=p_start where id=s.id;
  update memberships set reschedules_used=reschedules_used+1, reschedules_lifetime=reschedules_lifetime+1 where id=m.id;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.membership_reschedule(text,bigint,timestamptz) to anon, authenticated;

-- back office
create or replace view public.membership_admin as
select m.*, case
  when m.status='canceled' then 'Canceled'
  when m.payment_failed then 'Payment failed'
  when m.cancel_at_period_end then 'Canceling, active until '||to_char(m.current_period_end at time zone 'America/Denver','Mon DD, YYYY')
  else initcap(m.status) end as status_label,
  (m.sessions_granted+m.rollover+m.closure_rollover-m.sessions_used) as sessions_left,
  (select count(*) from membership_sessions s where s.membership_id=m.id and s.status='confirmed' and s.starts_at>=coalesce(m.current_period_start,'-infinity')) as sessions_picked,
  case when m.tier='1on1_monthly_plus' then m.current_period_start + interval '14 days' end as picks_due,
  (m.tier='1on1_monthly_plus' and m.status='active' and m.current_period_start is not null
     and now() >= m.current_period_start + interval '10 days'
     and greatest(0, m.sessions_granted - m.sessions_used) > 0) as picks_flag,
  greatest(0, m.sessions_granted - m.sessions_used) as plan_sessions_remaining,
  (select value from membership_config where key='reschedule_limit_mode') as reschedule_mode
from public.memberships m;
revoke all on public.membership_admin from anon, authenticated;

create or replace function public.membership_pending_create(p_tier text, p_parent text, p_athlete text, p_email text, p_phone text, p_program text, p_type text, p_starts timestamptz[], p_token text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid; e text;
begin
  if p_tier not in ('1on1_monthly','1on1_monthly_plus','open_group_monthly') then raise exception 'Unknown plan'; end if;
  e := membership_validate_picks(p_tier,p_program,p_type,p_starts); if e is not null then raise exception '%', e; end if;
  insert into membership_pending(tier,parent,athlete,email,phone,program,workout_type,starts,token_hash) values (p_tier,p_parent,p_athlete,p_email,p_phone,p_program,coalesce(p_type,'Gym'),p_starts,training.token_hash(p_token)) returning ref into v;
  return v;
end $$;
revoke all on function public.membership_pending_create(text,text,text,text,text,text,text,timestamptz[],text) from anon, authenticated;

-- Monthly Plus reminder: log a reminder email (test) for flagged members, once per period
create or replace function public.membership_pick_reminders() returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
  insert into membership_email_log(membership_id,kind,to_email,subject,body)
  select a.id,'pick_reminder',a.parent_email,'Pick your remaining sessions by '||to_char(a.picks_due at time zone 'America/Denver','Mon DD'),
    'Hi! '||a.athlete||' has '||a.plan_sessions_remaining||' sessions left to pick this month. Monthly Plus sessions need to be picked before '||to_char(a.picks_due at time zone 'America/Denver','Mon DD')||' (the start of week 3). Use your reschedule link to pick them.'
  from membership_admin a where a.picks_flag and not exists (select 1 from membership_email_log l where l.membership_id=a.id and l.kind='pick_reminder' and l.created_at>=a.current_period_start);
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.membership_pick_reminders() from anon, authenticated;

-- free member slots for the next 4 weeks (same rules as booking)
create or replace function public.membership_slots(p_program text, p_type text default 'Gym') returns setof timestamptz language sql stable security definer set search_path=public as $$
  select h from generate_series(date_trunc('hour', now() + interval '25 hours'), now() + interval '4 weeks', interval '1 hour') h
  where extract(hour from h at time zone 'America/Denver') between 6 and 19 and membership_slot_ok(h, p_program, p_type) is null;
$$;
grant execute on function public.membership_slots(text,text) to anon, authenticated;

create or replace function public.membership_customer_for_token(p_token text) returns text language sql stable security definer set search_path=public as $$
  select stripe_customer_id from memberships where token_hash = training.token_hash(p_token) and length(coalesce(p_token,''))>=32 $$;
revoke all on function public.membership_customer_for_token(text) from anon, authenticated;


create or replace function public.coach_memberships(p_email text, p_pin text) returns jsonb language plpgsql volatile security definer set search_path=public as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  return jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'athlete',athlete,'parent_email',parent_email,'tier',tier,'status',status,'status_label',status_label,
    'sessions_granted',sessions_granted,'sessions_used',sessions_used,'sessions_left',sessions_left,
    'plan_sessions_remaining',greatest(0,sessions_granted-sessions_used),
    'rollover',rollover,'closure_rollover',closure_rollover,'reschedules_used',reschedules_used,
    'reschedule_mode',reschedule_mode,'reschedules_allowed',(select value::int from membership_config where key='reschedule_limit'),
    'picks_flag',picks_flag,'picks_due',picks_due,'sessions_picked',sessions_picked,
    'payment_failed',payment_failed,'cancel_at_period_end',cancel_at_period_end,'current_period_start',current_period_start,'current_period_end',current_period_end,'is_test',is_test) order by created_at desc),'[]') from membership_admin));
end $$;
grant execute on function public.coach_memberships(text,text) to anon, authenticated;
