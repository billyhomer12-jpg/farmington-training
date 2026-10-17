// Stripe webhook: checkout.session.completed -> mark booking paid, issue dashboard token, send confirmation email.
// Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY (+ optional EMAIL_FROM, EMAIL_DRY_RUN=1)
import Stripe from 'npm:stripe@16';
import { db, flushOutbox } from '../_shared/send.ts';
import { remindUnsigned } from '../_shared/remind.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const crypto = Stripe.createSubtleCryptoProvider();

// Grand Opening 20% sale Payment Links (10/16 17:50 MT - 11/15 17:50 MST); session metadata.deal is the primary signal.
const SALE_LINKS = new Set(['plink_1URKDRRpcc5zZV0DREiYbsLu', 'plink_1URKDSRpcc5zZV0DiYs0WUWV', 'plink_1URKDSRpcc5zZV0DW5BIYUxH',
  'plink_1URKDTRpcc5zZV0DXB9UVW2L', 'plink_1URKDTRpcc5zZV0DXeXEvN0m', 'plink_1URKDURpcc5zZV0Dy46yPRly']);

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const sig = req.headers.get('stripe-signature'), body = await req.text();
  // Accept events from the old Stripe account (STRIPE_WEBHOOK_SECRET) and the new one (STRIPE_WEBHOOK_SECRET_NEW)
  const secrets = [Deno.env.get('STRIPE_WEBHOOK_SECRET'), Deno.env.get('STRIPE_WEBHOOK_SECRET_NEW')].filter(Boolean) as string[];
  let event: Stripe.Event | undefined, lastErr: unknown;
  for (const sec of secrets) {
    try { event = await stripe.webhooks.constructEventAsync(body, sig!, sec, undefined, crypto); break; }
    catch (e) { lastErr = e; }
  }
  if (!event) return new Response('bad signature: ' + lastErr, { status: 400 });
  if (event.type !== 'checkout.session.completed') return new Response('ignored', { status: 200 });
  const s = event.data.object as Stripe.Checkout.Session;
  if (s.payment_status !== 'paid') return new Response('not paid yet', { status: 200 });
  const ref = s.client_reference_id;
  if (!ref || !/^[0-9a-f-]{36}$/i.test(ref)) return new Response('no booking ref', { status: 200 });
  const { data, error } = await db().rpc('training_mark_paid', { p_ref: ref, p_stripe_session: s.id, p_amount_cents: s.amount_total ?? 0 });
  if (error) return new Response('db error: ' + error.message, { status: 500 }); // Stripe retries
  if (data?.error || data?.duplicate) return new Response(JSON.stringify(data), { status: 200 });
  // GO-20: record the amount actually charged and tag Grand Opening sale-link purchases (before emails go out).
  const deal = s.metadata?.deal || (SALE_LINKS.has(String(s.payment_link ?? '')) ? 'grand-opening-2026' : null);
  const upd: Record<string, unknown> = deal ? { deal } : {};
  if (s.amount_total) upd.price_cents = s.amount_total;
  if (Object.keys(upd).length) {
    const { error: e2 } = await db().from('training_signups').update(upd).eq('id', data.signup_id);
    if (e2) console.error('deal/price update failed', e2.message);
  }
  let sent = await flushOutbox(data.signup_id, data.token);
  // Athlete 1 signs before payment; other group players sign from their own link. Remind right away:
  // players with an email get their link, the booking parent gets the links for the rest.
  try {
    const { data: missing } = await db().rpc('training_waiver_unsigned', { p_signup: data.signup_id });
    if (missing > 0) sent += (await remindUnsigned(data.signup_id)).sent;
  } catch (e) { console.error('waiver reminder failed', e); }
  return new Response(JSON.stringify({ ok: true, sent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
