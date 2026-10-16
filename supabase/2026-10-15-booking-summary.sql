-- Paid page summary by booking ref (the ref is an unguessable UUID only the booker has). No contact details are returned.
create or replace function public.training_booking_summary(p_ref uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'package', s.package, 'athlete', split_part(s.athlete, ' ', 1), 'players', jsonb_array_length(training.athletes(s)),
    'payment_status', s.payment_status, 'amount_cents', coalesce(s.amount_paid_cents, s.price_cents),
    'group', (select g.label from training.open_group_members m join training.open_groups g on g.id = m.group_id where m.signup_id = s.id and m.status in ('held','paid') limit 1),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('starts_at', r.starts_at, 'duration_min', r.duration_min, 'workout_type', r.workout_type, 'status', r.status) order by r.starts_at), '[]')
                 from public.training_requests r where r.signup_id = s.id and r.status in ('requested','confirmed')),
    'waivers_needed', jsonb_array_length(training.athletes(s)),
    'waivers_signed', (select count(distinct w.athlete_index) from training.waivers w where w.signup_id = s.id),
    'my_waiver_signed', exists (select 1 from training.waivers w where w.signup_id = s.id and w.athlete_index = 0))
  from public.training_signups s where s.ref = p_ref and not s.is_demo $$;
grant execute on function public.training_booking_summary(uuid) to anon, authenticated;
