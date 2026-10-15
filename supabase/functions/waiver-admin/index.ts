// Coach back office: POST {email, pin, action:'download', id} -> 5-minute signed URL for a signed waiver PDF
//                    POST {email, pin, action:'resend', signup_id} -> emails the parent a fresh 30-day signing link
// Every call is PIN-checked in the database (same lockout as the back office). Deploy: --no-verify-jwt --use-api
import { db, flushOutbox, cors } from '../_shared/send.ts';
const J = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return J({ error: 'method not allowed' }, 405);
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').toLowerCase().slice(0, 200), pin = String(b.pin || '').slice(0, 10), sb = db();
  if (b.action === 'download') {
    if (!/^[0-9a-f-]{36}$/i.test(String(b.id))) return J({ error: 'bad request' }, 400);
    const { data, error } = await sb.rpc('coach_waiver_pdf_path', { p_email: email, p_pin: pin, p_id: b.id });
    if (error || data?.error) return J({ error: data?.error || 'Request failed' }, 403);
    const { data: u, error: e } = await sb.storage.from('waivers').createSignedUrl(data.path, 300, { download: true });
    if (e || !u) return J({ error: 'Could not create the download link' }, 500);
    return J({ url: u.signedUrl, expires_in: 300 });
  }
  if (b.action === 'resend') {
    const { data: ok } = await sb.rpc('coach_pin_ok', { p_email: email, p_pin: pin });
    if (!ok || ok.error) return J({ error: ok?.error || 'Wrong PIN.' }, 403);
    const { data: t, error } = await sb.rpc('training_waiver_issue_token', { p_signup: Number(b.signup_id), p_kind: 'coach_resend' });
    if (error || t?.error) return J({ error: t?.error || 'Request failed' }, 400);
    const sent = await flushOutbox(Number(b.signup_id), '', { wtoken: t.token });
    return J({ ok: true, sent });
  }
  return J({ error: 'bad request' }, 400);
});
