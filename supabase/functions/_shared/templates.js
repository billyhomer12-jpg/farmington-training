// Email templates (plain ESM: used by Deno edge functions and by the Node preview script).
// Apple-style: white card on #f5f5f7, black text, gold #C5B358 accents. Inline CSS + table layout for email clients.
export const BRAND = 'Four Corners Hoops & Performance';
export const FROM = 'Four Corners Hoops & Performance <bookings@fourcornershoopsandperformance.com>';
export const REPLY_TO = 'fourcornershoopsandperformance@gmail.com';
export const PHONE = '(505) 231-0725';
export const PHONE_TEL = '+15052310725';
export const LOCATION = { name: 'San Juan College Health & Human Performance Center', address: '4601 College Blvd, Farmington, NM 87402, United States',
  apple: 'https://maps.apple.com/place?address=4601%20College%20Blvd,%20Farmington,%20NM%20%2087402,%20United%20States&coordinate=36.770237,-108.173952&name=San%20Juan%20College%20Health%20%26%20Human%20Performance%20Center&place-id=IBC9B4F4B78DAE618&map=explore' };
export const SITE = 'https://www.fourcornershoopsandperformance.com';
const PROG = { 'Basketball Skills': 'Basketball Training', 'Youth Strength Training': 'Weightlifting', 'Athletic Performance': 'Conditioning' };
const PKG = { '1on1': '1-on-1', group2: 'Small group · 2 players', group3: 'Small group · 3 players', group4: 'Small group · 4 players' };
const TZ = 'America/Denver';
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (d, o) => new Date(d).toLocaleString('en-US', { timeZone: TZ, ...o });
export const day = d => fmt(d, { weekday: 'long', month: 'long', day: 'numeric' });
export const range = (d, mins = 120) => { const a = fmt(d, { hour: 'numeric', minute: '2-digit' }).replace(':00', ''), b = fmt(new Date(new Date(d).getTime() + mins * 6e4), { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  return (a.slice(-2) === b.slice(-2) ? a.slice(0, -3) : a) + '–' + b + ' MT'; };
const money = c => '$' + (c / 100).toFixed(c % 100 ? 2 : 0);
const btn = (href, label, gold = true) => `<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;border-radius:980px;font-weight:600;font-size:15px;text-decoration:none;${gold ? 'background:#C5B358;color:#1d1d1f' : 'background:#fff;color:#1d1d1f;border:1.5px solid #1d1d1f'}">${esc(label)}</a>`;
const names = s => [s.athlete, ...(s.additional_players || []).map(p => p.athlete)].filter(Boolean).join(', ');
function shell(title, pre, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 18px;font-size:14px;font-weight:600;letter-spacing:-.01em"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#C5B358;vertical-align:-6px;margin-right:8px"></span>${BRAND}</td></tr>
<tr><td style="background:#000;border-radius:24px 24px 0 0;padding:34px 28px 30px;text-align:center"><div style="color:#C5B358;font-size:14px;font-weight:600;margin-bottom:8px">${esc(pre)}</div><div style="color:#fff;font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-.02em">${esc(title)}</div></td></tr>
<tr><td style="background:#fff;border-radius:0 0 24px 24px;padding:28px">${body}</td></tr>
<tr><td align="center" style="padding:22px 10px;font-size:12px;line-height:1.6;color:#6e6e73">${BRAND} · Farmington, NM<br>Questions? Reply to this email or call/text <a href="tel:${PHONE_TEL}" style="color:#6F5F22">${PHONE}</a>.<br>${esc(LOCATION.name)}, ${esc(LOCATION.address)}</td></tr>
</table></td></tr></table></body></html>`;
}
function sessionRows(sessions, hi) {
  return sessions.map((r, i) => `<tr><td style="padding:12px 14px;border-top:${i ? '1px solid #e8e8ed' : '0'};${r.id === hi ? 'background:#faf6e6;' : ''}">
<div style="font-weight:600;font-size:15px">${esc(day(r.starts_at))}</div>
<div style="font-size:14px;color:#424245;margin-top:2px">${esc(range(r.starts_at, r.duration_min || 120))} · ${esc(r.workout_type || '')} · <span style="color:${r.status === 'confirmed' ? '#1d7a3a' : '#6F5F22'}">${r.status === 'confirmed' ? 'Confirmed' : 'Pending coach confirmation'}</span></div></td></tr>`).join('');
}
const box = inner => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;border-radius:16px;margin:0 0 20px">${inner}</table>`;
const where = () => `<p style="margin:0 0 6px;font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.04em;font-weight:600">Where</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5"><b>${esc(LOCATION.name)}</b><br>${esc(LOCATION.address)}</p><p style="margin:0 0 24px">${btn(LOCATION.apple, 'Open in Maps', false)}</p>`;

export function confirmationEmail({ signup: s, sessions, token }) {
  const link = `${SITE}/my.html?token=${encodeURIComponent(token)}`;
  const progs = (s.programs || [s.program]).map(k => PROG[k] || k).join(' + ');
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${esc((s.parent || '').split(' ')[0])}, thanks! Your payment is complete and <b>${esc(names(s))}</b> ${(s.additional_players||[]).length?'are':'is'} booked.</p>
${box(`<tr><td style="padding:16px 14px;font-size:15px;line-height:1.6"><b>${esc(PKG[s.package] || s.package)}</b> · 4 sessions · 2 hrs each<br>Paid: <b>${money(s.amount_paid_cents ?? s.price_cents)}</b><br>${esc(progs)}</td></tr>`)}
<p style="margin:0 0 6px;font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.04em;font-weight:600">Your 4 sessions (Denver time)</p>
${box(sessionRows(sessions))}
${where()}
<p style="margin:0 0 14px;font-size:15px;line-height:1.5">See your sessions or move one (up to 24 hours before it starts) on your dashboard:</p>
<p style="margin:0 0 8px">${btn(link, 'My sessions & reschedule')}</p>
<p style="margin:22px 0 8px;font-size:15px;line-height:1.5"><b>Waiver:</b> Download &amp; sign the waiver and bring it to your first session (or sign a paper copy at drop-off).</p>
<p style="margin:0 0 8px">${btn(`${SITE}/waiver.pdf`, 'Download the waiver (PDF)', false)}</p>
<p style="margin:14px 0 0;font-size:12px;color:#86868b;line-height:1.5">This link is private to your booking. Don't share it.</p>`;
  return { subject: `You're booked: 4 sessions with ${BRAND}`, html: shell("You're booked.", 'Payment confirmed', body),
    text: `Payment confirmed. ${names(s)} is booked: ${PKG[s.package] || s.package}, ${money(s.amount_paid_cents ?? s.price_cents)}.\n` +
      sessions.map(r => `- ${day(r.starts_at)}, ${range(r.starts_at, r.duration_min || 120)}, ${r.workout_type} (${r.status})`).join('\n') +
      `\n\nWhere: ${LOCATION.name}, ${LOCATION.address}\nMaps: ${LOCATION.apple}\nMy sessions & reschedule: ${link}\nWaiver (download, sign, bring to your first session): ${SITE}/waiver.pdf\nQuestions? Reply or call/text ${PHONE}.` };
}

export function rescheduledEmail({ signup: s, sessions, token, from, to, session_id }) {
  const link = `${SITE}/my.html?token=${encodeURIComponent(token)}`, r = sessions.find(x => x.id === session_id) || { duration_min: 120 };
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hi ${esc((s.parent || '').split(' ')[0])}, your session for <b>${esc(names(s))}</b> has been moved.</p>
${box(`<tr><td style="padding:16px 14px;font-size:15px;line-height:1.6"><span style="color:#86868b;text-decoration:line-through">${esc(day(from))}, ${esc(range(from, r.duration_min))}</span><br><b>${esc(day(to))}, ${esc(range(to, r.duration_min))}</b> · ${esc(r.workout_type || '')}<br><span style="color:#6F5F22">A coach will confirm the new time.</span></td></tr>`)}
<p style="margin:0 0 6px;font-size:13px;color:#6e6e73;text-transform:uppercase;letter-spacing:.04em;font-weight:600">All your sessions (Denver time)</p>
${box(sessionRows(sessions, session_id))}
${where()}
<p style="margin:0 0 8px">${btn(link, 'My sessions')}</p>`;
  return { subject: `Reschedule confirmed: ${day(to)}, ${range(to, r.duration_min)}`, html: shell('Reschedule confirmed.', 'Session moved', body),
    text: `Your session moved from ${day(from)}, ${range(from, r.duration_min)} to ${day(to)}, ${range(to, r.duration_min)} (${r.workout_type}). A coach will confirm.\nMy sessions: ${link}\nQuestions? Reply or call/text ${PHONE}.` };
}
