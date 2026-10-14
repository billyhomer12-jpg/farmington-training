-- Adds session format (1-on-1 / Small group) to requests. Idempotent; run after 2026-10-14-training-bookings.sql.
alter table public.training_requests add column if not exists format text;
alter table public.training_requests drop constraint if exists training_requests_format_check;
alter table public.training_requests add constraint training_requests_format_check check (format is null or format in ('1-on-1','Small group'));

create or replace function public.training_book(p_parent text, p_athlete text, p_age int, p_program text,
  p_phone text, p_email text, p_message text, p_starts timestamptz[], p_format text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ref uuid; v_id bigint;
begin
  if p_format is not null and p_format not in ('1-on-1','Small group') then raise exception 'Invalid format'; end if;
  v_ref := public.training_book(p_parent, p_athlete, p_age, p_program, p_phone, p_email, p_message, p_starts);
  select id into v_id from public.training_signups where ref = v_ref;
  update public.training_requests set format = p_format where signup_id = v_id;
  return v_ref;
end $$;
revoke all on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text) from public;
grant execute on function public.training_book(text,text,int,text,text,text,text,timestamptz[],text) to anon, authenticated;
