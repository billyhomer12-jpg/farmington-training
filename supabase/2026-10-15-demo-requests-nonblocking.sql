-- Old Oct-14 DEMO requests (DEMO Mateo/Ava/Jalen) were never flagged is_demo, so they showed publicly as
-- "Group session · 5 left" and blocked real times. Flag them, and make every overlap check ignore is_demo sign-ups.
update public.training_signups set is_demo = true where message = 'DEMO' and email ~ '^demo[0-9]+@example\.com$';
do $$ declare d text; f regprocedure; dq text := ' and not exists (select 1 from public.training_signups ds where ds.id = %s.signup_id and ds.is_demo)';
begin
  d := pg_get_functiondef('training.seats_left(timestamptz,text,bigint)'::regprocedure);
  d := replace(d, 'and r.id is distinct from p_ignore', 'and r.id is distinct from p_ignore' || format(dq,'r')); execute d;
  d := pg_get_functiondef('public.training_slot_kinds(timestamptz,timestamptz)'::regprocedure);
  d := replace(d, 'r.status in (''requested'',''confirmed'') and r.format', 'r.status in (''requested'',''confirmed'')' || format(dq,'r') || ' and r.format'); execute d;
  d := pg_get_functiondef('training.requests_slot_guard()'::regprocedure);
  d := replace(d, 'and q.id is distinct from new.id', 'and q.id is distinct from new.id' || format(dq,'q')); execute d;
  d := pg_get_functiondef('training.og_conflicts(bigint)'::regprocedure);
  d := replace(d, 'on q.status in (''requested'',''confirmed'')', 'on q.status in (''requested'',''confirmed'')' || format(dq,'q')); execute d;
  for f in select p.oid::regprocedure from pg_proc p where p.proname = 'training_book' and p.prosrc like '%q.status in (''requested'',''confirmed'')%' loop
    d := pg_get_functiondef(f);
    d := replace(d, 'q.status in (''requested'',''confirmed'')', 'q.status in (''requested'',''confirmed'')' || format(dq,'q')); execute d;
  end loop;
end $$;
