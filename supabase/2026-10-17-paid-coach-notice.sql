-- Coach notice for paid 1-on-1 / own-group bookings, queued on payment confirmation (training_mark_paid, called by stripe-webhook),
-- same pattern as open-group join notices. No parent emails added.
do $$ declare d text; begin
  d := pg_get_functiondef('public.training_mark_paid(uuid,text,integer)'::regprocedure);
  if d not like '%paid_booking%' then
    d := replace(d, '  insert into training.email_outbox(signup_id, kind, payload) values (s.id, ''confirmation''',
      '  if s.package <> ''open_group'' and not s.is_demo then
    insert into training.email_outbox(signup_id, kind, payload) values (s.id, ''coach_notice'', jsonb_build_object(''type'', ''paid_booking'', ''amount_cents'', p_amount_cents,
      ''sessions'', (select coalesce(jsonb_agg(jsonb_build_object(''starts_at'', r.starts_at, ''workout_type'', r.workout_type, ''duration_min'', r.duration_min) order by r.starts_at), ''[]'') from public.training_requests r where r.signup_id = s.id and r.status in (''requested'',''confirmed''))));
  end if;
  insert into training.email_outbox(signup_id, kind, payload) values (s.id, ''confirmation''');
    execute d;
  end if;
end $$;
