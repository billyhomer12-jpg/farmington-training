// Waiver reminders for one booking: each unsigned athlete with an email gets their own link;
// unsigned athletes without an email are listed for the booking parent to share. force = coach resend.
import { db, sendEmail } from './send.ts';
import { waiverAthleteEmail, waiverShareEmail } from './templates.js';

export async function remindUnsigned(signupId: number, force = false) {
  const { data, error } = await db().rpc('training_waiver_remind_plan', { p_signup: signupId, p_force: force });
  if (error || data?.error) throw new Error(error?.message || data.error);
  const s = data.signup, todo: any[] = data.unsigned || [];
  let sent = 0;
  const share: any[] = [];
  for (const l of todo) {
    const to = l.index === 0 ? s.email : l.email;
    if (!to) { share.push(l); continue; }
    try { await sendEmail(to, waiverAthleteEmail({ signup: s, link: l })); sent++; } catch (e) { console.error('waiver reminder', signupId, l.index, e); }
  }
  if (share.length && s.email) { try { await sendEmail(s.email, waiverShareEmail({ signup: s, links: share })); sent++; } catch (e) { console.error('share reminder', signupId, e); } }
  return { sent, unsigned: todo.length };
}
