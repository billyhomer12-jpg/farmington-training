// Called by my.html after a successful move: sends queued emails (e.g. "Reschedule confirmed") for the booking
// that owns this token. It only ever sends what the database queued, so it can't be used to send arbitrary mail.
// Deploy with: supabase functions deploy notify --no-verify-jwt   Secrets: RESEND_API_KEY
import { db, flushOutbox, cors } from '../_shared/send.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || token.length < 32) return new Response(JSON.stringify({ error: 'invalid link' }), { status: 400, headers: cors });
  const { data: id } = await db().rpc('training_signup_by_token', { p_token: token });
  if (!id) return new Response(JSON.stringify({ error: 'invalid link' }), { status: 404, headers: cors });
  const sent = await flushOutbox(id, token);
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
