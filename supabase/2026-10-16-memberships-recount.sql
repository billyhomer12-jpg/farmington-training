-- MEMBQA-B: sessions_used is recounted atomically from membership_sessions (fixes checkout/invoice.paid race that left Open Group signups at 0 used)
create or replace function public.membership_recount(p_id uuid) returns int language sql security definer set search_path=public as $$
  update memberships m set sessions_used = (select count(*) from membership_sessions s where s.membership_id=m.id and coalesce(s.status,'confirmed')<>'canceled'
     and (s.period_start is null or m.current_period_start is null or s.period_start>=m.current_period_start))
  where m.id=p_id returning sessions_used $$;
revoke all on function public.membership_recount(uuid) from public, anon, authenticated;
-- one-time repair of test rows from today
select membership_recount(id) from memberships where is_test and created_at > now() - interval '1 day' and sessions_granted>0;
