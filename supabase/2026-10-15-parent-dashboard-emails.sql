-- Parent dashboard (my.html?token=...), Stripe payment marking, email outbox. Idempotent.
-- Run after 2026-10-15-session-types-players.sql.
create extension if not exists pgcrypto with schema extensions;

alter table public.training_signups add column if not exists token_hash text;
alter table public.training_signups add column if not exists paid_at timestamptz;
alter table public.training_signups add column if not exists amount_paid_cents int;
alter table public.training_signups add column if not exists stripe_session_id text;
create unique index if not exists training_signups_token_hash_idx on public.training_signups(token_hash) where token_hash is not null;
create unique index if not exists training_signups_stripe_session_idx on public.training_signups(stripe_session_id) where stripe_session_id is not null;
alter table public.training_requests add column if not exists moved_from timestamptz;
alter table public.training_requests add column if not exists moved_at timestamptz;
alter table public.training_requests add column if not exists moved_by text;

-- Emails waiting to be sent by the "notify" / "stripe-webhook" edge functions.
create table if not exists training.email_outbox (
  id bigserial primary key, signup_id bigint not null references public.training_signups(id) on delete cascade,
  kind text not null check (kind in ('confirmation','rescheduled')), payload jsonb not null default '{}',
  created_at timestamptz not null default now(), sent_at timestamptz, error text);
create index if not exists email_outbox_unsent_idx on training.email_outbox(signup_id) where sent_at is null;
alter table training.email_outbox enable row level security;

create or replace function training.token_hash(p_token text) returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') $$;

-- SERVICE ROLE ONLY: called by the Stripe webhook. Marks paid, issues a fresh dashboard token
-- (only its SHA-256 hash is stored), queues the confirmation email, returns the plaintext token once.
create or replace function public.training_mark_paid(p_ref uuid, p_stripe_session text, p_amount_cents int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.training_signups; v_token text;
begin
  select * into s from public.training_signups where ref = p_ref for update;
  if not found then return jsonb_build_object('error','unknown ref'); end if;
  if s.stripe_session_id = p_stripe_session then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  update public.training_signups set payment_status = 'paid', paid_at = now(), amount_paid_cents = p_amount_cents,
    stripe_session_id = p_stripe_session, token_hash = training.token_hash(v_token) where id = s.id;
  insert into training.email_outbox(signup_id, kind, payload) values (s.id, 'confirmation', jsonb_build_object('amount_cents', p_amount_cents));
  return jsonb_build_object('ok', true, 'signup_id', s.id, 'token', v_token);
end $$;
revoke all on function public.training_mark_paid(uuid, text, int) from public, anon, authenticated;
grant execute on function public.training_mark_paid(uuid, text, int) to service_role;

-- PUBLIC: parent dashboard data. The token is the access; nothing is returned for a wrong token.
create or replace function public.parent_view(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.training_signups;
begin
  if length(coalesce(p_token,'')) < 32 then return jsonb_build_object('error','invalid link'); end if;
  select * into s from public.training_signups where token_hash = training.token_hash(p_token);
  if not found then return jsonb_build_object('error','invalid link'); end if;
  return jsonb_build_object(
    'signup', jsonb_build_object('id', s.id, 'parent', s.parent, 'athlete', s.athlete, 'email', s.email,
      'additional_players', coalesce((select jsonb_agg(jsonb_build_object('athlete', p->>'athlete')) from jsonb_array_elements(s.additional_players) p), '[]'),
      'package', s.package, 'group_size', s.group_size, 'price_cents', s.price_cents, 'amount_paid_cents', s.amount_paid_cents,
      'payment_status', s.payment_status, 'paid_at', s.paid_at,
      'programs', coalesce(s.programs, array[s.program]), 'workout_types', s.workout_types),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'starts_at', r.starts_at, 'duration_min', r.duration_min,
        'workout_type', r.workout_type, 'program', r.program, 'status', r.status, 'moved_from', r.moved_from) order by r.starts_at), '[]')
      from public.training_requests r where r.signup_id = s.id and r.status <> 'declined'),
    'cutoff_hours', 24);
end $$;
revoke all on function public.parent_view(text) from public;
grant execute on function public.parent_view(text) to anon, authenticated;

-- PUBLIC: move one session. Same rules as booking + 24h cutoff on both old and new time.
-- The moved session goes back to 'requested' so a coach confirms it (existing flow); an email is queued.
create or replace function public.parent_move(p_token text, p_session bigint, p_start timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.training_signups; r public.training_requests; v_old timestamptz;
begin
  if length(coalesce(p_token,'')) < 32 then return jsonb_build_object('error','invalid link'); end if;
  select * into s from public.training_signups where token_hash = training.token_hash(p_token);
  if not found then return jsonb_build_object('error','invalid link'); end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  select * into r from public.training_requests where id = p_session and signup_id = s.id and status in ('requested','confirmed') for update;
  if not found then return jsonb_build_object('error','Session not found.'); end if;
  if r.starts_at < now() + interval '24 hours' then return jsonb_build_object('error','Sessions can be moved up to 24 hours before they start. Please call or text us.'); end if;
  if p_start < now() + interval '24 hours' or p_start > now() + interval '90 days' then return jsonb_build_object('error','Pick a time at least 24 hours from now.'); end if;
  if p_start = r.starts_at then return jsonb_build_object('error','That is the current time.'); end if;
  if not training.hour_allowed(p_start, r.workout_type) then return jsonb_build_object('error', 'That time is outside '||r.workout_type||' hours or the gym is closed.'); end if;
  if exists (select 1 from public.training_requests o where o.signup_id = s.id and o.id <> r.id and o.status in ('requested','confirmed')
      and o.starts_at < p_start + interval '2 hours' and o.starts_at + make_interval(mins => o.duration_min) > p_start) then
    return jsonb_build_object('error','That overlaps another of your sessions.'); end if;
  if training.seats_left(p_start, r.program, r.id) < 1 then return jsonb_build_object('error','That time is no longer available.'); end if;
  if r.format = '1-on-1' and exists (select 1 from public.training_requests q where q.id <> r.id and q.status in ('requested','confirmed')
      and q.starts_at < p_start + interval '2 hours' and q.starts_at + make_interval(mins => q.duration_min) > p_start) then
    return jsonb_build_object('error','That time is already taken.'); end if;
  v_old := r.starts_at;
  update public.training_requests set starts_at = p_start, status = 'requested', moved_from = v_old, moved_at = now(), moved_by = 'parent' where id = r.id;
  insert into training.email_outbox(signup_id, kind, payload) values (s.id, 'rescheduled', jsonb_build_object('session_id', r.id, 'from', v_old, 'to', p_start));
  return jsonb_build_object('ok', true, 'from', v_old, 'to', p_start);
end $$;
revoke all on function public.parent_move(text, bigint, timestamptz) from public;
grant execute on function public.parent_move(text, bigint, timestamptz) to anon, authenticated;

-- SERVICE ROLE ONLY: edge functions read queued emails (with everything a template needs) and mark them sent.
create or replace function public.training_outbox_for(p_signup bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'signup', (select to_jsonb(s) - 'token_hash' from public.training_signups s where s.id = p_signup),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.starts_at), '[]') from public.training_requests r where r.signup_id = p_signup and r.status <> 'declined'),
    'emails', (select coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]') from training.email_outbox o where o.signup_id = p_signup and o.sent_at is null));
$$;
create or replace function public.training_outbox_done(p_id bigint, p_error text) returns void
language sql security definer set search_path = '' as $$
  update training.email_outbox set sent_at = case when p_error is null then now() end, error = p_error where id = p_id; $$;
create or replace function public.training_signup_by_token(p_token text) returns bigint
language sql stable security definer set search_path = '' as $$
  select id from public.training_signups where token_hash = training.token_hash(p_token); $$;
revoke all on function public.training_outbox_for(bigint) from public, anon, authenticated;
revoke all on function public.training_outbox_done(bigint, text) from public, anon, authenticated;
revoke all on function public.training_signup_by_token(text) from public, anon, authenticated;
grant execute on function public.training_outbox_for(bigint), public.training_outbox_done(bigint, text), public.training_signup_by_token(text) to service_role;
