-- Gym (HHPC court) 2-hour sessions must end at least 15 min before close
-- (Mon-Thu by 8:45 PM, Fri by 7:45 PM, Sat by 4:45 PM). Hourly starts -> latest
-- start Mon-Thu 6 PM, Fri 5 PM, Sat 2 PM. Outdoor / Weight room unchanged.
create or replace function training.hour_allowed(p_start timestamptz, p_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  with l as (select p_start at time zone 'America/Denver' as t)
  select date_trunc('hour', p_start) = p_start and case
    when p_type = 'Gym' then
      (case extract(isodow from t)::int
         when 1 then extract(hour from t) between 5 and 18 when 2 then extract(hour from t) between 5 and 18
         when 3 then extract(hour from t) between 5 and 18 when 4 then extract(hour from t) between 5 and 18
         when 5 then extract(hour from t) between 5 and 17 when 6 then extract(hour from t) between 7 and 14
         else false end)
      and not exists (select 1 from public.training_gym_closures c where c.starts_at < p_start + interval '2 hours' and c.ends_at > p_start)
    when p_type in ('Outdoor','Weight room') then extract(hour from t) between 6 and 19
    else false end
  from l;
$$;
