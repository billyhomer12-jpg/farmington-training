-- DEAL-4 / LAUNCH-3: deal bonus tracking (server side of DEALS-SLOT).
-- training.deals mirrors window.SITE.deals in config.js (keep both in sync). A null start_at never matches
-- (Grand Opening stays off until LAUNCH_AT is set: update training.deals set start_at = '<LAUNCH_AT>' where id = 'grand-opening-2026').
-- end_at null => start_at + 72 hours. The $75 single is never eligible. Use-by dates that land in a gym closure move to the day after it.
create table if not exists training.deals (
  id text primary key, status text not null default 'approved', headline text not null,
  start_at timestamptz, end_at timestamptz, eligible text[] not null,
  redeem_by date, redeem_days int, line text not null);
alter table training.deals enable row level security;
revoke all on training.deals from anon, authenticated;
insert into training.deals(id,status,headline,start_at,end_at,eligible,redeem_by,redeem_days,line) values
 ('holiday-4pack-2026','approved','Holiday 4-Pack Bonus','2026-11-26T00:00:00-07:00','2026-11-30T23:59:59-07:00',
  array['1on1','open_group','group2','group3','group4'],'2027-03-31',null,'Includes 1 bonus session, use by {date}'),
 ('grand-opening-2026','approved','Grand Opening: Founding Family Bonus',null,null,
  array['1on1','open_group','group2','group3','group4'],null,90,'Includes 1 Founding Family bonus session, use by {date}')
on conflict (id) do update set status=excluded.status, headline=excluded.headline, end_at=excluded.end_at, eligible=excluded.eligible,
  redeem_by=excluded.redeem_by, redeem_days=excluded.redeem_days, line=excluded.line;

create or replace function training.deal_bonus(p_package text, p_paid_at timestamptz) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare d training.deals; u date; c record;
begin
  if p_paid_at is null or p_package is null or p_package = 'single' then return null; end if;
  select * into d from training.deals x where x.status in ('approved','live') and x.start_at is not null
    and p_package = any(x.eligible) and p_paid_at >= x.start_at and p_paid_at < coalesce(x.end_at, x.start_at + interval '72 hours')
    order by x.start_at limit 1;
  if not found then return null; end if;
  u := coalesce(d.redeem_by, ((p_paid_at at time zone 'America/Denver') + make_interval(days => d.redeem_days))::date);
  for c in select starts_at, ends_at from public.training_gym_closures order by starts_at loop
    if u >= (c.starts_at at time zone 'America/Denver')::date and u < (c.ends_at at time zone 'America/Denver')::date then
      u := (c.ends_at at time zone 'America/Denver')::date; end if;
  end loop;
  return jsonb_build_object('id', d.id, 'headline', d.headline, 'sessions', 1, 'use_by', u,
    'line', replace(d.line, '{date}', to_char(u, 'FMMM/FMDD/YY')));
end $$;
revoke all on function training.deal_bonus(text, timestamptz) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.training_booking_summary(p_ref uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.training_signups; j jsonb; signed0 boolean;
begin
  select * into s from public.training_signups where ref = p_ref and not is_demo;
  if not found then return null; end if;
  signed0 := exists (select 1 from training.waivers w where w.signup_id = s.id and w.athlete_index = 0);
  j := jsonb_build_object(
    'package', s.package, 'athlete', split_part(s.athlete, ' ', 1), 'players', jsonb_array_length(training.athletes(s)),
    'payment_status', s.payment_status, 'amount_cents', coalesce(s.amount_paid_cents, s.price_cents),
    'group', (select g.label from training.open_group_members m join training.open_groups g on g.id = m.group_id where m.signup_id = s.id and m.status in ('held','paid') limit 1),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('starts_at', r.starts_at, 'duration_min', r.duration_min, 'workout_type', r.workout_type, 'status', r.status) order by r.starts_at), '[]')
                 from public.training_requests r where r.signup_id = s.id and r.status in ('requested','confirmed')),
    'waivers_needed', jsonb_array_length(training.athletes(s)),
    'waivers_signed', (select count(distinct w.athlete_index) from training.waivers w where w.signup_id = s.id),
    'my_waiver_signed', signed0,
    'bonus', case when s.payment_status = 'paid' then training.deal_bonus(s.package, s.paid_at) end);
  if s.payment_status = 'paid' and not signed0 then
    j := j || jsonb_build_object('sign_token', training.waiver_link(s.id, 0)->>'token');
  end if;
  return j;
end $function$;

CREATE OR REPLACE FUNCTION public.coach_data(p_email text, p_pin text, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  return jsonb_build_object(
    'name', (select name from training.coach_pins where email = lower(p_email)),
    'signups', (select coalesce(jsonb_agg((to_jsonb(s) - 'ref') || jsonb_build_object('bonus', training.deal_bonus(s.package, s.paid_at)) order by s.created_at desc), '[]') from public.training_signups s),
    'requests', (select coalesce(jsonb_agg(to_jsonb(r) order by r.starts_at), '[]') from public.training_requests r where r.starts_at between p_from and p_to),
    'blocks', (select coalesce(jsonb_agg(to_jsonb(b) order by b.starts_at), '[]') from public.training_blocks b where b.ends_at > p_from and b.starts_at < p_to),
    'closures', (select coalesce(jsonb_agg(to_jsonb(c) order by c.starts_at), '[]') from public.training_gym_closures c where c.ends_at > p_from and c.starts_at < p_to),
    'capacity', (select jsonb_object_agg(program, capacity) from public.training_capacity));
end $function$;

CREATE OR REPLACE FUNCTION public.training_mark_paid(p_ref uuid, p_stripe_session text, p_amount_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if s.package = 'open_group' and m.id is not null and not s.is_demo then
    insert into training.email_outbox(signup_id, kind, payload) values (s.id, 'coach_notice', jsonb_build_object('type', 'join', 'group', training.og_json(m.group_id, true) - 'roster',
      'flag', (select flag from training.open_group_members where id = m.id)));
  end if;
  insert into training.email_outbox(signup_id, kind, payload) values (s.id, 'confirmation', jsonb_build_object('amount_cents', p_amount_cents, 'bonus', training.deal_bonus(s.package, now())));
  return jsonb_build_object('ok', true, 'signup_id', s.id, 'token', v_token);
end $function$;
