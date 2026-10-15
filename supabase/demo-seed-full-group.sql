-- DEMO: one full Tue/Thu open group of 4 (paid $125 each, inserted directly; no webhook, no emails). Back office only.
do $$ declare g bigint; s bigint; r record; begin
  if exists (select 1 from training.open_groups where label = 'DEMO Tue/Thu 10 AM (full)') then return; end if;
  insert into training.open_groups(label, weekdays, start_hour, first_date, capacity, status, is_demo, note)
  values ('DEMO Tue/Thu 10 AM (full)', array[2,4], 10, date '2026-10-27', 4, 'running', true, 'DEMO data, remove before launch') returning id into g;
  perform training.og_build_sessions(g);
  for r in select * from (values ('DEMO Jane Doe','DEMO Mia Doe',13,'demo.doe@example.com'), ('DEMO Carlos Ruiz','DEMO Leo Ruiz',15,'demo.ruiz@example.com'),
      ('DEMO Tasha Brown','DEMO Jordan Brown',12,'demo.brown@example.com'), ('DEMO Emily Chen','DEMO Ryan Chen',17,'demo.chen@example.com')) t(p, a, age, em) loop
    insert into public.training_signups(parent, athlete, age, program, programs, phone, email, package, group_size, price_cents, workout_types, additional_players,
      payment_status, paid_at, amount_paid_cents, status, is_demo, message)
    values (r.p, r.a, r.age, 'Basketball Skills', array['Basketball Skills'], '505-555-0100', r.em, 'open_group', 1, 12500, array['Gym'], '[]',
      'paid', now(), 12500, 'booked', true, 'DEMO data, remove before launch') returning id into s;
    insert into training.open_group_members(group_id, signup_id, status) values (g, s, 'paid');
  end loop;
end $$;
