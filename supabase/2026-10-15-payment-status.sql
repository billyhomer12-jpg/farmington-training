-- Public, read-only: returns just the payment status for an (unguessable) booking ref, for book.html?paid=1.
create or replace function public.training_payment_status(p_ref uuid) returns text
language sql stable security definer set search_path = '' as $$
  select payment_status from public.training_signups where ref = p_ref
$$;
revoke all on function public.training_payment_status(uuid) from public;
grant execute on function public.training_payment_status(uuid) to anon, authenticated;
