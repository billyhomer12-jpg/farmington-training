// Online waiver signing (book.html before payment, my.html, reminder links).
// POST {action:'context', ref|token|wtoken}  -> waiver text + athletes + which are signed
// POST {action:'sign', ref|token|wtoken, athlete_index, athlete_name, athlete_dob, emergency_name, emergency_phone,
//       medical_notes, photo_opt_in, signer_name, signer_relationship, consent, version, version_sha256, signature (data:image/png;base64)}
// Rejects missing/invalid credentials, unsigned forms and blank signatures. Files go to the PRIVATE "waivers" bucket.
// Deploy: supabase functions deploy waiver-sign --no-verify-jwt --use-api
import { db, flushOutbox, sendEmail, cors } from '../_shared/send.ts';
import { waiverCopyEmail } from '../_shared/templates.js';
import { waiverPdf } from '../_shared/waiverpdf.ts';
import { remindUnsigned } from '../_shared/remind.ts';

const J = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
const str = (v: unknown, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return J({ error: 'method not allowed' }, 405);
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return J({ error: 'bad request' }, 400);
  // Daily pg_cron run: remind every paid booking that still has an unsigned athlete (each link at most every 2 days, 4 times).
  if (b.action === 'cron') {
    const sb0 = db(); const { data: ok } = await sb0.rpc('training_cron_key_ok', { p: String(b.key || '') });
    if (ok !== true) return J({ error: 'forbidden' }, 403);
    const { data: ids } = await sb0.rpc('training_waiver_due'); let sent = 0;
    for (const id of (ids || []) as number[]) { try { sent += (await remindUnsigned(Number(id))).sent; } catch (e) { console.error('cron remind', id, e); } }
    return J({ ok: true, bookings: (ids || []).length, sent });
  }
  const ref = typeof b.ref === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.ref) ? b.ref : null;
  const token = typeof b.token === 'string' && b.token.length >= 32 && b.token.length < 200 ? b.token : null;
  const wtoken = typeof b.wtoken === 'string' && b.wtoken.length >= 32 && b.wtoken.length < 200 ? b.wtoken : null;
  if (!ref && !token && !wtoken) return J({ error: 'invalid link' }, 401);
  const sb = db();
  // Share links for the other group players (booking parent: book.html by ref, my.html by dashboard token).
  if (b.action === 'links') {
    const { data: L, error: le } = await sb.rpc('training_waiver_share_links', { p_ref: ref, p_token: ref ? null : token });
    if (le || !L || L.error) return J({ error: 'This link is invalid or has expired.' }, 401);
    return J({ links: L.links.map((l: any) => ({ index: l.index, athlete: l.athlete, parent: l.parent, expires_at: l.expires_at,
      url: `https://fourcornershoopsandperformance.com/book.html?sign=${encodeURIComponent(l.token)}&athlete=${l.index + 1}` })) });
  }
  const { data: ctx, error } = await sb.rpc('training_waiver_ctx', { p_ref: ref, p_token: ref ? null : token, p_wtoken: ref || token ? null : wtoken });
  if (error) return J({ error: 'Something went wrong. Please try again.' }, 500);
  if (!ctx || ctx.error) return J({ error: 'This signing link is invalid or has expired. Please call or text us.' }, 401);
  // A per-athlete link (ctx.only) opens just that athlete; its signer is that athlete's parent.
  const only = Number.isInteger(ctx.only) ? ctx.only : null;
  if (b.action === 'context') return J({ athletes: ctx.athletes.filter((a: any) => only === null || a.index === only).map((a: any) => ({ index: a.index, athlete: a.athlete, parent: a.parent })),
    total: ctx.athletes.length, only, signed: ctx.signed, parent: only ? null : ctx.parent, version: ctx.version });
  if (b.action !== 'sign') return J({ error: 'bad request' }, 400);

  // ---- validate the form (server side; the browser checks are only for convenience)
  const idx = Number(b.athlete_index), a = ctx.athletes.find((x: any) => x.index === idx);
  if (!Number.isInteger(idx) || !a || (only !== null && idx !== only)) return J({ error: 'Unknown athlete.' }, 400);
  if (ctx.signed.includes(idx)) return J({ error: 'This athlete\'s waiver is already signed.' }, 409);
  const f = { athlete_name: str(b.athlete_name), athlete_dob: str(b.athlete_dob, 10), emergency_name: str(b.emergency_name), emergency_phone: str(b.emergency_phone, 50),
    medical_notes: str(b.medical_notes, 2000), photo_opt_in: b.photo_opt_in === true, signer_name: str(b.signer_name), signer_relationship: str(b.signer_relationship, 40) };
  const errs: string[] = [];
  if (!/\S+\s+\S+/.test(f.athlete_name)) errs.push('athlete first and last name');
  const dob = new Date(f.athlete_dob + 'T12:00:00Z'), age = (Date.now() - dob.getTime()) / 31557600000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.athlete_dob) || isNaN(age) || age < 4 || age > 30) errs.push('athlete date of birth');
  if (!/\S+\s+\S+/.test(f.emergency_name)) errs.push('emergency contact name');
  if (f.emergency_phone.replace(/\D/g, '').length < 10) errs.push('emergency phone');
  if (!/\S+\s+\S+/.test(f.signer_name)) errs.push('your full name');
  if (!['Parent', 'Legal guardian'].includes(f.signer_relationship)) errs.push('relationship');
  if (b.consent !== true) errs.push('the consent checkbox');
  if (b.version !== ctx.version.version || b.version_sha256 !== ctx.version.sha256) return J({ error: 'The waiver text changed. Please reload the page.' }, 409);
  const m = typeof b.signature === 'string' ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(b.signature) : null;
  let png: Uint8Array | null = null;
  if (m && m[1].length < 700000) { try { png = Uint8Array.from(atob(m[1]), c => c.charCodeAt(0)); } catch { png = null; } }
  const isPng = png && png.length > 8 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
  const ink = Number(b.ink);
  if (!isPng || png!.length < 1200 || !Number.isFinite(ink) || ink < 40) errs.push('a signature (draw it in the box)');
  if (errs.length) return J({ error: 'Please complete: ' + errs.join(', ') + '.' }, 400);

  // ---- files + PDF
  const id = crypto.randomUUID(), signedAt = new Date().toISOString();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || '';
  const ua = (req.headers.get('user-agent') || '').slice(0, 1000);
  const sigSha = await hex(png!), base = `${ctx.signup_id}/${id}`;
  const fields: [string, string][] = [['Athlete name', f.athlete_name], ['Athlete DOB', f.athlete_dob], ['Emergency contact', f.emergency_name], ['Emergency phone', f.emergency_phone],
    ['Allergies, conditions & medications', f.medical_notes || 'None listed'], ['Photo/video opt-in', f.photo_opt_in ? 'Yes - photos and video of the athlete may be used on the website and social media' : 'No'],
    ['Parent/guardian name', `${f.signer_name} (${f.signer_relationship})`], ['Date', new Date(signedAt).toLocaleDateString('en-US', { timeZone: 'America/Denver', dateStyle: 'long' })]];
  let pdf: Uint8Array;
  try {
    pdf = await waiverPdf({ title: ctx.version.title, body: ctx.version.body, version: ctx.version.version, versionSha: ctx.version.sha256, fields, signer: f.signer_name,
      relationship: f.signer_relationship, signaturePng: png!, signedAt, ip, ua, waiverId: id, bookingRef: ctx.ref, sigSha });
  } catch (e) { console.error('pdf', e); return J({ error: 'We couldn\'t read that signature. Please clear it and sign again.' }, 400); }
  const pdfSha = await hex(pdf);
  const st = sb.storage.from('waivers');
  const u1 = await st.upload(`${base}/signature.png`, png!, { contentType: 'image/png', upsert: false });
  const u2 = u1.error ? u1 : await st.upload(`${base}/waiver.pdf`, pdf, { contentType: 'application/pdf', upsert: false });
  if (u1.error || u2.error) { console.error('upload', u1.error || u2.error); return J({ error: 'Could not save the waiver. Please try again.' }, 500); }
  const { data: ins, error: e2 } = await sb.rpc('training_waiver_insert', { p: { id, signup_id: ctx.signup_id, athlete_index: idx, ...f, consent: true, version: ctx.version.version,
    version_sha256: ctx.version.sha256, signature_path: `${base}/signature.png`, signature_sha256: sigSha, pdf_path: `${base}/waiver.pdf`, pdf_sha256: pdfSha, signed_at: signedAt, ip, user_agent: ua } });
  if (e2 || ins?.error) { await st.remove([`${base}/signature.png`, `${base}/waiver.pdf`]); return J({ error: ins?.error || 'Could not save the waiver. Please try again.' }, e2 ? 500 : 409); }

  // ---- parent copy: short-lived (7-day) signed link, queued in email_outbox and sent now
  try {
    const { data: su } = await st.createSignedUrl(`${base}/waiver.pdf`, 7 * 86400, { download: `waiver-${f.athlete_name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf` });
    if (su?.signedUrl) {
      await sb.rpc('training_waiver_queue_copy', { p_signup: ctx.signup_id, p_payload: { waiver_id: id, url: su.signedUrl, athlete: f.athlete_name, signer: f.signer_name, signed_at: signedAt, version: ctx.version.version } });
      // Copy goes to whoever was emailed for this athlete; a group player's parent without an email gets none (booking parent does).
      const to = idx === 0 ? null : ctx.athletes.find((x: any) => x.index === idx)?.email;
      if (to) {
        await sendEmail(to, waiverCopyEmail({ signup: { parent: a.parent || f.signer_name }, payload: { url: su.signedUrl, athlete: f.athlete_name, signer: f.signer_name, signed_at: signedAt, version: ctx.version.version } }));
      } else await flushOutbox(ctx.signup_id, token || '');
    }
  } catch (e) { console.error('copy email', e); }
  return J({ ok: true, id, remaining: ins.remaining, signed_at: signedAt });
});
