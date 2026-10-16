-- Open start times for moving one session (same rules as parent_move, ignoring the session being moved). Returns times only.
create or replace function public.training_move_slots(p_token text, p_session bigint) returns setof timestamptz language plpgsql stable security definer set search_path = '' as $$
declare s public.training_signups; r public.training_requests;
begin
  if length(coalesce(p_token,'')) < 32 then return; end if;
  select * into s from public.training_signups where token_hash = training.token_hash(p_token);
  if not found then return; end if;
  select * into r from public.training_requests where id = p_session and signup_id = s.id and status in ('requested','confirmed');
  if not found then return; end if;
  return query
  select h from generate_series(date_trunc('hour', now() + interval '25 hours'), now() + interval '30 days', interval '1 hour') h
  where h >= now() + interval '24 hours' and h <> r.starts_at
    and training.hour_allowed(h, r.workout_type)
    and training.seats_left(h, r.program, r.id) >= 1
    and not training.og_slot_taken(h, 120)
    and not exists (select 1 from public.training_requests o where o.signup_id = s.id and o.id <> r.id and o.status in ('requested','confirmed')
         and o.starts_at < h + interval '2 hours' and o.starts_at + make_interval(mins => o.duration_min) > h)
    and not (r.format = '1-on-1' and exists (select 1 from public.training_requests q where q.id <> r.id and q.signup_id <> s.id and q.status in ('requested','confirmed')
         and not exists (select 1 from public.training_signups ds where ds.id = q.signup_id and ds.is_demo)
         and q.starts_at < h + interval '2 hours' and q.starts_at + make_interval(mins => q.duration_min) > h))
  order by h;
end $$;
grant execute on function public.training_move_slots(text, bigint) to anon, authenticated;
-- parent_move: ignore DEMO bookings like every other overlap check.
do $$ declare d text; begin
  d := pg_get_functiondef('public.parent_move(text,bigint,timestamptz)'::regprocedure);
  d := replace(d, 'q.id <> r.id and q.status in (''requested'',''confirmed'')', 'q.id <> r.id and q.status in (''requested'',''confirmed'') and not exists (select 1 from public.training_signups ds where ds.id = q.signup_id and ds.is_demo)');
  execute d;
end $$;
