// Shared: Supabase service client, Resend sender, outbox processor.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { FROM, REPLY_TO, confirmationEmail, rescheduledEmail, waiverCopyEmail, waiverReminderEmail, groupUnderMinEmail, groupMovedEmail, coachNoticeEmail } from './templates.js';

export const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

export async function sendEmail(to: string, m: { subject: string; html: string; text: string }) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY not set');
  // Reserved test domain (TEST bookings): never hand these to Resend.
  if (/@example\.(com|org|net)$/i.test(to)) { console.log('[test-skip] email to', to, m.subject); return; }
  if (Deno.env.get('EMAIL_DRY_RUN') === '1') { console.log('[dry-run] email to', to, m.subject); return; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') || FROM, to: [to], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text }) });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()));
}

// Send every queued email for one sign-up. The caller supplies the plaintext token (it is never stored).
export async function flushOutbox(signupId: number, token: string, opt: { wtoken?: string } = {}) {
  const sb = db();
  const { data, error } = await sb.rpc('training_outbox_for', { p_signup: signupId });
  if (error) throw error;
  const { signup, sessions, emails, group } = data;
  let sent = 0;
  for (const e of emails) {
    try {
      if ((e.kind === 'confirmation' || e.kind === 'rescheduled') && !token) continue; // needs the dashboard token
      if (e.kind === 'waiver_reminder' && !opt.wtoken) continue; // needs the waiver token issued with it
      const m = e.kind === 'confirmation' ? confirmationEmail({ signup, sessions, token, group })
        : e.kind === 'coach_notice' ? coachNoticeEmail({ signup, payload: e.payload })
        : e.kind === 'group_under_min' ? groupUnderMinEmail({ signup, payload: e.payload })
        : e.kind === 'group_moved' ? groupMovedEmail({ signup, sessions, group })
        : e.kind === 'waiver_copy' ? waiverCopyEmail({ signup, payload: e.payload })
        : e.kind === 'waiver_reminder' ? waiverReminderEmail({ signup, wtoken: opt.wtoken })
        : rescheduledEmail({ signup, sessions, token, from: e.payload.from, to: e.payload.to, session_id: e.payload.session_id });
      await sendEmail(e.kind === 'coach_notice' ? REPLY_TO : signup.email, m);
      await sb.rpc('training_outbox_done', { p_id: e.id, p_error: null }); sent++;
    } catch (err) { await sb.rpc('training_outbox_done', { p_id: e.id, p_error: String(err).slice(0, 500) }); }
  }
  return sent;
}
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
