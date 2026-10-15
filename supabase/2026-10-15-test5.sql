-- TEMPORARY: a $5 payment on a single-session booking (book.html?test5=1) is accepted like any payment
-- (marked paid, confirmation queued) and tagged as a test in the booking message so coaches can tell.
create or replace function training.tag_test5() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and new.package = 'single' and new.amount_paid_cents = 500 then
    new.message := '[TEST $5 payment via ?test5=1, not a real booking]' || coalesce(' ' || old.message, '');
  end if;
  return new;
end $$;
drop trigger if exists tag_test5 on public.training_signups;
create trigger tag_test5 before update on public.training_signups for each row execute function training.tag_test5();
