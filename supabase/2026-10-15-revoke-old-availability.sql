-- Close the legacy 3-arg availability function (ignores gym hours). Idempotent.
revoke execute on function public.training_availability(text,timestamptz,timestamptz) from public, anon, authenticated;
