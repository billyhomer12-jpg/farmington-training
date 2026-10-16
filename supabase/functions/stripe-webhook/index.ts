// Stripe webhook: checkout.session.completed -> mark booking paid, issue dashboard token, send confirmation email.
// Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY (+ optional EMAIL_FROM, EMAIL_DRY_RUN=1)
import Stripe from 'npm:stripe@16';
import { db, flushOutbox } from '../_shared/send.ts';
import { remindUnsigned } from '../_shared/remind.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const crypto = Stripe.createSubtleCryptoProvider();

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
  let sent = await flushOutbox(data.signup_id, data.token);
  // Athlete 1 signs before payment; other group players sign from their own link. Remind right away:
  // players with an email get their link, the booking parent gets the links for the rest.
  try {
    const { data: missing } = await db().rpc('training_waiver_unsigned', { p_signup: data.signup_id });
    if (missing > 0) sent += (await remindUnsigned(data.signup_id)).sent;
  } catch (e) { console.error('waiver reminder failed', e); }
  return new Response(JSON.stringify({ ok: true, sent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
