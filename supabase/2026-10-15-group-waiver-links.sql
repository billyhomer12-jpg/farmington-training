-- Group waivers via per-athlete share links. Idempotent. Run after 2026-10-15-online-waivers.sql.
-- Rule: athlete 1 (index 0, the booking parent's athlete) must sign before payment. Other group athletes sign
-- from their own 30-day link (book.html?sign=<token>&athlete=N). Single / 1-on-1 bookings are unchanged.

-- Optional email per additional player (used for that athlete's automatic reminder).
do $do$ declare d text; begin
  d := pg_get_functiondef('public.training_book(text,text,integer,text,text,text,text,timestamp with time zone[],text,text,integer,text[],text[],text[],jsonb)'::regprocedure);
  if position('''email'', case' in d) = 0 then
    d := replace(d, $r$'phone', btrim(e->>'phone')))$r$,
      $r$'phone', btrim(e->>'phone'), 'email', case when lower(btrim(coalesce(e->>'email',''))) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(btrim(e->>'email')) end))$r$);
    if position('''email'', case' in d) = 0 then raise exception 'training_book patch did not apply'; end if;
    execute d;
  end if;
end $do$;

-- One signing link per (booking, athlete). Private schema, RLS on, no policies: only the service role reads it.
-- The token only lets someone sign that one athlete's waiver; it is kept so the booking parent can re-share it.
create table if not exists training.waiver_links (
  signup_id bigint not null references public.training_signups(id) on delete cascade,
  athlete_index int not null check (athlete_index between 0 and 3),
  token text not null unique, expires_at timestamptz not null,
  reminders int not null default 0, reminded_at timestamptz,
  created_at timestamptz not null default now(), primary key (signup_id, athlete_index));
alter table training.waiver_links enable row level security;

-- Athletes now carry the optional per-athlete email (index 0 = booking parent's email).
create or replace function training.athletes(s public.training_signups) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_array(jsonb_build_object('index', 0, 'athlete', s.athlete, 'parent', s.parent, 'email', s.email))
    || coalesce((select jsonb_agg(jsonb_build_object('index', n::int, 'athlete', p->>'athlete', 'parent', p->>'parent', 'email', p->>'email') order by n)
                 from jsonb_array_elements(coalesce(s.additional_players,'[]')) with ordinality e(p, n)), '[]') $$;

-- Get (or rotate when < 7 days left) the 30-day link token for one athlete.
create or replace function training.waiver_link(p_signup bigint, p_idx int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare l training.waiver_links;
begin
  select * into l from training.waiver_links where signup_id = p_signup and athlete_index = p_idx;
  if l.token is null or l.expires_at < now() + interval '7 days' then
    insert into training.waiver_links(signup_id, athlete_index, token, expires_at)
    values (p_signup, p_idx, translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_'), now() + interval '30 days')
    on conflict (signup_id, athlete_index) do update set token = excluded.token, expires_at = excluded.expires_at
    returning * into l;
  end if;
  return jsonb_build_object('token', l.token, 'expires_at', l.expires_at);
end $$;

-- SERVICE ROLE ONLY: signing context. p_wtoken may be a per-athlete link token (=> "only" that athlete)
-- or the older booking-wide reminder token.
drop function if exists public.training_waiver_ctx(uuid, text, text);
create or replace function public.training_waiver_ctx(p_ref uuid, p_token text, p_wtoken text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.training_signups; v training.waiver_versions; v_only int;
begin
  if p_ref is not null then
    select * into s from public.training_signups where ref = p_ref and payment_status = 'pending' and created_at > now() - interval '48 hours';
  elsif length(coalesce(p_token,'')) >= 32 then
    select * into s from public.training_signups where token_hash = training.token_hash(p_token);
  elsif length(coalesce(p_wtoken,'')) >= 32 then
    select t.* into s from training.waiver_links l join public.training_signups t on t.id = l.signup_id where l.token = p_wtoken and l.expires_at > now();
    if s.id is not null then select athlete_index into v_only from training.waiver_links where token = p_wtoken;
    else select * into s from public.training_signups where waiver_token_hash = training.token_hash(p_wtoken) and waiver_token_expires > now(); end if;
  end if;
  if s.id is null then return jsonb_build_object('error','invalid link'); end if;
  select * into v from training.waiver_versions where active order by created_at desc limit 1;
  return jsonb_build_object('signup_id', s.id, 'ref', s.ref, 'email', s.email, 'parent', s.parent, 'payment_status', s.payment_status,
    'package', s.package, 'only', v_only, 'athletes', training.athletes(s),
    'signed', (select coalesce(jsonb_agg(w.athlete_index order by w.athlete_index), '[]') from training.waivers w where w.signup_id = s.id),
    'version', jsonb_build_object('version', v.version, 'title', v.title, 'body', v.body, 'sha256', v.body_sha256));
end $$;

-- SERVICE ROLE ONLY: share links for every unsigned athlete except athlete 1.
-- Credential: booking ref (booking < 48 h old, paid or not: book.html before/after Stripe) or dashboard token (my.html).
create or replace function public.training_waiver_share_links(p_ref uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.training_signups;
begin
  if p_ref is not null then select * into s from public.training_signups where ref = p_ref and created_at > now() - interval '48 hours';
  elsif length(coalesce(p_token,'')) >= 32 then select * into s from public.training_signups where token_hash = training.token_hash(p_token); end if;
  if s.id is null then return jsonb_build_object('error','invalid link'); end if;
  return jsonb_build_object('links', coalesce((select jsonb_agg(jsonb_build_object('index', (a->>'index')::int, 'athlete', a->>'athlete', 'parent', a->>'parent')
      || training.waiver_link(s.id, (a->>'index')::int) order by (a->>'index')::int)
    from jsonb_array_elements(training.athletes(s)) a
    where (a->>'index')::int > 0 and not exists (select 1 from training.waivers w where w.signup_id = s.id and w.athlete_index = (a->>'index')::int)), '[]'));
end $$;

-- PUBLIC: payment gate. Payment needs only athlete 1 (index 0); total/total_signed track the group (n of N).
drop function if exists public.training_waiver_status(uuid);
create or replace function public.training_waiver_status(p_ref uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('needed', 1,
    'signed', (select count(*) from training.waivers w where w.signup_id = s.id and w.athlete_index = 0),
    'total', jsonb_array_length(training.athletes(s)),
    'total_signed', (select count(*) from training.waivers w where w.signup_id = s.id))
  from public.training_signups s where s.ref = p_ref $$;

-- SERVICE ROLE ONLY: what to remind for one booking. Marks the links reminded.
-- Returns unsigned athletes with their link + email (null = no email for that athlete's parent).
create or replace function public.training_waiver_remind_plan(p_signup bigint, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.training_signups; v jsonb;
begin
  select * into s from public.training_signups where id = p_signup for update;
  if not found then return jsonb_build_object('error','unknown signup'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('index', (a->>'index')::int, 'athlete', a->>'athlete', 'parent', a->>'parent', 'email', a->>'email')
           || training.waiver_link(s.id, (a->>'index')::int) order by (a->>'index')::int), '[]') into v
  from jsonb_array_elements(training.athletes(s)) a
  where not exists (select 1 from training.waivers w where w.signup_id = s.id and w.athlete_index = (a->>'index')::int)
    and (p_force or not exists (select 1 from training.waiver_links l where l.signup_id = s.id and l.athlete_index = (a->>'index')::int
                                 and (l.reminders >= 4 or l.reminded_at > now() - interval '2 days')));
  update training.waiver_links l set reminders = reminders + 1, reminded_at = now()
   where l.signup_id = s.id and l.athlete_index in (select (x->>'index')::int from jsonb_array_elements(v) x);
  return jsonb_build_object('signup', jsonb_build_object('id', s.id, 'parent', s.parent, 'email', s.email, 'athlete', s.athlete,
    'additional_players', s.additional_players, 'package', s.package), 'unsigned', v);
end $$;

-- SERVICE ROLE ONLY: paid bookings (last 60 days) that still have an unsigned athlete -> daily reminder run.
create or replace function public.training_waiver_due() returns setof bigint language sql stable security definer set search_path = '' as $$
  select s.id from public.training_signups s
  where s.payment_status = 'paid' and s.created_at > now() - interval '60 days'
    and jsonb_array_length(training.athletes(s)) > (select count(*) from training.waivers w where w.signup_id = s.id) $$;

-- COACH (PIN): also return athlete names per booking so the back office can name unsigned athletes.
create or replace function public.coach_waivers(p_email text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  return jsonb_build_object('waivers', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'signup_id', w.signup_id, 'athlete_index', w.athlete_index,
      'athlete_name', w.athlete_name, 'athlete_dob', w.athlete_dob, 'emergency_name', w.emergency_name, 'emergency_phone', w.emergency_phone,
      'medical_notes', w.medical_notes, 'photo_opt_in', w.photo_opt_in, 'signer_name', w.signer_name, 'signer_relationship', w.signer_relationship,
      'version', w.version, 'signed_at', w.signed_at, 'has_pdf', w.pdf_path is not null) order by w.signed_at desc), '[]') from training.waivers w),
    'needed', (select coalesce(jsonb_object_agg(s.id, jsonb_array_length(training.athletes(s))), '{}') from public.training_signups s),
    'athletes', (select coalesce(jsonb_object_agg(s.id, (select jsonb_agg(jsonb_build_object('index', (a->>'index')::int, 'athlete', a->>'athlete', 'email', a->>'email')) from jsonb_array_elements(training.athletes(s)) a)), '{}') from public.training_signups s));
end $$;

-- Daily reminder job: pg_cron + pg_net call waiver-sign {action:'cron'} with a shared secret.
create table if not exists training.app_secrets (name text primary key, value text not null);
alter table training.app_secrets enable row level security;
insert into training.app_secrets(name, value) values ('waiver_cron', translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_')) on conflict (name) do nothing;
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'waiver-reminders';
select cron.schedule('waiver-reminders', '0 17 * * *', $c$
  select net.http_post(url := 'https://jrcozcrfbjcsuqkmoaki.supabase.co/functions/v1/waiver-sign',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('action','cron','key',(select value from training.app_secrets where name = 'waiver_cron')))
$c$);

revoke all on function training.waiver_link(bigint, int) from public, anon, authenticated;
revoke all on function public.training_waiver_ctx(uuid, text, text), public.training_waiver_share_links(uuid, text),
  public.training_waiver_remind_plan(bigint, boolean), public.training_waiver_due() from public, anon, authenticated;
grant execute on function public.training_waiver_ctx(uuid, text, text), public.training_waiver_share_links(uuid, text),
  public.training_waiver_remind_plan(bigint, boolean), public.training_waiver_due() to service_role;
revoke all on function public.training_waiver_status(uuid), public.coach_waivers(text, text) from public;
grant execute on function public.training_waiver_status(uuid), public.coach_waivers(text, text) to anon, authenticated;

-- SERVICE ROLE ONLY: verify the cron caller's key.
create or replace function public.training_cron_key_ok(p text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from training.app_secrets where name = 'waiver_cron' and value = p and length(p) > 20) $$;
revoke all on function public.training_cron_key_ok(text) from public, anon, authenticated;
grant execute on function public.training_cron_key_ok(text) to service_role;
