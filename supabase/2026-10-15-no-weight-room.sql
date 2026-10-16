-- Weight room is no longer bookable (HHPC weight room is for the gym's own trainers). Existing rows keep the value.
create or replace function training.no_new_weight_room() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.workout_type = 'Weight room' and (tg_op = 'INSERT' or old.workout_type is distinct from 'Weight room') then
    raise exception 'Weight room sessions are no longer offered. Please pick Gym or Outdoor.'; end if;
  return new;
end $$;
drop trigger if exists no_new_weight_room on public.training_requests;
create trigger no_new_weight_room before insert or update of workout_type on public.training_requests for each row execute function training.no_new_weight_room();
do $$ declare f regprocedure; d text; begin
  for f in select p.oid::regprocedure from pg_proc p where p.proname = 'training_book' and p.prosrc like '%''Weight room''%' loop
    d := pg_get_functiondef(f);
    d := replace(d, 'x not in (''Gym'',''Outdoor'',''Weight room'')', 'x not in (''Gym'',''Outdoor'')');
    d := replace(d, 'where x in (''Gym'',''Outdoor'',''Weight room'')', 'where x in (''Gym'',''Outdoor'')');
    execute d;
  end loop;
end $$;
