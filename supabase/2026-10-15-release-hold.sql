-- Parent refreshed/abandoned before paying: release the unpaid hold (group spot + requested times) for that booking ref.
create or replace function public.training_release_hold(p_ref uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  select id into v_id from public.training_signups where ref = p_ref and payment_status = 'pending' and not is_demo;
  if v_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('training_book'));
  update training.open_group_members set status = 'expired' where signup_id = v_id and status = 'held';
  update public.training_requests set status = 'cancelled' where signup_id = v_id and status = 'requested';
  return true;
end $$;
revoke all on function public.training_release_hold(uuid) from public;
grant execute on function public.training_release_hold(uuid) to anon, authenticated;
