-- GO-20: record the amount actually charged and which deal it came from (stripe-webhook sets both from the
-- Checkout Session: price_cents := amount_total, deal := session metadata.deal / sale Payment Link).
-- Admin (coach_data) and outbox (training_outbox_for) return the full row; the paid page gets 'deal' below.
alter table public.training_signups add column if not exists deal text;
do $$ declare d text; begin
  d := pg_get_functiondef('public.training_booking_summary'::regproc);
  if position('''deal'', s.deal' in d) = 0 then
    d := replace(d, '''amount_cents'', coalesce(s.amount_paid_cents, s.price_cents),',
                    '''amount_cents'', coalesce(s.amount_paid_cents, s.price_cents), ''deal'', s.deal,');
    execute d;
  end if;
end $$;
