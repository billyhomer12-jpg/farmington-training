-- MEMBERSHIP-4/5/9 (NOT APPLIED to jrcozcrfbjcsuqkmoaki; pending Stripe test-mode access + Billy approval)
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  parent_email text not null, athlete text not null,
  tier text not null check (tier in ('1on1_monthly','1on1_monthly_plus','open_group_monthly')),
  stripe_customer_id text, stripe_subscription_id text unique,
  status text not null default 'incomplete',
  current_period_start timestamptz, current_period_end timestamptz,
  sessions_granted int not null default 0, sessions_used int not null default 0,
  rollover int not null default 0 check (rollover between 0 and 2),
  closure_rollover int not null default 0,
  payment_failed boolean not null default false,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.stripe_events_processed (event_id text primary key, processed_at timestamptz default now());
alter table public.memberships enable row level security;
alter table public.stripe_events_processed enable row level security;
create policy memberships_own on public.memberships for select
  using (lower(parent_email) = lower(coalesce(auth.jwt()->>'email','')));
create or replace view public.membership_admin as
select m.*, case
  when m.status='canceled' then 'Canceled'
  when m.payment_failed then 'Payment failed'
  when m.cancel_at_period_end then 'Canceling, active until '||to_char(m.current_period_end at time zone 'America/Denver','Mon DD, YYYY')
  else initcap(m.status) end as status_label,
  (m.sessions_granted+m.rollover+m.closure_rollover-m.sessions_used) as sessions_left
from public.memberships m;
revoke all on public.membership_admin from anon, authenticated;
create or replace function public.membership_can_book(p_membership uuid, p_slot timestamptz)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships m where m.id=p_membership
    and m.status in ('active','trialing') and not m.payment_failed
    and p_slot > now() and p_slot <= now() + interval '4 weeks'
    and (not m.cancel_at_period_end or p_slot <= m.current_period_end)
    and (m.sessions_granted+m.rollover+m.closure_rollover-m.sessions_used) > 0);
$$;
-- Test-mode email log (rendered emails stored, never sent)
create table if not exists public.membership_email_log (id bigserial primary key, membership_id uuid, kind text, to_email text, subject text, body text, created_at timestamptz default now());
alter table public.membership_email_log enable row level security;
