-- Public sees only when the gym is closed, never the coach's reason (coach_data still returns it).
revoke select on public.training_gym_closures from anon, authenticated;
grant select (id, starts_at, ends_at) on public.training_gym_closures to anon, authenticated;
-- DEMO requests are 2-hour sessions like everything else.
update public.training_requests set duration_min = 120 where duration_min <> 120 and signup_id in (select id from public.training_signups where is_demo);
