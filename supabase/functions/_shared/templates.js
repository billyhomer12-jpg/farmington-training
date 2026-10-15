// Email templates (plain ESM: used by Deno edge functions and by the Node preview script).
// Apple-style: white card on #f5f5f7, black text, green #34C759 accents. Inline CSS + table layout for email clients.
export const BRAND = 'Four Corners Hoops & Performance';
export const FROM = 'Four Corners Hoops & Performance <bookings@fourcornershoopsandperformance.com>';
export const REPLY_TO = 'fourcornershoopsandperformance@gmail.com';
export const PHONE = '(505) 231-0725';
export const PHONE_TEL = '+15052310725';
export const LOCATION = { name: 'San Juan College Health & Human Performance Center', address: '4601 College Blvd, Farmington, NM 87402, United States',
  apple: 'https://maps.apple.com/place?address=4601%20College%20Blvd,%20Farmington,%20NM%20%2087402,%20United%20States&coordinate=36.770237,-108.173952&name=San%20Juan%20College%20Health%20%26%20Human%20Performance%20Center&place-id=IBC9B4F4B78DAE618&map=explore' };
export const SITE = 'https://fourcornershoopsandperformance.com';
const PROG = { 'Basketball Skills': 'Basketball Training', 'Youth Strength Training': 'Weightlifting', 'Athletic Performance': 'Conditioning' };
const PKG = { single: 'Single 1-on-1 session', '1on1': '1-on-1', group2: 'Small group · 2 players', group3: 'Small group · 3 players', group4: 'Small group · 4 players', open_group: 'Open group (joined solo)' };
const TZ = 'America/Denver';
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (d, o) => new Date(d).toLocaleString('en-US', { timeZone: TZ, ...o });
export const day = d => fmt(d, { weekday: 'long', month: 'long', day: 'numeric' });
export const range = (d, mins = 120) => { const a = fmt(d, { hour: 'numeric', minute: '2-digit' }).replace(':00', ''), b = fmt(new Date(new Date(d).getTime() + mins * 6e4), { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  return (a.slice(-2) === b.slice(-2) ? a.slice(0, -3) : a) + '–' + b + ' MT'; };
const money = c => '$' + (c / 100).toFixed(c % 100 ? 2 : 0);
const btn = (href, label, accent = true) => `<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;border-radius:980px;font-weight:600;font-size:15px;text-decoration:none;${accent ? 'background:#34C759;color:#1d1d1f' : 'background:#fff;color:#1d1d1f;border:1.5px solid #1d1d1f'}">${esc(label)}</a>`;
const names = s => [s.athlete, ...(s.additional_players || []).map(p => p.athlete)].filter(Boolean).join(', ');
function shell(title, pre, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 18px;font-size:14px;font-weight:600;letter-spacing:-.01em"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#34C759;vertical-align:-6px;margin-right:8px"></span>${BRAND}</td></tr>
<tr><td style="background:#000;border-radius:24px 24px 0 0;padding:34px 28px 30px;text-align:center"><div style="color:#34C759;font-size:14px;font-weight:600;margin-bottom:8px">${esc(pre)}</div><div style="color:#fff;font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-.02em">${esc(title)}</div></td></tr>
<tr><td style="background:#fff;border-radius:0 0 24px 24px;padding:28px">${body}</td></tr>
<tr><td align="center" style="padding:22px 10px;font-size:12px;line-height:1.6;color:#6e6e73">${BRAND} · Farmington, NM<br>Questions? Reply to this email or call/text <a href="tel:${PHONE_TEL}" style="color:#248A3D">${PHONE}</a>.<br>${esc(LOCATION.name)}, ${esc(LOCATION.address)}</td></tr>
</table></td></tr></table></body></html>`;
}
function sessionRows(sessions, hi) {
  return sessions.map((r, i) => `<tr><td style="padding:12px 14px;border-top:${i ? '1px solid #e8e8ed' : '0'};${r.id === hi ? 'background:#EEF9F1;' : ''}">
<div style="font-weight:600;font-size:15px">${esc(day(r.starts_at))}</div>
<div style="font-size:14px;color:#424245;margin-top:2px">${esc(range(r.starts_at, r.duration_min || 120))} · ${esc(r.workout_type || '')} · <span style="color:${r.status === 'confirmed' ? '#1d7a3a' : '#248A3D'}">${r.status === 'confirmed' ? 'Confirmed' : 'Pending coach confirmation'}</span></div></td></tr>`).join('');
}
const box = inner => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;border-radius:16px;margin:0 0 20px">${inner}</table>`;
const where = () => `<p style="margin:0 0 6px;font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.04em;font-weight:600">Where</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5"><b>${esc(LOCATION.name)}</b><br>${esc(LOCATION.address)}</p><p style="margin:0 0 24px">${btn(LOCATION.apple, 'Open in Maps', false)}</p>`;

const n = ss => ss.length === 1 ? '1 session · 2 hrs' : `${ss.length} sessions · 2 hrs each`;
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const groupName = g => g.label || (g.weekdays || []).map(d => DAYS[d]).join('/') + ' group';
export const groupWhen = g => (g.weekdays || []).map(d => DAYS[d]).join(' & ') + (g.sessions && g.sessions[0] ? ', ' + range(g.sessions[0]) : '');
const groupBox = g => box(`<tr><td style="padding:16px 14px;font-size:15px;line-height:1.6"><b>${esc(groupName(g))}</b><br>${esc(groupWhen(g))}<br>${g.taken} of ${g.capacity} spots filled · runs with ${g.min_players || 2}+ players</td></tr>`);
export function confirmationEmail({ signup: s, sessions, token, group }) {
  const link = `${SITE}/my.html?token=${encodeURIComponent(token)}`;
  const progs = (s.programs || [s.program]).map(k => PROG[k] || k).join(' + ');
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${esc((s.parent || '').split(' ')[0])}, thanks! Your payment is complete and <b>${esc(names(s))}</b> ${(s.additional_players||[]).length?'are':'is'} booked.</p>
${group ? groupBox(group) + `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">We'll add other athletes to this group as families sign up. If it has fewer than ${group.min_players || 2} players 2 days before the first session, we'll email you to move to another group or get a full refund.</p>` : ''}
${box(`<tr><td style="padding:16px 14px;font-size:15px;line-height:1.6"><b>${esc(PKG[s.package] || s.package)}</b> · ${n(sessions)}<br>Paid: <b>${money(s.amount_paid_cents ?? s.price_cents)}</b><br>${esc(progs)}</td></tr>`)}
<p style="margin:0 0 6px;font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.04em;font-weight:600">Your ${sessions.length === 1 ? 'session' : sessions.length + ' sessions'} (Denver time)</p>
${box(sessionRows(sessions))}
${where()}
<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${group ? 'See your group sessions on your dashboard:' : 'See your sessions or move one (up to 24 hours before it starts) on your dashboard:'}</p>
<p style="margin:0 0 8px">${btn(link, 'My sessions & reschedule')}</p>
<p style="margin:22px 0 8px;font-size:15px;line-height:1.5"><b>Waiver:</b> signed online. Your signed copy was emailed when you signed. If a waiver is still missing, we'll email you a link to sign it.</p>
<p style="margin:14px 0 0;font-size:12px;color:#86868b;line-height:1.5">This link is private to your booking. Don't share it.</p>`;
  return { subject: `You're booked: ${sessions.length === 1 ? '1 session' : sessions.length + ' sessions'} with ${BRAND}`, html: shell("You're booked.", 'Payment confirmed', body),
    text: `Payment confirmed. ${names(s)} is booked: ${PKG[s.package] || s.package}, ${money(s.amount_paid_cents ?? s.price_cents)}.\n` +
      (group ? `Group: ${groupName(group)} (${groupWhen(group)}), ${group.taken} of ${group.capacity} spots filled. Runs with ${group.min_players || 2}+ players; if not, we'll email you to move groups or get a refund.\n` : '') +
      sessions.map(r => `- ${day(r.starts_at)}, ${range(r.starts_at, r.duration_min || 120)}, ${r.workout_type} (${r.status})`).join('\n') +
      `\n\nWhere: ${LOCATION.name}, ${LOCATION.address}\nMaps: ${LOCATION.apple}\nMy sessions & reschedule: ${link}\nWaiver: signed online (your signed copy was emailed separately).\nQuestions? Reply or call/text ${PHONE}.` };
}

export function rescheduledEmail({ signup: s, sessions, token, from, to, session_id }) {
  const link = `${SITE}/my.html?token=${encodeURIComponent(token)}`, r = sessions.find(x => x.id === session_id) || { duration_min: 120 };
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${esc((s.parent || '').split(' ')[0])}, your session for <b>${esc(names(s))}</b> has been moved.</p>
${box(`<tr><td style="padding:16px 14px;font-size:15px;line-height:1.6"><span style="color:#86868b;text-decoration:line-through">${esc(day(from))}, ${esc(range(from, r.duration_min))}</span><br><b>${esc(day(to))}, ${esc(range(to, r.duration_min))}</b> · ${esc(r.workout_type || '')}<br><span style="color:#248A3D">A coach will confirm the new time.</span></td></tr>`)}
<p style="margin:0 0 6px;font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.04em;font-weight:600">All your sessions (Denver time)</p>
${box(sessionRows(sessions, session_id))}
${where()}
<p style="margin:0 0 8px">${btn(link, 'My sessions')}</p>`;
  return { subject: `Reschedule confirmed: ${day(to)}, ${range(to, r.duration_min)}`, html: shell('Reschedule confirmed.', 'Session moved', body),
    text: `Your session moved from ${day(from)}, ${range(from, r.duration_min)} to ${day(to)}, ${range(to, r.duration_min)} (${r.workout_type}). A coach will confirm.\nMy sessions: ${link}\nQuestions? Reply or call/text ${PHONE}.` };
}

export function waiverCopyEmail({ signup: s, payload: p }) {
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${esc((s.parent || '').split(' ')[0])}, thanks for signing the waiver for <b>${esc(p.athlete)}</b>.</p>
${box(`<tr><td style="padding:16px 14px;font-size:15px;line-height:1.6">Signed by <b>${esc(p.signer)}</b><br>${esc(fmt(p.signed_at, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))} MT<br>Waiver version ${esc(p.version)}</td></tr>`)}
<p style="margin:0 0 14px;font-size:15px;line-height:1.5">Download your signed copy (this link expires in 7 days; ask us any time for another copy):</p>
<p style="margin:0 0 8px">${btn(p.url, 'Download signed waiver (PDF)')}</p>`;
  return { subject: `Signed waiver: ${p.athlete}`, html: shell('Waiver signed.', 'Your copy', body),
    text: `Thanks for signing the waiver for ${p.athlete} (signed by ${p.signer}, version ${p.version}).\nDownload your signed copy (link expires in 7 days): ${p.url}\nQuestions? Reply or call/text ${PHONE}.` };
}
export function waiverReminderEmail({ signup: s, wtoken }) {
  const link = `${SITE}/book.html?sign=${encodeURIComponent(wtoken)}`;
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${esc((s.parent || '').split(' ')[0])}, we still need a signed waiver for <b>${esc(names(s))}</b> before training starts. It takes about 2 minutes.</p>
<p style="margin:0 0 8px">${btn(link, 'Sign the waiver online')}</p>
<p style="margin:14px 0 0;font-size:12px;color:#86868b;line-height:1.5">This link is private to your booking and works for 30 days. Don't share it.</p>`;
  return { subject: `Please sign your waiver · ${BRAND}`, html: shell('One more step.', 'Waiver needed', body),
    text: `We still need a signed waiver for ${names(s)} before training starts.\nSign online (link works 30 days): ${link}\nQuestions? Reply or call/text ${PHONE}.` };
}
// Per-athlete link: book.html?sign=<token>&athlete=N (N = 1-based player number).
export const athleteLink = l => `${SITE}/book.html?sign=${encodeURIComponent(l.token)}&athlete=${l.index + 1}`;
// To the parent of one unsigned athlete (their own email was given at booking), or the booking parent for athlete 1.
export function waiverAthleteEmail({ signup: s, link: l }) {
  const url = athleteLink(l), first = esc((l.parent || '').split(' ')[0]);
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${first}, <b>${esc(l.athlete)}</b> is booked for training with ${BRAND}${l.index ? ` (booked by ${esc(s.parent)})` : ''}. A parent or legal guardian needs to sign the waiver online before ${esc((l.athlete || '').split(' ')[0])} can get on the court. It takes about 2 minutes on your phone.</p>
<p style="margin:0 0 8px">${btn(url, 'Sign the waiver')}</p>
<p style="margin:14px 0 0;font-size:12px;color:#86868b;line-height:1.5">This link is only for ${esc(l.athlete)}'s waiver and works for 30 days.</p>`;
  return { subject: `Please sign ${l.athlete}'s waiver · ${BRAND}`, html: shell('Waiver needed.', 'Before the first session', body),
    text: `${l.athlete} is booked for training with ${BRAND}. Please sign the waiver online before training (about 2 minutes): ${url}\nThe link works for 30 days. Questions? Reply or call/text ${PHONE}.` };
}
// To the booking parent: other players' waivers are unsigned and we have no email for them.
export function waiverShareEmail({ signup: s, links }) {
  const rows = links.map((l, i) => `<tr><td style="padding:12px 14px;border-top:${i ? '1px solid #e8e8ed' : '0'};font-size:15px;line-height:1.5"><b>${esc(l.athlete)}</b>${l.parent ? ` · parent ${esc(l.parent)}` : ''}<br><a href="${esc(athleteLink(l))}" style="color:#248A3D;word-break:break-all">${esc(athleteLink(l))}</a></td></tr>`).join('');
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${esc((s.parent || '').split(' ')[0])}, ${links.length === 1 ? 'one player in your group still needs' : links.length + ' players in your group still need'} a signed waiver. Players without a signed waiver aren't cleared for the court. Please text or email each family their link:</p>
${box(rows)}
<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#424245">Each link is for that player only, works for 30 days, and takes about 2 minutes on a phone. You can also share them from your booking dashboard.</p>`;
  return { subject: `Send the waiver links to your group · ${BRAND}`, html: shell('Waivers still needed.', 'Share with your group', body),
    text: `These players in your group still need a signed waiver (not cleared for the court until signed). Send each family their link:\n` +
      links.map(l => `- ${l.athlete}: ${athleteLink(l)}`).join('\n') + `\nLinks work for 30 days. Questions? Reply or call/text ${PHONE}.` };
}

// Open group under minimum 48 h before start: offer a move (link) or a refund. Refunds are handled by the coach.
export function groupUnderMinEmail({ signup: s, payload: p }) {
  const g = p.group, first = esc((s.parent || '').split(' ')[0]);
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${first}, the open group <b>${esc(s.athlete)}</b> joined doesn't have the ${g.min_players || 2} players it needs to run yet.</p>
${groupBox(g)}
<p style="margin:0 0 14px;font-size:15px;line-height:1.5">You can move ${esc((s.athlete || '').split(' ')[0])} to another group with open spots, or ask for a full refund. Either takes one tap:</p>
<p style="margin:0 0 8px">${btn(p.move_url, 'Move to another group or get a refund')}</p>
<p style="margin:14px 0 0;font-size:14px;line-height:1.5;color:#424245">Prefer to talk it through? Reply to this email or call/text ${PHONE}. A coach will reach out too.</p>`;
  return { subject: `Your open group needs one more player · ${BRAND}`, html: shell('Your group is short a player.', 'Open group update', body),
    text: `The open group ${s.athlete} joined (${groupName(g)}, ${groupWhen(g)}) has ${g.paid} of ${g.min_players || 2} players needed. Move to another group or ask for a full refund: ${p.move_url}\nQuestions? Reply or call/text ${PHONE}.` };
}
export function groupMovedEmail({ signup: s, sessions, group }) {
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${esc((s.parent || '').split(' ')[0])}, <b>${esc(s.athlete)}</b> is now in a new open group.</p>
${groupBox(group)}
<p style="margin:0 0 6px;font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.04em;font-weight:600">Sessions (Denver time)</p>
${box(sessionRows(sessions))}${where()}`;
  return { subject: `Group changed: ${groupName(group)} · ${BRAND}`, html: shell('New group confirmed.', 'Open group', body),
    text: `${s.athlete} moved to ${groupName(group)} (${groupWhen(group)}), ${group.taken} of ${group.capacity} spots filled.\n` + sessions.map(r => `- ${day(r.starts_at)}, ${range(r.starts_at)}`).join('\n') + `\nQuestions? Reply or call/text ${PHONE}.` };
}
