// Propozice (tournament / league information) as an A4 PDF, built from the edition's fields.
// Used by src/pages/propozice/[id].pdf.ts. Czech and English versions share one layout.
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const NAVY = '#0E1B3D', RED = '#D3242B', YELLOW = '#F2B33D', MUTED = '#5A6680', LINE = '#DDE1EA', TEXT = '#0E1B3D';
const ROOT = process.cwd();
const font = (f) => path.join(ROOT, 'src/fonts', f);

const T = {
  cs: {
    kind: { tournament: 'PROPOZICE', league: 'PROPOZICE LIGY' }, date: 'Datum', venue: 'Místo', org: 'Pořadatel',
    fee: 'Startovné', fees: 'Poplatky', feeTbd: 'upřesní pořadatel', orgName: 'Česká carromová asociace',
    program: 'Program', rules: 'Pravidla a hodnocení', signup: 'Přihlášky', pay: 'Platba', system: 'Hrací systém', dates: 'Termíny',
    icf: 'Hraje se podle pravidel ICF.', playedFrom: 'Hraje se od',
    mcr: (i, n, name) => `Turnaj je ${i}. z\u00a0${n} turnajů soutěže ${name}.`,
    deadline: (d) => `Přihlášky do ${d}`, capacity: (n) => `Kapacita ${n} hráčů, rozhoduje pořadí přihlášek.`,
    form: 'Přihláška je na stránce turnaje:', formLeague: 'Přihláška do ligy i zápis na hrací večery jsou na stránce ligy:',
    account: 'Účet ČCA', iban: 'IBAN', payNote: 'Nejlépe převodem předem. Do zprávy pro příjemce napište své jméno.',
    qrPage: 'Stránka a přihláška', qrPay: 'QR Platba',
    footer: (d) => `Česká carromová asociace · vytvořeno automaticky z údajů ${d}`, footerKind: { tournament: 'turnaje', league: 'sezóny' },
    group: (until, legs, w, dr) => `1. kolo: každý s každým${legs > 1 ? ` (${legs}×)` : ''}${until ? `, odehrát do ${until}` : ''}. Výhra ${w} body, remíza ${dr} bod.`,
    playoff: (groups) => `2. kolo: playoff ve skupinách ${groups.join(', ')} (čtvrtfinále, semifinále, finále a zápasy o umístění).`,
    qf: 'Čtvrtfinále', sf: 'Semifinále', f: 'Finále a vyhlášení', start: 'Začátek sezóny',
  },
  en: {
    kind: { tournament: 'TOURNAMENT INFORMATION', league: 'LEAGUE INFORMATION' }, date: 'Date', venue: 'Venue', org: 'Organiser',
    fee: 'Entry fee', fees: 'Fees', feeTbd: 'to be announced', orgName: 'Czech Carrom Association',
    program: 'Programme', rules: 'Rules and scoring', signup: 'Registration', pay: 'Payment', system: 'Format', dates: 'Dates',
    icf: 'Played under ICF rules.', playedFrom: 'Starts',
    mcr: (i, n, name) => `This is tournament ${i} of ${n} of the ${name}.`,
    deadline: (d) => `Register by ${d}`, capacity: (n) => `Limited to ${n} players, first come first served.`,
    form: 'The registration form is on the tournament page:', formLeague: 'League registration and evening sign-up are on the league page:',
    account: 'ČCA account', iban: 'IBAN', payNote: 'Bank transfer in advance preferred. Put your name in the payment message.',
    qrPage: 'Page and registration', qrPay: 'QR payment (CZ)',
    footer: (d) => `Czech Carrom Association · generated automatically from the ${d} data`, footerKind: { tournament: 'tournament', league: 'season' },
    group: (until, legs, w, dr) => `Round 1: round robin${legs > 1 ? ` (${legs}×)` : ''}${until ? `, to be played by ${until}` : ''}. Win ${w} points, draw ${dr} point.`,
    playoff: (groups) => `Round 2: play-off in groups ${groups.join(', ')} (quarter-finals, semi-finals, finals and placement matches).`,
    qf: 'Quarter-finals', sf: 'Semi-finals', f: 'Finals and prize-giving', start: 'Season starts',
  },
};

const tx = (v, lang) => (v == null ? '' : typeof v === 'string' ? v : v[lang] ?? v.cs ?? '');
const DAYS = { cs: ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtDate(iso, lang = 'cs', withDay = false) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  const day = withDay ? `${DAYS[lang][d.getUTCDay()]} ` : '';
  if (lang === 'en') return `${day}${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${day}${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`;
}

/** "200 Kč" -> 200 (for the QR payment); anything more complex -> null. */
export function feeAmount(fee) {
  const m = /^\s*(\d[\d\s]*)\s*(Kč|CZK)\s*$/i.exec(String(fee ?? ''));
  return m ? Number(m[1].replace(/\s/g, '')) : null;
}

/** QR Platba (SPD 1.0) string for the Czech banking apps. */
export function spd({ iban, amount, message }) {
  const acc = String(iban).replace(/\s/g, '');
  const msg = String(message ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*]/g, '').toUpperCase().slice(0, 60);
  return ['SPD*1.0', `ACC:${acc}`, amount ? `AM:${amount.toFixed(2)}` : null, 'CC:CZK', msg ? `MSG:${msg}` : null].filter(Boolean).join('*');
}

function drawQr(doc, text, x, y, size) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, quiet = 2, cell = size / (n + quiet * 2);
  doc.save().rect(x, y, size, size).fill('#FFFFFF').fillColor(NAVY);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.modules.get(r, c)) doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.1, cell + 0.1);
  }
  doc.fill().restore();
}

/**
 * @param ed      edition from the model (with competition)
 * @param ctx     { lang, name, pageUrl, ranking?: { name, editions, best_of }, payment?: settings.payment }
 * @returns Promise<Buffer>
 */
export function propozicePdf(ed, ctx) {
  const lang = ctx.lang ?? 'cs';
  const L = T[lang];
  const league = ed.competition?.kind === 'league';
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${tx(L.kind, lang)} · ${ctx.name}`, Author: L.orgName } });
  doc.registerFont('r', font('Figtree-Regular.ttf'));
  doc.registerFont('b', font('Figtree-Bold.ttf'));
  doc.registerFont('x', font('Figtree-ExtraBold.ttf'));
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const W = 595.28, M = 48, CW = W - 2 * M;

  // ---- header band
  doc.rect(0, 0, W, 78).fill(NAVY);
  doc.circle(M + 24, 39, 25).fill('#FFFFFF');
  const emblem = path.join(ROOT, 'public/brand/icon-512.png');
  if (fs.existsSync(emblem)) doc.image(emblem, M + 2, 17, { width: 44 });
  doc.fillColor('#FFFFFF').font('x').fontSize(20).text('carrom.cz', M + 60, 22, { lineBreak: false });
  doc.fillColor('#B9C3DD').font('r').fontSize(9.5).text(L.orgName, M + 60, 46, { lineBreak: false });
  doc.fillColor(YELLOW).font('b').fontSize(9.5).text(`${L.kind[league ? 'league' : 'tournament']} · ${lang.toUpperCase()}`, M, 34, { width: CW, align: 'right', characterSpacing: 1.2 });
  doc.rect(0, 78, W, 5).fill(RED);

  // ---- title
  let y = 108;
  const r = ctx.ranking;
  const idx = r ? (r.editions ?? []).indexOf(ed.id) + 1 : 0;
  const eyebrow = r && idx ? `${tx(r.name, lang)} · ${idx}. ${lang === 'en' ? 'tournament' : 'turnaj'}` : tx(ed.competition?.name, lang);
  doc.fillColor(RED).font('b').fontSize(9.5).text(eyebrow.toUpperCase(), M, y, { width: CW, characterSpacing: 1 });
  y = doc.y + 6;
  doc.fillColor(TEXT).font('x').fontSize(30).text(ctx.name, M, y, { width: CW, lineGap: -2 });
  y = doc.y + 18;

  // ---- info grid (2 × 2)
  const venue = [ed.venue?.name, ed.venue?.address, ed.venue?.city && ed.venue?.city !== ed.venue?.name ? ed.venue.city : null].filter(Boolean).join(', ');
  const when = league
    ? `${L.playedFrom} ${fmtDate(ed.start_date, lang, true)}`
    : `${fmtDate(ed.start_date, lang, true)}${ed.end_date && ed.end_date !== ed.start_date ? ` – ${fmtDate(ed.end_date, lang, true)}` : ''}`;
  const cells = [[L.date, when], [L.venue, venue || '–'], [L.org, L.orgName], [league ? L.fees : L.fee, tx(ed.entry_fee, lang) || L.feeTbd]];
  doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(1.5).strokeColor(NAVY).stroke();
  const colW = CW / 2;
  for (let row = 0; row < 2; row++) {
    const top = y;
    let h = 0;
    for (let col = 0; col < 2; col++) {
      const [k, v] = cells[row * 2 + col];
      const x = M + col * colW + (col ? 14 : 0), w = colW - 14;
      doc.fillColor(MUTED).font('b').fontSize(7.5).text(k.toUpperCase(), x, top + 10, { width: w, characterSpacing: 0.8 });
      doc.fillColor(TEXT).font('b').fontSize(11.5).text(v, x, doc.y + 3, { width: w });
      h = Math.max(h, doc.y - top + 10);
    }
    y = top + h;
    doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.6).strokeColor(LINE).stroke();
    doc.moveTo(M + colW, top).lineTo(M + colW, y).stroke();
  }
  y += 22;

  // ---- body: text column + QR column
  const textW = CW - 170, qrX = M + CW - 140;
  const section = (title, paras) => {
    const lines = paras.filter(Boolean);
    if (!lines.length) return;
    doc.fillColor(TEXT).font('b').fontSize(10.5).text(title.toUpperCase(), M, y, { width: textW, characterSpacing: 0.8 });
    y = doc.y + 4;
    for (const p of lines) {
      doc.fillColor(TEXT).font('r').fontSize(10.5).text(p, M, y, { width: textW, lineGap: 2 });
      y = doc.y + 4;
    }
    y += 10;
  };
  const bodyTop = y;

  if (league) {
    const f = ed.format ?? {};
    const g = f.group_stage, p = f.playoff;
    section(L.system, [
      L.icf,
      g ? L.group(g.until ? fmtDate(g.until, lang) : '', g.legs ?? 1, g.points?.win ?? 2, g.points?.draw ?? 1) : null,
      p?.groups?.length ? L.playoff(p.groups) : null,
    ]);
    const dl = [];
    if (ed.start_date) dl.push(`${L.start}: ${fmtDate(ed.start_date, lang)}`);
    for (const k of ['qf', 'sf', 'f']) if (p?.dates?.[k]) dl.push(`${L[k]}: ${fmtDate(p.dates[k], lang)}`);
    section(L.dates, dl);
    section(L.signup, [L.formLeague, ctx.pageUrl]);
  } else {
    section(L.program, [tx(ed.schedule, lang)]);
    section(L.rules, [L.icf, r && idx ? L.mcr(idx, (r.editions ?? []).length, tx(r.name, lang)) : null]);
    section(L.signup, [
      ed.signup_deadline ? `${L.deadline(fmtDate(ed.signup_deadline, lang))}.` : null,
      ed.capacity ? L.capacity(ed.capacity) : null,
      `${L.form} ${ctx.pageUrl}`,
    ]);
  }
  const pay = ctx.payment;
  if (pay?.account) section(L.pay, [L.payNote, `${L.account}: ${pay.account}`, pay.iban ? `${L.iban}: ${pay.iban}${pay.bic ? ` · BIC ${pay.bic}` : ''}` : null]);

  // QR codes on the right
  let qy = bodyTop;
  const qr = (label, text) => {
    drawQr(doc, text, qrX, qy, 140);
    doc.fillColor(MUTED).font('b').fontSize(8.5).text(label, qrX, qy + 144, { width: 140, align: 'center' });
    qy += 176;
  };
  qr(L.qrPage, ctx.pageUrl);
  if (pay?.iban) qr(L.qrPay, spd({ iban: pay.iban, amount: feeAmount(tx(ed.entry_fee, 'cs')), message: `${ed.code} ${ed.year}` }));

  // ---- footer
  doc.moveTo(M, 790).lineTo(M + CW, 790).lineWidth(0.6).strokeColor(LINE).stroke();
  doc.fillColor(MUTED).font('r').fontSize(8.5)
    .text(L.footer(L.footerKind[league ? 'league' : 'tournament']), M, 800, { width: CW / 2 + 60, lineBreak: false })
    .text('carrom.cz', M, 800, { width: CW, align: 'right', lineBreak: false });

  doc.end();
  return done;
}
