// ════════════════════════════════════════════════════════════════
// شهادة المشاركة: A4 أفقي بهوية Milestone Impact (الوضع الفاتح)
// ════════════════════════════════════════════════════════════════
// صفحة واحدة تُولَّد لكل مشارك من بيانات مجمَّدة لحظة الإصدار.
// عناصر الأمان: نقش «جيوشيه» رياضي متجهي دقيق (يصعب نسخه بالمسح)، سطر نص
// مجهري، رقم تسلسلي في ثلاثة مواضع، ورمز QR إلى صفحة التحقق العامة.
// شعار الجهة (إن وُجد) يظهر بعلامة مشتركة بعد معالجته في logo.js.
// كل نص يمر عبر esc().
import LOGO_SRC from '../../assets/brand/milestone-impact.svg?raw';
import { C, esc } from './doc.js';

const LOGO = LOGO_SRC.replace(/<\?xml[^>]*>\s*/, '');

// نقش جيوشيه: منحنيات هيبوتروكويد متراكبة بخط شعري، بذرة من الرقم التسلسلي
// فكل شهادة بنقش مختلف قليلًا لا يتكرر بين شهادتين.
export function guilloche(seed = 'MI', { cx = 0, cy = 0, r = 60, rings = 6, color = C.gold, opacity = 0.11 } = {}) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const lobes = 18 + (h % 7);            // عدد البتلات يختلف بين الشهادات
  const paths = [];
  for (let k = 0; k < rings; k += 1) {
    const R = r * (0.55 + 0.45 * (k / Math.max(1, rings - 1)));
    const amp = R * (0.10 + 0.02 * ((h >> k) & 3));
    const phase = (k * Math.PI) / lobes;
    let p = '';
    for (let i = 0; i <= 900; i += 1) {
      const t = (i / 900) * Math.PI * 2;
      const rad = R - amp + amp * Math.cos(lobes * t + phase) + amp * 0.35 * Math.cos((lobes * 2 + 1) * t);
      p += `${i ? 'L' : 'M'}${(cx + rad * Math.cos(t)).toFixed(2)} ${(cy + rad * Math.sin(t)).toFixed(2)}`;
    }
    paths.push(`<path d="${p}Z" fill="none" stroke="${color}" stroke-width="0.14" opacity="${opacity}"/>`);
  }
  return paths.join('');
}

// إطار مزدوج بزخارف ماسية في الأركان (مليمترات على صفحة 297×210)
function frame() {
  const W = 297, H = 210, o = 9, i = 12;
  const corner = (x, y) => `<g transform="translate(${x} ${y})">
    <rect x="-1.1" y="-1.1" width="2.2" height="2.2" transform="rotate(45)" fill="${C.gold}"/>
    <rect x="-2.1" y="-2.1" width="4.2" height="4.2" transform="rotate(45)" fill="#FFFFFF" fill-opacity="0" stroke="${C.gold}" stroke-width="0.2"/></g>`;
  return `<svg class="frame" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <rect x="${o}" y="${o}" width="${W - o * 2}" height="${H - o * 2}" fill="none" stroke="${C.gold}" stroke-width="0.5"/>
    <rect x="${i}" y="${i}" width="${W - i * 2}" height="${H - i * 2}" fill="none" stroke="${C.graphite}" stroke-width="0.18" opacity=".55"/>
    ${[[o, o], [W - o, o], [o, H - o], [W - o, H - o]].map(([x, y]) => corner(x, y)).join('')}
  </svg>`;
}

// نص دائري بحروف مستقلة مدوَّرة؛ أثبت من textPath في محرّكات الطباعة
function sealRing(text, r = 42) {
  const ch = [...text];
  return ch.map((c, i) => {
    const a = (i / ch.length) * 360;
    return `<text x="60" y="${60 - r}" transform="rotate(${a.toFixed(2)} 60 60)" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="6.4" fill="${C.gold}">${c === ' ' ? '' : esc(c)}</text>`;
  }).join('');
}

const SEAL = `<svg class="cseal" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">
  <circle cx="60" cy="60" r="56" fill="none" stroke="${C.gold}" stroke-width=".8"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="${C.gold}" stroke-width=".4" stroke-dasharray="1.2 2.2"/>
  <circle cx="60" cy="60" r="33" fill="none" stroke="${C.gold}" stroke-width=".5"/>
  ${sealRing('MILESTONE IMPACT · CERTIFIED · FROM INTENTION TO IMPACT · ')}
  <rect x="50" y="50" width="20" height="20" transform="rotate(45 60 60)" fill="${C.gold}"/>
</svg>`;

const fmtAr = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
const fmtEn = (d) => new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

// c: { serial, name_ar, name_en, program_ar, program_en, track_ar?, track_en?, hours?, start?, end?, issued_at,
//      org?: { name, logo? (data URL بعد المعالجة) }, signatories: [{ name, title, image? }], verify_url }
// qrSvg: نص SVG لرمز QR (يولَّد خارج الدالة لأنه غير متزامن)
export function certificateHtml(c, qrSvg, { status } = {}) {
  const co = !!c.org?.logo;
  const signers = (c.signatories || []).slice(0, 2);
  const period = c.start && c.end ? `${fmtAr(c.start)} – ${fmtAr(c.end)}` : '';
  const periodEn = c.start && c.end ? `${new Date(c.start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} – ${new Date(c.end).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : '';
  const micro = `MILESTONE IMPACT · ${c.serial} · CERTIFICATE OF PARTICIPATION · `.repeat(14);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>شهادة مشاركة · ${esc(c.name_ar)} · ${esc(c.serial)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@200;300;400&family=Noto+Sans:wght@200;300;400&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; background: ${C.faint}; }
body { font-family: "Noto Kufi Arabic", "Noto Sans", sans-serif; font-weight: 300; color: ${C.graphite}; }
.toolbar { display: flex; gap: 8px; justify-content: center; padding: 10px; background: ${C.graphite}; position: sticky; top: 0; z-index: 3; }
.toolbar button { font: 400 11px "Noto Kufi Arabic", sans-serif; border: 1px solid ${C.gold}; background: transparent; color: ${C.mist}; padding: 7px 16px; border-radius: 2px; cursor: pointer; }
.toolbar button.pri { background: ${C.gold}; color: ${C.graphite}; }
@media print { .toolbar { display: none; } html, body { background: none; } .page { margin: 0 !important; box-shadow: none !important; } }
.page { position: relative; width: 297mm; height: 210mm; margin: 10mm auto; background: #FFFFFF; overflow: hidden; box-shadow: 0 0 0 1px ${C.line}; }
.frame, .guil { position: absolute; inset: 0; width: 100%; height: 100%; }
.guil { pointer-events: none; }
.lattice { position: absolute; inset: 12mm; opacity: .5;
  background-image: url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><path d='M0 11 11 0 22 11 11 22Z' fill='none' stroke='${C.graphite}' stroke-width='.35' opacity='.07'/></svg>`)}"); }
.content { position: absolute; inset: 18mm 24mm 17mm; display: grid; grid-template-rows: auto 1fr auto; text-align: center; }
.brands { display: flex; align-items: center; justify-content: center; gap: 8mm; direction: ltr; height: 17mm; }
.brands .mi svg { height: 15mm; width: auto; display: block; }
.brands .sep { width: 1px; height: 12mm; background: ${C.gold}; opacity: .6; }
.brands .org { display: grid; justify-items: center; gap: 1mm; }
.brands .org img { max-height: 13mm; max-width: 48mm; object-fit: contain; display: block; }
.brands .org small { font: 300 6.5pt "Noto Kufi Arabic", sans-serif; color: ${C.muted}; direction: rtl; }
.main { align-self: center; }
.kind-en { font: 300 8pt "Noto Sans", sans-serif; letter-spacing: .42em; color: ${C.gold}; text-transform: uppercase; margin: 0 0 1.5mm; }
.kind { font-weight: 200; font-size: 34pt; line-height: 1.15; margin: 0; }
.rule { display: flex; align-items: center; justify-content: center; gap: 3mm; margin: 4mm auto 5mm; width: 120mm; }
.rule i { flex: 1; height: 1px; background: ${C.gold}; opacity: .55; }
.rule b { width: 2.4mm; height: 2.4mm; background: ${C.gold}; transform: rotate(45deg); }
.lead { font-size: 11pt; color: ${C.slate}; margin: 0; }
.name { font-weight: 300; font-size: 30pt; line-height: 1.35; margin: 2mm 0 0; color: ${C.graphite}; }
.name-en { font: 300 11pt "Noto Sans", sans-serif; letter-spacing: .24em; text-transform: uppercase; color: ${C.slate}; margin: 0 0 4mm; direction: ltr; }
.body { font-size: 11pt; color: ${C.slate}; line-height: 1.9; margin: 0 auto; max-width: 200mm; }
.body b { font-weight: 400; color: ${C.graphite}; }
.body-en { font: 300 8.5pt "Noto Sans", sans-serif; color: ${C.muted}; direction: ltr; margin: 1.5mm 0 0; line-height: 1.7; }
.foot { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 8mm; }
.verify { display: flex; align-items: flex-end; gap: 3.5mm; direction: ltr; text-align: left; }
.verify .qr { width: 21mm; height: 21mm; padding: 1.2mm; border: 0.3mm solid ${C.line}; background: #fff; }
.verify .qr svg { width: 100%; height: 100%; display: block; }
.verify .meta { font: 300 6.8pt "Noto Sans", sans-serif; color: ${C.muted}; line-height: 1.75; }
.verify .meta b { display: block; font: 400 8.5pt "Noto Sans", sans-serif; letter-spacing: .08em; color: ${C.graphite}; }
.verify .meta .ar { font-family: "Noto Kufi Arabic", sans-serif; direction: rtl; display: block; }
.cseal { width: 31mm; height: 31mm; display: block; }
.signs { display: flex; justify-content: flex-start; gap: 10mm; }
.sign { min-width: 52mm; text-align: center; }
.sign .ink { height: 12mm; display: flex; align-items: flex-end; justify-content: center; }
.sign .ink img { max-height: 12mm; max-width: 46mm; }
.sign .line { height: 0.3mm; background: ${C.graphite}; opacity: .6; margin: 1mm 0 1.5mm; }
.sign b { display: block; font-weight: 400; font-size: 9.5pt; }
.sign span { font-size: 7.5pt; color: ${C.muted}; }
.micro { position: absolute; left: 16mm; right: 16mm; bottom: 13.3mm; font: 300 3.2pt/1 "Noto Sans", sans-serif; letter-spacing: .08em; color: ${C.gold}; opacity: .75; white-space: nowrap; overflow: hidden; direction: ltr; }
.rights { position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center; font-size: 6.3pt; color: ${C.muted}; }
.status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.status span { border: 1mm solid ${C.muted}; color: ${C.muted}; font-size: 40pt; padding: 2mm 14mm; transform: rotate(-14deg); opacity: .5; }
</style></head><body>
<div class="toolbar"><button class="pri" data-act="print">طباعة أو حفظ PDF</button><button data-act="close">إغلاق</button></div>
<article class="page">
  <div class="lattice"></div>
  <svg class="guil" viewBox="0 0 297 210" aria-hidden="true">${guilloche(c.serial, { cx: 148.5, cy: 108, r: 68 })}${guilloche(c.serial + 'b', { cx: 148.5, cy: 108, r: 44, rings: 5, color: C.graphite, opacity: 0.08 })}</svg>
  ${frame()}
  <div class="content">
    <header class="brands">
      <div class="mi">${LOGO}</div>
      ${co ? `<i class="sep"></i><div class="org"><img src="${esc(c.org.logo)}" alt="${esc(c.org.name)}"><small>بالشراكة مع ${esc(c.org.name)}</small></div>` : ''}
    </header>
    <section class="main">
      <p class="kind-en">Certificate of Participation</p>
      <h1 class="kind">شهادة مشاركة</h1>
      <div class="rule"><i></i><b></b><i></i></div>
      <p class="lead">تُمنح هذه الشهادة إلى</p>
      <h2 class="name">${esc(c.name_ar)}</h2>
      <p class="name-en">${esc(c.name_en)}</p>
      <p class="body">تقديرًا لإتمام متطلبات المشاركة في <b>${esc(c.program_ar)}</b>${c.track_ar ? ` ضمن <b>${esc(c.track_ar)}</b>` : ''}${c.hours ? ` بواقع <b>${esc(c.hours)} ساعة</b> تدريبية` : ''}${period ? `<br>خلال الفترة ${esc(period)}` : ''}.</p>
      <p class="body-en">In recognition of completing the ${esc(c.program_en)}${c.track_en ? ` · ${esc(c.track_en)}` : ''}${c.hours ? ` · ${esc(c.hours)} training hours` : ''}${periodEn ? ` · ${esc(periodEn)}` : ''}</p>
    </section>
    <footer class="foot">
      <div class="verify">
        <div class="qr">${qrSvg}</div>
        <div class="meta"><span class="ar">رقم الشهادة</span><b>${esc(c.serial)}</b>Issued ${esc(fmtEn(c.issued_at))}<span class="ar">صدرت في ${esc(fmtAr(c.issued_at))}</span>${esc(c.verify_url.replace(/^https?:\/\//, ''))}</div>
      </div>
      ${SEAL}
      <div class="signs">${signers.map((s) => `<div class="sign"><div class="ink">${s.image ? `<img src="${esc(s.image)}" alt="">` : ''}</div><div class="line"></div><b>${esc(s.name)}</b><span>${esc(s.title)}</span></div>`).join('')}</div>
    </footer>
  </div>
  <div class="micro">${esc(micro)}</div>
  <div class="rights">© ${new Date(c.issued_at).getFullYear()} Milestone Impact. جميع الحقوق محفوظة. تحقق من صحة الشهادة بمسح الرمز أو بزيارة ${esc(c.verify_url.replace(/^https?:\/\//, ''))}</div>
  ${status ? `<div class="status"><span>${esc(status)}</span></div>` : ''}
</article>
</body></html>`;
}
