-- GO-LIVE ONLY (applied by membership_live_switch.sh go): live member sessions block regular availability.
-- Test-mode members (is_test) never block, so applying this has no effect until real members exist.
CREATE OR REPLACE FUNCTION training.seats_left(p_start timestamp with time zone, p_program text, p_ignore bigint DEFAULT NULL::bigint)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  with ov as (
    select r.* from public.training_requests r
    where r.status in ('requested','confirmed') and r.id is distinct from p_ignore and not exists (select 1 from public.training_signups ds where ds.id = r.signup_id and ds.is_demo)
      and r.starts_at < p_start + interval '2 hours'
      and r.starts_at + make_interval(mins => r.duration_min) > p_start)
  select case
    when exists (select 1 from public.training_blocks b where b.starts_at < p_start + interval '2 hours' and b.ends_at > p_start) then 0
    when training.og_slot_taken(p_start) then 0
    when exists (select 1 from public.membership_sessions ms join public.memberships m on m.id = ms.membership_id
                 where ms.status = 'confirmed' and not m.is_test and coalesce(m.workout_type,'Gym') <> 'OpenGroup'
                   and ms.starts_at < p_start + interval '2 hours' and ms.starts_at + interval '2 hours' > p_start) then 0
    when exists (select 1 from ov where ov.format = '1-on-1') then 0
    when exists (select 1 from ov where ov.program <> p_program) then 0
    else greatest(0, coalesce((select capacity from public.training_capacity where program = p_program), 1) - (select count(*)::int from ov)) end;
$function$;
