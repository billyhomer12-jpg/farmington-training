-- Weightlifting / Youth Strength Training removed. Existing and DEMO rows keep their program value; new sign-ups can't pick it.
create or replace function training.no_new_strength() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.program = 'Youth Strength Training' or 'Youth Strength Training' = any(coalesce(new.programs, '{}')) then
    raise exception 'Weightlifting is no longer offered. Please pick Basketball Training or Conditioning.'; end if;
  return new;
end $$;
drop trigger if exists no_new_strength on public.training_signups;
create trigger no_new_strength before insert on public.training_signups for each row execute function training.no_new_strength();
-- Waiver v2: same terms; risk sentence covers basketball and conditioning only; Billy's phone number.
insert into training.waiver_versions(version, title, body, active)
select '2026-10-v2', title,
  replace(replace(body,
    'Basketball, weightlifting, and conditioning carry risks, known and unknown, including sprains, tears, broken bones, concussions, collisions, dropped weights, heat illness,',
    'Basketball and conditioning carry risks, known and unknown, including sprains, tears, broken bones, concussions, collisions, falls, heat illness,'),
    '(505) 231-0725', '(505) 469-3851'), false
from training.waiver_versions where version = '2026-10-v1'
on conflict (version) do nothing;
update training.waiver_versions set active = (version = '2026-10-v2');
