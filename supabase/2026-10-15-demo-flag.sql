-- is_demo: back-office demo data. Never blocks public slots, never listed publicly, never emailed or checked by cron.
alter table training.open_groups add column if not exists is_demo boolean not null default false;
alter table public.training_signups add column if not exists is_demo boolean not null default false;

create or replace function training.og_slot_taken(p_start timestamptz, p_min int default 120) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from training.open_group_sessions s join training.open_groups g on g.id = s.group_id and g.status <> 'cancelled' and not g.is_demo
    where s.starts_at < p_start + make_interval(mins => p_min) and s.starts_at + make_interval(mins => s.duration_min) > p_start
      and exists (select 1 from training.open_group_members m where m.group_id = g.id and m.status = 'paid')) $$;

create or replace function public.training_open_groups() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(training.og_json(g.id) order by (select min(starts_at) from training.open_group_sessions s where s.group_id = g.id)), '[]')
  from training.open_groups g where g.status <> 'cancelled' and not g.is_demo and jsonb_array_length(training.og_conflicts(g.id)) = 0
    and (select min(starts_at) from training.open_group_sessions s where s.group_id = g.id) > now() + interval '2 hours' $$;

create or replace function public.training_waiver_due() returns setof bigint language sql stable security definer set search_path = '' as $$
  select s.id from public.training_signups s
  where s.payment_status = 'paid' and not s.is_demo and s.created_at > now() - interval '60 days'
    and jsonb_array_length(training.athletes(s)) > (select count(*) from training.waivers w where w.signup_id = s.id) $$;

-- 48-hour check skips demo groups.
do $$ declare d text; begin
  d := pg_get_functiondef('training.open_group_check()'::regprocedure);
  d := replace(d, 'where og.status = ''forming'' and og.checked_at is null', 'where og.status = ''forming'' and og.checked_at is null and not og.is_demo');
  execute d;
end $$;

