// Signed waiver PDF (pdf-lib): waiver text + filled fields + signature image + audit footer on every page.
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

// Helvetica (WinAnsi) can't draw every Unicode character; map the common ones and drop the rest.
const clean = (t: string) => String(t ?? '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-')
  .replace(/\u00B7/g, '-').replace(/[^\x20-\x7E\u00A0-\u00FF\n]/g, '?');

export async function waiverPdf(o: { title: string; body: string; version: string; versionSha: string; fields: [string, string][];
  signer: string; relationship: string; signaturePng: Uint8Array; signedAt: string; ip: string; ua: string; waiverId: string; bookingRef: string; sigSha: string }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Signed waiver - ${clean(o.fields[0]?.[1] || '')}`); doc.setProducer('Four Corners Hoops & Performance'); doc.setCreationDate(new Date(o.signedAt));
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54, FOOT = 70, green = rgb(0.118, 0.482, 0.204), mut = rgb(0.43, 0.43, 0.45);
  let page = doc.addPage([W, H]), y = H - M;
  const np = () => { page = doc.addPage([W, H]); y = H - M; };
  const wrap = (t: string, f: typeof font, size: number, width: number) => {
    const out: string[] = [];
    for (const para of clean(t).split('\n')) { let line = '';
      for (const w of para.split(/\s+/)) { const tryL = line ? line + ' ' + w : w;
        if (f.widthOfTextAtSize(tryL, size) > width && line) { out.push(line); line = w; } else line = tryL; }
      out.push(line); }
    return out; };
  const text = (t: string, size = 10, f = font, color = rgb(0.11, 0.11, 0.12), gap = 3) => {
    for (const l of wrap(t, f, size, W - 2 * M)) { if (y - size < FOOT + 10) np(); page.drawText(l, { x: M, y: y - size, size, font: f, color }); y -= size + gap; } };
  for (const block of o.body.split(/\n\n+/)) {
    if (block.startsWith('# ')) { text(block.slice(2), 18, bold); page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 2.5, color: rgb(0.204, 0.78, 0.349) }); y -= 14; }
    else if (block.startsWith('## ')) { y -= 4; text(block.slice(3), 11.5, bold); }
    else { text(block, 9.5); y -= 5; }
  }
  if (y < FOOT + 10 + 230) np(); else y -= 6;
  text('Completed online', 12, bold, green); y -= 2;
  for (const [k, v] of o.fields) text(`${k}: ${v || '-'}`, 10);
  y -= 4; text(`Signed by ${o.signer} (${o.relationship}) by drawing the signature below and checking the consent box.`, 10, bold);
  const img = await doc.embedPng(o.signaturePng), k = Math.min(220 / img.width, 80 / img.height), sw = img.width * k, sh = img.height * k;
  if (y - sh - 30 < FOOT + 10) np();
  page.drawImage(img, { x: M, y: y - sh - 4, width: sw, height: sh }); y -= sh + 8;
  page.drawLine({ start: { x: M, y }, end: { x: M + 260, y }, thickness: 1, color: rgb(0.11, 0.11, 0.12) }); y -= 12;
  text(`Signature - ${o.signer} - ${new Date(o.signedAt).toLocaleString('en-US', { timeZone: 'America/Denver', dateStyle: 'long', timeStyle: 'short' })} MT`, 9, font, mut);
  const pages = doc.getPages(), audit = [
    `Electronically signed ${o.signedAt} (server time, UTC) - IP ${o.ip || 'unknown'} - Waiver ID ${o.waiverId}`,
    `Booking ${o.bookingRef} - waiver version ${o.version} - text SHA-256 ${o.versionSha}`,
    `Signature SHA-256 ${o.sigSha}`,
    `Device: ${o.ua.slice(0, 140) || 'unknown'}` ];
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: FOOT - 8 }, end: { x: W - M, y: FOOT - 8 }, thickness: 0.5, color: mut });
    audit.forEach((l, j) => p.drawText(clean(l).slice(0, 150), { x: M, y: FOOT - 20 - j * 9, size: 6.5, font, color: mut }));
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 50, y: FOOT + 2, size: 6.5, font, color: mut });
  });
  return await doc.save();
}
