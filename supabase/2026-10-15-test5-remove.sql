-- test5 path removed from the site; drop the TEST $5 tag trigger.
drop trigger if exists tag_test5 on public.training_signups;
drop function if exists training.tag_test5();
