-- Online waivers (sign before payment). Idempotent. Run after 2026-10-15-parent-dashboard-emails.sql.
-- Tables live in the private "training" schema with RLS on and NO policies: only security-definer RPCs
-- (granted to service_role, used by the waiver-sign / waiver-admin edge functions) can touch them.
create extension if not exists pgcrypto with schema extensions;

create table if not exists training.waiver_versions (
  version text primary key, title text not null, body text not null,
  body_sha256 text generated always as (encode(extensions.digest(body, 'sha256'), 'hex')) stored,
  active boolean not null default false, created_at timestamptz not null default now());
alter table training.waiver_versions enable row level security;

insert into training.waiver_versions(version, title, body, active) values ('2026-10-v1', 'Participation Waiver, Release & Terms', $wv$# Participation Waiver, Release & Terms

Four Corners Hoops & Performance · Ages 12–18 · San Juan College Health & Human Performance Center, 4601 College Blvd, Farmington, NM 87402 · (505) 231-0725 · fourcornershoopsandperformance@gmail.com

Please read carefully. This form gives up legal rights. A parent or legal guardian must sign before the athlete trains. "Released Parties" means Four Corners Hoops & Performance, its owners and coaches (including Billy Homer and Devin Collins), staff, volunteers, and agents, and the facility, San Juan College, and their employees.

## 1. Assumption of all risks

Basketball, weightlifting, and conditioning carry risks, known and unknown, including sprains, tears, broken bones, concussions, collisions, dropped weights, heat illness, cardiac events, permanent injury, and death. Some risks cannot be removed even with proper care. I knowingly and voluntarily accept all risks, known and unknown, for myself and the athlete.

## 2. Release, waiver & covenant not to sue

To the fullest extent allowed by New Mexico law, I, for myself, the athlete, and our heirs, release and waive all claims against the Released Parties for any injury, illness, death, loss, or damage connected to training, including claims caused by the Released Parties' ordinary negligence, and I agree not to sue them. This does not cover gross negligence or intentional misconduct.

## 3. Indemnity

I will indemnify, defend, and hold harmless the Released Parties from any claim, cost, or attorney fees brought by me, the athlete, or anyone on our behalf.

## 4. No insurance · Medical care

Four Corners carries no liability or accident insurance. I will rely on my own health insurance. The athlete is fit to train, and I will tell a coach about any condition, injury, or medication. If I can't be reached, I authorize coaches to call 911 and obtain emergency treatment, and I am responsible for all medical costs. The athlete will follow coach instructions and facility rules.

## 5. Payment · Photos · Severability

Packages are 4 two-hour sessions, paid up front. Reschedule via your email link up to 24 hours ahead; refunds are at the coaches' discretion. Photos/video are used publicly only if checked below. If any part of this form is unenforceable, the rest remains in full effect. New Mexico law governs. I am the parent/guardian, 18+, have read this, and sign voluntarily.$wv$, true)
on conflict (version) do nothing;

-- One row per athlete per booking. signup_id is SET NULL on delete so signed waivers are kept indefinitely;
-- the parent/athlete snapshot columns keep them identifiable.
create table if not exists training.waivers (
  id uuid primary key default gen_random_uuid(),
  signup_id bigint references public.training_signups(id) on delete set null,
  athlete_index int not null default 0 check (athlete_index between 0 and 3),
  booking_ref uuid, parent_email text,
  athlete_name text not null check (length(athlete_name) between 3 and 200),
  athlete_dob date not null check (athlete_dob > date '1990-01-01' and athlete_dob < current_date),
  emergency_name text not null check (length(emergency_name) between 2 and 200),
  emergency_phone text not null check (length(regexp_replace(emergency_phone, '\D', '', 'g')) >= 10 and length(emergency_phone) <= 50),
  medical_notes text check (length(medical_notes) <= 2000),
  photo_opt_in boolean not null default false,
  signer_name text not null check (length(signer_name) between 3 and 200),
  signer_relationship text not null check (signer_relationship in ('Parent','Legal guardian')),
  consent boolean not null check (consent),
  version text not null references training.waiver_versions(version),
  version_sha256 text not null,
  signature_path text not null, signature_sha256 text not null,
  pdf_path text, pdf_sha256 text,
  signed_at timestamptz not null default now(),
  ip text, user_agent text check (length(user_agent) <= 1000));
create unique index if not exists waivers_signup_athlete_idx on training.waivers(signup_id, athlete_index) where signup_id is not null;
alter table training.waivers enable row level security;

-- Waiver-only signing token for reminder / resend links (book.html?sign=...). Only the hash is stored.
alter table public.training_signups add column if not exists waiver_token_hash text;
alter table public.training_signups add column if not exists waiver_token_expires timestamptz;
alter table public.training_signups add column if not exists waiver_reminded_at timestamptz;

alter table training.email_outbox drop constraint if exists email_outbox_kind_check;
alter table training.email_outbox add constraint email_outbox_kind_check check (kind in ('confirmation','rescheduled','waiver_copy','waiver_reminder'));

-- Private Storage bucket (no storage.objects policies => only the service role can read/write).
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('waivers', 'waivers', false, 5242880, array['application/pdf','image/png'])
on conflict (id) do update set public = false;

-- Athletes on a booking: index 0 = primary athlete, 1..3 = additional players.
create or replace function training.athletes(s public.training_signups) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_array(jsonb_build_object('index', 0, 'athlete', s.athlete, 'parent', s.parent))
    || coalesce((select jsonb_agg(jsonb_build_object('index', n::int, 'athlete', p->>'athlete', 'parent', p->>'parent') order by n)
                 from jsonb_array_elements(coalesce(s.additional_players,'[]')) with ordinality e(p, n)), '[]') $$;

-- SERVICE ROLE ONLY: resolve a signing credential to a signup.
--  ref   = unguessable booking ref, only while the booking is unpaid and < 48 h old (book.html, before payment)
--  token = parent dashboard token (my.html)    wtoken = waiver-only token from a reminder / resend email (30 days)
create or replace function public.training_waiver_ctx(p_ref uuid, p_token text, p_wtoken text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.training_signups; v training.waiver_versions;
begin
  if p_ref is not null then
    select * into s from public.training_signups where ref = p_ref and payment_status = 'pending' and created_at > now() - interval '48 hours';
  elsif length(coalesce(p_token,'')) >= 32 then
    select * into s from public.training_signups where token_hash = training.token_hash(p_token);
  elsif length(coalesce(p_wtoken,'')) >= 32 then
    select * into s from public.training_signups where waiver_token_hash = training.token_hash(p_wtoken) and waiver_token_expires > now();
  end if;
  if s.id is null then return jsonb_build_object('error','invalid link'); end if;
  select * into v from training.waiver_versions where active order by created_at desc limit 1;
  return jsonb_build_object('signup_id', s.id, 'ref', s.ref, 'email', s.email, 'parent', s.parent, 'payment_status', s.payment_status,
    'athletes', training.athletes(s),
    'signed', (select coalesce(jsonb_agg(w.athlete_index order by w.athlete_index), '[]') from training.waivers w where w.signup_id = s.id),
    'version', jsonb_build_object('version', v.version, 'title', v.title, 'body', v.body, 'sha256', v.body_sha256));
end $$;

-- SERVICE ROLE ONLY: insert one signed waiver (the edge function has already validated + uploaded the files).
create or replace function public.training_waiver_insert(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.training_signups; v training.waiver_versions; v_id uuid; v_n int;
begin
  select * into s from public.training_signups where id = (p->>'signup_id')::bigint for update;
  if not found then return jsonb_build_object('error','invalid link'); end if;
  v_n := jsonb_array_length(training.athletes(s));
  if (p->>'athlete_index')::int not between 0 and v_n - 1 then return jsonb_build_object('error','Unknown athlete'); end if;
  if exists (select 1 from training.waivers where signup_id = s.id and athlete_index = (p->>'athlete_index')::int) then
    return jsonb_build_object('error','This athlete''s waiver is already signed.'); end if;
  select * into v from training.waiver_versions where version = p->>'version';
  if not found or v.body_sha256 <> p->>'version_sha256' then return jsonb_build_object('error','The waiver text changed. Please reload the page.'); end if;
  insert into training.waivers(id, signup_id, athlete_index, booking_ref, parent_email, athlete_name, athlete_dob, emergency_name, emergency_phone,
    medical_notes, photo_opt_in, signer_name, signer_relationship, consent, version, version_sha256, signature_path, signature_sha256, pdf_path, pdf_sha256, signed_at, ip, user_agent)
  values ((p->>'id')::uuid, s.id, (p->>'athlete_index')::int, s.ref, s.email, btrim(p->>'athlete_name'), (p->>'athlete_dob')::date, btrim(p->>'emergency_name'), btrim(p->>'emergency_phone'),
    nullif(btrim(coalesce(p->>'medical_notes','')),''), coalesce((p->>'photo_opt_in')::boolean,false), btrim(p->>'signer_name'), p->>'signer_relationship', (p->>'consent')::boolean,
    v.version, v.body_sha256, p->>'signature_path', p->>'signature_sha256', p->>'pdf_path', p->>'pdf_sha256', (p->>'signed_at')::timestamptz, left(p->>'ip',100), left(p->>'user_agent',1000))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id,
    'remaining', v_n - (select count(*) from training.waivers where signup_id = s.id));
end $$;

-- SERVICE ROLE ONLY: issue a fresh waiver-only token (30 days) for a reminder / resend email; returns plaintext once.
create or replace function public.training_waiver_issue_token(p_signup bigint, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_token text; s public.training_signups;
begin
  select * into s from public.training_signups where id = p_signup for update;
  if not found then return jsonb_build_object('error','unknown signup'); end if;
  if not exists (select 1 from jsonb_array_elements(training.athletes(s)) a
                 where not exists (select 1 from training.waivers w where w.signup_id = s.id and w.athlete_index = (a->>'index')::int)) then
    return jsonb_build_object('error','All waivers are already signed.'); end if;
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  update public.training_signups set waiver_token_hash = training.token_hash(v_token), waiver_token_expires = now() + interval '30 days', waiver_reminded_at = now() where id = s.id;
  update training.email_outbox set sent_at = now(), error = 'superseded' where signup_id = s.id and kind = 'waiver_reminder' and sent_at is null;
  insert into training.email_outbox(signup_id, kind, payload) values (s.id, 'waiver_reminder', jsonb_build_object('reason', p_kind));
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

-- SERVICE ROLE ONLY: queue the parent's copy (payload carries a short-lived signed URL to the PDF).
create or replace function public.training_waiver_queue_copy(p_signup bigint, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into training.email_outbox(signup_id, kind, payload) values (p_signup, 'waiver_copy', p_payload) $$;

-- PUBLIC: is every athlete on this unpaid booking signed? Used to unlock the Stripe link. Returns counts only.
create or replace function public.training_waiver_status(p_ref uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('needed', jsonb_array_length(training.athletes(s)),
    'signed', (select count(*) from training.waivers w where w.signup_id = s.id))
  from public.training_signups s where s.ref = p_ref $$;

-- COACH (PIN): waiver list for the back office (no signature / file paths).
create or replace function public.coach_waivers(p_email text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin);
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  return jsonb_build_object('waivers', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'signup_id', w.signup_id, 'athlete_index', w.athlete_index,
      'athlete_name', w.athlete_name, 'athlete_dob', w.athlete_dob, 'emergency_name', w.emergency_name, 'emergency_phone', w.emergency_phone,
      'medical_notes', w.medical_notes, 'photo_opt_in', w.photo_opt_in, 'signer_name', w.signer_name, 'signer_relationship', w.signer_relationship,
      'version', w.version, 'signed_at', w.signed_at, 'has_pdf', w.pdf_path is not null) order by w.signed_at desc), '[]') from training.waivers w),
    'needed', (select coalesce(jsonb_object_agg(s.id, jsonb_array_length(training.athletes(s))), '{}') from public.training_signups s));
end $$;

-- SERVICE ROLE ONLY (waiver-admin function checks the PIN through this): PDF path for one waiver.
create or replace function public.coach_waiver_pdf_path(p_email text, p_pin text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := training.pin_check(p_email, p_pin); v text;
begin
  if e is not null then return jsonb_build_object('error', e); end if;
  select pdf_path into v from training.waivers where id = p_id;
  if v is null then return jsonb_build_object('error','PDF not found'); end if;
  return jsonb_build_object('path', v);
end $$;
create or replace function public.coach_pin_ok(p_email text, p_pin text) returns jsonb
language sql security definer set search_path = '' as $$ select jsonb_build_object('error', training.pin_check(p_email, p_pin)) $$;

-- SERVICE ROLE ONLY: paid bookings still missing a waiver (for the reminder after payment).
create or replace function public.training_waiver_unsigned(p_signup bigint) returns int
language sql stable security definer set search_path = '' as $$
  select jsonb_array_length(training.athletes(s)) - (select count(*) from training.waivers w where w.signup_id = s.id)::int
  from public.training_signups s where s.id = p_signup $$;

-- PUBLIC (dashboard token): waiver status for my.html.
create or replace function public.parent_waivers(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.training_signups;
begin
  if length(coalesce(p_token,'')) < 32 then return jsonb_build_object('error','invalid link'); end if;
  select * into s from public.training_signups where token_hash = training.token_hash(p_token);
  if not found then return jsonb_build_object('error','invalid link'); end if;
  return jsonb_build_object('athletes', training.athletes(s),
    'signed', (select coalesce(jsonb_agg(w.athlete_index), '[]') from training.waivers w where w.signup_id = s.id));
end $$;

revoke all on function training.athletes(public.training_signups) from public, anon, authenticated;
revoke all on function public.training_waiver_ctx(uuid, text, text), public.training_waiver_insert(jsonb), public.training_waiver_issue_token(bigint, text),
  public.training_waiver_queue_copy(bigint, jsonb), public.coach_waiver_pdf_path(text, text, uuid), public.coach_pin_ok(text, text),
  public.training_waiver_unsigned(bigint) from public, anon, authenticated;
grant execute on function public.training_waiver_ctx(uuid, text, text), public.training_waiver_insert(jsonb), public.training_waiver_issue_token(bigint, text),
  public.training_waiver_queue_copy(bigint, jsonb), public.coach_waiver_pdf_path(text, text, uuid), public.coach_pin_ok(text, text),
  public.training_waiver_unsigned(bigint) to service_role;
revoke all on function public.training_waiver_status(uuid), public.coach_waivers(text, text), public.parent_waivers(text) from public;
grant execute on function public.training_waiver_status(uuid), public.coach_waivers(text, text), public.parent_waivers(text) to anon, authenticated;
