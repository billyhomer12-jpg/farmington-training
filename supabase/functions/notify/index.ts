// Called by my.html after a successful move: sends queued emails (e.g. "Reschedule confirmed") for the booking
// that owns this token. It only ever sends what the database queued, so it can't be used to send arbitrary mail.
// Deploy with: supabase functions deploy notify --no-verify-jwt   Secrets: RESEND_API_KEY
import { db, flushOutbox, cors } from '../_shared/send.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  const b = await req.json().catch(() => ({}));
  // Hourly pg_cron run: 48-hour open-group check, then send the queued group notices (no dashboard token needed).
  if (b.action === 'group-cron') {
    const { data, error } = await db().rpc('training_open_group_cron', { p_key: String(b.key || '') });
    if (error || data?.error) return new Response('forbidden', { status: 403, headers: cors });
    let sent = 0;
    for (const id of (data.ids || []) as number[]) { try { sent += await flushOutbox(Number(id), ''); } catch (e) { console.error('group notice', id, e); } }
    return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  // Move link (my.html?move=...): send the queued "group changed" email.
  if (b.action === 'group-moved' && typeof b.move === 'string') {
    const { data } = await db().rpc('group_move_view', { p_move: b.move });
    const { data: id } = await db().rpc('training_signup_by_move', { p_move: b.move });
    if (!id || data?.error) return new Response(JSON.stringify({ error: 'invalid link' }), { status: 404, headers: cors });
    const sent = await flushOutbox(Number(id), '');
    return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const { token } = b;
  if (typeof token !== 'string' || token.length < 32) return new Response(JSON.stringify({ error: 'invalid link' }), { status: 400, headers: cors });
  const { data: id } = await db().rpc('training_signup_by_token', { p_token: token });
  if (!id) return new Response(JSON.stringify({ error: 'invalid link' }), { status: 404, headers: cors });
  const sent = await flushOutbox(id, token);
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
