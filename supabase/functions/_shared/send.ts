// Shared: Supabase service client, Resend sender, outbox processor.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ALL_RECIPIENTS, isQA } from './recipients.ts';
import { FROM, REPLY_TO, confirmationEmail, rescheduledEmail, waiverCopyEmail, waiverReminderEmail, groupUnderMinEmail, groupMovedEmail, coachNoticeEmail, freeConfirmationEmail, ownerMembershipEmail } from './templates.js';

export const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

export async function sendEmail(to: string, m: { subject: string; html: string; text: string }): Promise<string | undefined> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY not set');
  // Reserved test domain (TEST bookings): never hand these to Resend.
  if (/@example\.(com|org|net)$/i.test(to)) { console.log('[test-skip] email to', to, m.subject); return; }
  if (Deno.env.get('EMAIL_DRY_RUN') === '1') { console.log('[dry-run] email to', to, m.subject); return; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') || FROM, to: [to], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text }) });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()));
  return (await r.json().catch(() => ({}))).id as string | undefined;
}
// Coach notice to every owner/coach recipient (one config list). qa=true prefixes the subject with [QA].
// OWNER-SUBJ: every owner notice subject is unique: record ID + MT date/time (e.g. "… · #172, Sat 10/17 8:53 AM MT") so Gmail never threads them together.
export function stampMT(at?: string | Date) {
  const d = at ? new Date(at) : new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.weekday} ${p.month}/${p.day} ${p.hour}:${p.minute} ${p.dayPeriod} MT`;
}
export async function sendCoach(m: { subject: string; html: string; text: string }, qa = false, ref = '', at?: string | Date) {
  const tag = (ref ? ' · ' + ref + ',' : ' ·') + ' ' + stampMT(at);
  m = { ...m, subject: m.subject + tag };
  const mm = qa ? { ...m, subject: '[QA] ' + m.subject } : m; const ids: string[] = [];
  for (const to of ALL_RECIPIENTS) ids.push(String(await sendEmail(to, mm)));
  return ids;
}

// Send every queued email for one sign-up. The caller supplies the plaintext token (it is never stored).
export async function flushOutbox(signupId: number, token: string, opt: { wtoken?: string; only?: string } = {}) {
  const sb = db();
  const { data, error } = await sb.rpc('training_outbox_for', { p_signup: signupId });
  if (error) throw error;
  const { signup, sessions, emails, group } = data;
  let sent = 0;
  for (const e of emails) {
    try {
      if ((e.kind === 'confirmation' || e.kind === 'rescheduled') && !token) continue; // needs the dashboard token
      if (e.kind === 'waiver_reminder' && !opt.wtoken) continue; // needs the waiver token issued with it
      if (opt.only && e.kind !== opt.only) continue;
      // FREE-FIRST parent email stays queued until parent emails are turned on.
      if (e.kind === 'free_confirmation' && Deno.env.get('FREE_PARENT_EMAILS') !== '1') continue;
      // TEST bookings (@example.*): don't email the business inbox either; mark the notice done (logged).
      if (e.kind === 'coach_notice' && /@example\.(com|org|net)$/i.test(String(signup.email || '')) && !isQA(signup.email)) { console.log('[test-skip] coach notice for', signup.email); await sb.rpc('training_outbox_done', { p_id: e.id, p_error: null }); continue; }
      const m = e.kind === 'confirmation' ? confirmationEmail({ signup, sessions, token, group, bonus: e.payload && e.payload.bonus })
        : e.kind === 'coach_notice' ? coachNoticeEmail({ signup, payload: e.payload })
        : e.kind === 'group_under_min' ? groupUnderMinEmail({ signup, payload: e.payload })
        : e.kind === 'group_moved' ? groupMovedEmail({ signup, sessions, group })
        : e.kind === 'free_confirmation' ? freeConfirmationEmail({ signup, sessions })
        : e.kind === 'waiver_copy' ? waiverCopyEmail({ signup, payload: e.payload })
        : e.kind === 'waiver_reminder' ? waiverReminderEmail({ signup, wtoken: opt.wtoken })
        : rescheduledEmail({ signup, sessions, token, from: e.payload.from, to: e.payload.to, session_id: e.payload.session_id });
      if (e.kind === 'coach_notice') { const ids = await sendCoach(m, isQA(signup.email), '#' + signup.id, e.created_at); console.log('[coach_notice] outbox', e.id, 'sent to', ALL_RECIPIENTS.length, 'ids', ids.join(',')); await sb.rpc('training_outbox_done', { p_id: e.id, p_error: null }); sent++; continue; }
      await sendEmail(signup.email, m);
      await sb.rpc('training_outbox_done', { p_id: e.id, p_error: null }); sent++;
    } catch (err) { await sb.rpc('training_outbox_done', { p_id: e.id, p_error: String(err).slice(0, 500) }); }
  }
  return sent;
}
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

// NOTIFY-ALL: send queued owner notices (memberships: start, cancel, ended, rescheduled) to the owner list only.
// Members with an @example.* email are suppressed unless qa-notify*@example.com (subject "[QA]"). Never emails a member.
export async function flushOwner() {
  const sb = db(); let sent = 0;
  const { data: rows } = await sb.from('owner_outbox').select('*').is('sent_at', null).order('id').limit(50);
  for (const r of rows || []) {
    try {
      const mid = (r.payload || {}).membership_id;
      const { data: m } = mid ? await sb.from('memberships').select('*').eq('id', mid).maybeSingle() : { data: null };
      const em = String(m?.parent_email || '');
      if (/@example\.(com|org|net)$/i.test(em) && !isQA(em)) { await sb.from('owner_outbox').update({ sent_at: new Date().toISOString(), error: 'test-skip' }).eq('id', r.id); continue; }
      const ids = await sendCoach(ownerMembershipEmail({ kind: r.kind, payload: r.payload, m: m || {} }), isQA(em), 'M-' + (mid ? String(mid).slice(0, 8) : 'n/a') + ' #' + r.id, r.created_at);
      console.log('[owner_outbox]', r.id, r.kind, 'ids', ids.join(','));
      await sb.from('owner_outbox').update({ sent_at: new Date().toISOString(), error: null }).eq('id', r.id); sent++;
    } catch (e) { await sb.from('owner_outbox').update({ error: String(e).slice(0, 500) }).eq('id', r.id); }
  }
  return sent;
}
