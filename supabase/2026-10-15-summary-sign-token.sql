-- Paid page: a bare ref can't sign a paid booking's waiver (training_waiver_ctx only accepts refs before payment).
-- When the booking is paid and athlete 1's waiver is unsigned, the summary returns that athlete's waiver link token
-- (the same single-athlete token we email for signing); otherwise no token is returned.
create or replace function public.training_booking_summary(p_ref uuid) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s public.training_signups; j jsonb; signed0 boolean;
begin
  select * into s from public.training_signups where ref = p_ref and not is_demo;
  if not found then return null; end if;
  signed0 := exists (select 1 from training.waivers w where w.signup_id = s.id and w.athlete_index = 0);
  j := jsonb_build_object(
    'package', s.package, 'athlete', split_part(s.athlete, ' ', 1), 'players', jsonb_array_length(training.athletes(s)),
    'payment_status', s.payment_status, 'amount_cents', coalesce(s.amount_paid_cents, s.price_cents),
    'group', (select g.label from training.open_group_members m join training.open_groups g on g.id = m.group_id where m.signup_id = s.id and m.status in ('held','paid') limit 1),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('starts_at', r.starts_at, 'duration_min', r.duration_min, 'workout_type', r.workout_type, 'status', r.status) order by r.starts_at), '[]')
                 from public.training_requests r where r.signup_id = s.id and r.status in ('requested','confirmed')),
    'waivers_needed', jsonb_array_length(training.athletes(s)),
    'waivers_signed', (select count(distinct w.athlete_index) from training.waivers w where w.signup_id = s.id),
    'my_waiver_signed', signed0);
  if s.payment_status = 'paid' and not signed0 then
    j := j || jsonb_build_object('sign_token', training.waiver_link(s.id, 0)->>'token');
  end if;
  return j;
end $$;
grant execute on function public.training_booking_summary(uuid) to anon, authenticated;
