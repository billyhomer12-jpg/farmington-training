-- Multiple programs per sign-up (any of Basketball Training / Weightlifting / Conditioning). Idempotent.
-- Run after 2026-10-15-packages-2hr.sql. Availability/capacity use the FIRST selected program (stored on each session).
alter table public.training_signups add column if not exists programs text[];
update public.training_signups set programs = array[program] where programs is null and program is not null;

create or replace function public.training_book(p_parent text, p_athlete text, p_age int, p_program text,
  p_phone text, p_email text, p_message text, p_starts timestamptz[], p_workout_type text, p_package text, p_players int, p_programs text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ref uuid; v_progs text[];
begin
  select array_agg(distinct x) into v_progs from unnest(p_programs) x;
  if coalesce(array_length(v_progs,1),0) = 0 or array_length(v_progs,1) > 3 then raise exception 'Pick 1 to 3 programs'; end if;
  if exists (select 1 from unnest(v_progs) x where not exists (select 1 from public.training_capacity c where c.program = x)) then raise exception 'Unknown program'; end if;
  -- keep the parent's order; first program drives availability
  v_progs := array(select x from unnest(p_programs) with ordinality u(x, n) group by x order by min(n));
  v_ref := public.training_book(p_parent, p_athlete, p_age, v_progs[1], p_phone, p_email, p_message, p_starts, p_workout_type, p_package, p_players);
  update public.training_signups set programs = v_progs where ref = v_ref;
  return v_ref;
end $$;
revoke all on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text,text,int,text[]) from public;
grant execute on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text,text,int,text[]) to anon, authenticated;
