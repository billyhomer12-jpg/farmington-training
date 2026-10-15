-- Farmington training sign-ups (separate from trading journal tables)
create schema if not exists training;
create table if not exists training.coaches (email text primary key);
insert into training.coaches(email) values ('<coach-email>') on conflict do nothing;
insert into training.coaches(email) values ('<coach2-email>') on conflict do nothing;

create table if not exists public.training_signups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  parent text not null check (length(parent) between 1 and 200),
  athlete text not null check (length(athlete) between 1 and 200),
  age int check (age between 4 and 25),
  program text check (length(program) <= 100),
  phone text check (length(phone) <= 50),
  email text not null check (length(email) <= 200),
  message text check (length(message) <= 2000),
  status text not null default 'new' check (status in ('new','contacted','booked'))
);
alter table public.training_signups enable row level security;

create or replace function training.is_coach() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from training.coaches c
    where lower(c.email) = lower(auth.jwt()->>'email'));
$$;
grant usage on schema training to anon, authenticated;
grant execute on function training.is_coach() to authenticated;
revoke all on training.coaches from anon, authenticated;

grant insert (parent,athlete,age,program,phone,email,message) on public.training_signups to anon, authenticated;
grant select, update (status), delete on public.training_signups to authenticated;

drop policy if exists "anon insert" on public.training_signups;
create policy "anon insert" on public.training_signups for insert to anon, authenticated
  with check (status = 'new');
drop policy if exists "coach select" on public.training_signups;
create policy "coach select" on public.training_signups for select to authenticated using (training.is_coach());
drop policy if exists "coach update" on public.training_signups;
create policy "coach update" on public.training_signups for update to authenticated using (training.is_coach()) with check (training.is_coach());
drop policy if exists "coach delete" on public.training_signups;
create policy "coach delete" on public.training_signups for delete to authenticated using (training.is_coach());
