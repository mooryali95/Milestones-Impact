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
import { logoClass } from './logo.js';

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
function sealRing(text, r = 43) {
  const ch = [...text];
  return ch.map((c, i) => {
    const a = (i / ch.length) * 360;
    return `<text x="60" y="${60 - r}" transform="rotate(${a.toFixed(2)} 60 60)" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="6.2" font-weight="500" fill="${C.gold}">${c === ' ' ? '' : esc(c)}</text>`;
  }).join('');
}

// الختم يشهد للشهادة السارية وحدها: النموذج للعرض والموسومة بحالة (ملغاة...) بلا «شهادة معتمدة» ولا CERTIFIED
const seal = (valid) => `<svg class="cseal" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">
  <circle cx="60" cy="60" r="56" fill="none" stroke="${C.gold}" stroke-width=".8"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="${C.gold}" stroke-width=".4" stroke-dasharray="1.2 2.2"/>
  <circle cx="60" cy="60" r="33" fill="none" stroke="${C.gold}" stroke-width=".5"/>
  ${sealRing(valid ? 'MILESTONE IMPACT · CERTIFIED · FROM INTENTION TO IMPACT · ' : 'MILESTONE IMPACT · FROM INTENTION TO IMPACT · ')}
  ${valid ? '<rect x="56" y="38" width="8" height="8" transform="rotate(45 60 42)" fill="' + C.gold + '"/>' : '<rect x="52" y="52" width="16" height="16" transform="rotate(45 60 60)" fill="' + C.gold + '"/>'}
  ${valid ? `<text x="60" y="64" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, sans-serif" font-size="8" font-weight="500" fill="${C.gold}">شهادة معتمدة</text>
  <text x="60" y="77" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="5.2" font-weight="500" letter-spacing=".9" fill="${C.gold}">CERTIFIED</text>` : ''}
</svg>`;

// كتلة التوثيق (قرار المالك 2026-11-27): الموقّع من إعداد الشهادة (certificate_settings.signatory أو إعداد الجهة) باسمه وصفته
// بالعربية، وصورة توقيعه إن رُفعت. بلا موقّع: اسم الجهة المصدِرة بالعربية بلا توقيع مصطنع، ولا اسم شخص يُخترع.
// التاريخ لا يتكرر هنا: موضعه الوحيد بيانات التحقق
export const ISSUER_AR = 'منصة Milestone Impact';
const attest = (s) => s
  ? `<div class="attest"><div class="ink">${s.image ? `<img src="${esc(s.image)}" alt="">` : ''}</div><div class="line"></div><b>${esc(s.name)}</b>${s.title ? `<span>${esc(s.title)}</span>` : ''}</div>`
  : `<div class="attest"><div class="ink"></div><div class="line"></div><b dir="rtl">منصة <bdi dir="ltr">Milestone Impact</bdi></b><span>الجهة المصدِرة</span></div>`;

// السلم (تصور الفخامة، المرحلة 2): الاسم أبرز عنصر، ولا وزن دون 400. بالنقطة
export const CERT_TYPE = Object.freeze({ name: 40, title: 28, body: 12, verify: 7.5, serial: 8, rights: 7, signer: 10, signerTitle: 8 });
// الاسم الطويل يصغر بدرجات فيبقى في سطر أو سطرين دون أن يدفع التذييل: عرض الكتلة نحو 249mm
export function nameSize(name) {
  const n = [...String(name || '')].length;
  if (n <= 26) return CERT_TYPE.name;
  if (n <= 34) return 34;
  if (n <= 44) return 30;
  if (n <= 56) return 26;
  return 24;
}

const fmtAr = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
const fmtEn = (d) => new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

// c: { serial, name_ar, name_en, program_ar, program_en, track_ar?, track_en?, hours?, start?, end?, issued_at,
//      org?: { name, logo? (data URL بعد المعالجة) }, signatories: [{ name, title, image? }], verify_url }
// qrSvg: نص SVG لرمز QR (يولَّد خارج الدالة لأنه غير متزامن)
// c.sample: معاينة الحساب التجريبي (تصور الحساب التجريبي، المرحلة 1): القالب نفسه بعلامة «نموذج للعرض»، بلا رقم تسلسلي
// ولا رمز QR ولا رابط تحقق ولا زر LinkedIn، فلا شيء فيها يتحقق كشهادة أصلية
export const SAMPLE_STAMP_AR = 'نموذج للعرض';
// opts.print: نسخة مولّد PDF على الخادم (workers/pdf-render): بلا شريط، وbase لخطوط المنصة
export function certificateHtml(c0, qrSvg, opts = {}) {
  const status0 = opts.status;
  const sample = !!c0.sample;
  const c = sample ? { ...c0, serial: 'SAMPLE', verify_url: '' } : c0;
  const status = sample ? SAMPLE_STAMP_AR : status0;
  const co = !!c.org?.logo;
  const signers = (c.signatories || []).slice(0, 1);
  const period = c.start && c.end ? `${fmtAr(c.start)} – ${fmtAr(c.end)}` : '';
  const periodEn = c.start && c.end ? `${new Date(c.start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} – ${new Date(c.end).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : '';
  // D05: نوع الشهادة من لقطتها؛ ما صدر قبل القرار يبقى «شهادة مشاركة»
  const success = c.kind === 'completion_success';
  const kindEn = success ? 'Certificate of Successful Completion' : 'Certificate of Participation';
  const kindAr = success ? 'شهادة إتمام بنجاح' : 'شهادة مشاركة';
  const org = c.org?.name || '';
  const facts = [c.cohort_ar ? `الدفعة: ${esc(c.cohort_ar)}` : '', org && !co ? `الجهة: ${esc(org)}` : ''].filter(Boolean);
  const micro = `MILESTONE IMPACT · ${c.serial} · ${kindEn.toUpperCase()} · `.repeat(14);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="color-scheme" content="light">
${opts.base ? `<base href="${esc(opts.base)}">` : ''}
<title>${kindAr} · ${esc(c.name_ar)} · ${sample ? SAMPLE_STAMP_AR : esc(c.serial)}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; background: ${C.faint}; }
body { font-family: "Noto Kufi Arabic", "Noto Sans", sans-serif; font-weight: 400; color: ${C.graphite}; }
.toolbar { display: flex; gap: 8px; justify-content: center; padding: 10px; background: ${C.graphite}; position: sticky; top: 0; z-index: 3; }
.toolbar button { font: 500 11px "Noto Kufi Arabic", sans-serif; border: 1px solid ${C.gold}; background: transparent; color: ${C.mist}; padding: 7px 16px; border-radius: 2px; cursor: pointer; }
.toolbar button.pri { background: ${C.gold}; color: ${C.graphite}; }
@media print { .toolbar { display: none; } html, body { background: none; } .page { margin: 0 !important; box-shadow: none !important; } }
.page { position: relative; width: 297mm; height: 210mm; margin: 10mm auto; background: #FFFFFF; overflow: hidden; box-shadow: 0 0 0 1px ${C.line}; }
.frame, .guil { position: absolute; inset: 0; width: 100%; height: 100%; }
.guil { pointer-events: none; }
.lattice { position: absolute; inset: 12mm; opacity: .5;
  background-image: url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><path d='M0 11 11 0 22 11 11 22Z' fill='none' stroke='${C.graphite}' stroke-width='.35' opacity='.07'/></svg>`)}"); }
.content { position: absolute; inset: 18mm 24mm 23mm; display: grid; grid-template-rows: auto 1fr auto; text-align: center; }
.brands { display: flex; align-items: center; justify-content: center; gap: 8mm; direction: ltr; height: 22mm; }
.brands .mi svg { height: 15mm; width: auto; display: block; }
.brands .sep { width: 0.3mm; height: 15mm; background: ${C.gold}; opacity: .8; }
.brands .org { display: grid; justify-items: center; gap: 1mm; }
.brands .org img { height: 15mm; width: auto; max-width: 48mm; object-fit: contain; display: block; }
.brands .org.t img { max-width: 18mm; }
.brands .org.w img { max-width: 64mm; }
.brands .org small { font: 400 9pt "Noto Kufi Arabic", sans-serif; color: ${C.muted}; direction: rtl; }
.main { align-self: center; }
.kind-en { font: 400 8pt "Noto Sans", sans-serif; letter-spacing: .28em; color: ${C.gold}; text-transform: uppercase; margin: 0 0 1.5mm; }
.kind { font-weight: 400; font-size: 28pt; line-height: 1.2; margin: 0; }
.rule { display: flex; align-items: center; justify-content: center; gap: 3mm; margin: 3mm auto 4mm; width: 120mm; }
.rule i { flex: 1; height: 1px; background: ${C.gold}; opacity: .55; }
.rule b { width: 2.4mm; height: 2.4mm; background: ${C.gold}; transform: rotate(45deg); }
.lead { font-size: 12pt; color: ${C.slate}; margin: 0; }
.name { font-weight: 500; font-size: 40pt; line-height: 1.3; margin: 1mm auto 0; max-width: 249mm; text-wrap: balance; color: ${C.graphite}; }
.name-en { font: 400 11pt "Noto Sans", sans-serif; letter-spacing: .24em; text-transform: uppercase; color: ${C.slate}; margin: 0 0 4mm; direction: ltr; }
.body { font-size: 12pt; font-weight: 400; color: ${C.slate}; line-height: 1.8; margin: 0 auto; max-width: 200mm; }
.body b { font-weight: 500; color: ${C.graphite}; }
.facts { font-size: 10pt; color: ${C.slate}; margin: 1.5mm 0 0; }
.body-en { font: 400 8.5pt "Noto Sans", sans-serif; color: ${C.muted}; direction: ltr; margin: 1.5mm 0 0; line-height: 1.7; }
/* التذييل بثلاثة أعمدة متناظرة (اتجاه الصفحة RTL): التوثيق يمينًا، الختم في الوسط، التحقق يسارًا */
.foot { display: grid; grid-template-columns: 1fr 34mm 1fr; align-items: end; gap: 10mm; }
.foot > :first-child { justify-self: start; }
.foot > :last-child { justify-self: end; }
.cseal { width: 30mm; height: 30mm; display: block; justify-self: center; }
/* كتلة التوثيق: الموقّع، أو الجهة المصدِرة حين لا موقّع، بالهيئة نفسها */
.attest { width: 58mm; text-align: center; }
.attest .ink { height: 12mm; display: flex; align-items: flex-end; justify-content: center; }
.attest .ink img { max-height: 12mm; max-width: 50mm; }
.attest .line { height: 0.3mm; background: ${C.graphite}; opacity: .5; margin: 1.2mm 0 1.6mm; }
.attest b { display: block; font-weight: 500; font-size: 10pt; color: ${C.graphite}; }
.attest span { display: block; font-size: 8pt; color: ${C.muted}; margin-top: .4mm; }
/* التحقق: نص عربي بقيم لاتينية معزولة، والرمز عند الحافة الخارجية */
.verify { display: flex; align-items: center; gap: 3.5mm; }
.verify dl { margin: 0; text-align: right; display: grid; grid-template-columns: auto auto; gap: .6mm 3mm; font-size: 7.5pt; color: ${C.muted}; line-height: 1.45; }
.verify dt { white-space: nowrap; }
.verify dd { margin: 0; color: ${C.graphite}; white-space: nowrap; }
.verify dd.ltr { direction: ltr; text-align: right; unicode-bidi: isolate; font: 400 8pt "Noto Sans", sans-serif; letter-spacing: .04em; }
.verify .qr { flex: none; width: 19mm; height: 19mm; padding: 1mm; border: 0.25mm solid ${C.line}; background: #fff; }
.verify .qr svg { width: 100%; height: 100%; display: block; }
.micro { position: absolute; left: 16mm; right: 16mm; bottom: 13.3mm; font: 400 3.2pt/1 "Noto Sans", sans-serif; letter-spacing: .08em; color: ${C.gold}; opacity: .75; white-space: nowrap; overflow: hidden; direction: ltr; }
.rights { position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center; font-size: 7pt; color: ${C.muted}; }
.rights bdi, .rights .en { font-family: "Noto Sans", sans-serif; }
.status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.status span { border: 1mm solid ${C.muted}; color: ${C.muted}; font-size: 40pt; padding: 2mm 14mm; transform: rotate(-14deg); opacity: .5; }
</style></head><body>
${opts.print ? '' : `<div class="toolbar"><button class="pri" data-act="pdf">تحميل PDF</button><button data-act="print">طباعة</button>${status ? '' : '<button data-act="linkedin">أضفها إلى LinkedIn</button>'}<button data-act="close">إغلاق</button></div>`}
<article class="page">
  <div class="lattice"></div>
  <svg class="guil" viewBox="0 0 297 210" aria-hidden="true">${guilloche(c.serial, { cx: 148.5, cy: 108, r: 68 })}${guilloche(c.serial + 'b', { cx: 148.5, cy: 108, r: 44, rings: 5, color: C.graphite, opacity: 0.08 })}</svg>
  ${frame()}
  <div class="content">
    <header class="brands">
      <div class="mi">${LOGO}</div>
      ${co ? `<i class="sep"></i><div class="org ${logoClass(c.org.logo)}"><img src="${esc(c.org.logo)}" alt="${esc(c.org.name)}"><small>بالشراكة مع ${esc(c.org.name)}</small></div>` : ''}
    </header>
    <section class="main">
      <p class="kind-en">${kindEn}</p>
      <h1 class="kind">${kindAr}</h1>
      <div class="rule"><i></i><b></b><i></i></div>
      <p class="lead">تُمنح هذه الشهادة إلى</p>
      <h2 class="name"${nameSize(c.name_ar) < CERT_TYPE.name ? ` style="font-size: ${nameSize(c.name_ar)}pt"` : ''}>${esc(c.name_ar)}</h2>
      <p class="name-en">${esc(c.name_en)}</p>
      <p class="body">تقديرًا لإتمام متطلبات المشاركة في <b>${esc(c.program_ar)}</b>${c.track_ar ? ` ضمن <b>${esc(c.track_ar)}</b>` : ''}${c.hours ? ` بواقع <b>${esc(c.hours)} ساعة</b> تدريبية` : ''}${period ? `<br>خلال الفترة ${esc(period)}` : ''}.</p>
      ${facts.length ? `<p class="facts">${facts.join(' · ')}</p>` : ''}
      <p class="body-en">In recognition of completing the ${esc(c.program_en)}${c.track_en ? ` · ${esc(c.track_en)}` : ''}${c.hours ? ` · ${esc(c.hours)} training hours` : ''}${periodEn ? ` · ${esc(periodEn)}` : ''}</p>
    </section>
    <footer class="foot">
      ${attest(signers[0])}
      ${seal(!status)}
      ${sample ? `<div class="verify"><dl>
          <dt>رقم الشهادة</dt><dd>${SAMPLE_STAMP_AR}، بلا رقم</dd>
          <dt>التحقق</dt><dd>لا رابط تحقق لهذا النموذج</dd>
        </dl></div>` : `<div class="verify">
        <dl>
          <dt>رقم الشهادة</dt><dd class="ltr">${esc(c.serial)}</dd>
          <dt>تاريخ الإصدار</dt><dd>${esc(fmtAr(c.issued_at))}</dd>
          <dt>التحقق</dt><dd class="ltr">${esc(c.verify_url.replace(/^https?:\/\//, ''))}</dd>
        </dl>
        <div class="qr">${qrSvg}</div>
      </div>`}
    </footer>
  </div>
  <div class="micro">${esc(micro)}</div>
  <div class="rights">جميع الحقوق محفوظة <bdi dir="ltr">© ${new Date(c.issued_at).getFullYear()} Milestone Impact</bdi> · ${sample ? `${SAMPLE_STAMP_AR}، لا يثبت إتمام البرنامج` : 'تحقّق من صحة الشهادة بمسح الرمز'}</div>
  ${status ? `<div class="status"><span>${esc(status)}</span></div>` : ''}
</article>
</body></html>`;
}

// رابط «أضف إلى ملفك» في LinkedIn بقسم التراخيص والشهادات
export function linkedinUrl(c) {
  const d = new Date(c.issued_at);
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME', name: c.program_en || 'Leaders Program', organizationName: 'Milestone Impact',
    issueYear: String(d.getFullYear()), issueMonth: String(d.getMonth() + 1), certUrl: c.verify_url, certId: c.serial,
  });
  return `https://www.linkedin.com/profile/add?${q}`;
}

export async function qrSvgFor(url) {
  const { default: QR } = await import('qrcode');
  return QR.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'Q', color: { dark: C.graphite, light: '#FFFFFF' } });
}

// تكتب الشهادة في نافذة فُتحت متزامنة مع النقرة، وتربط أزرارها من هنا
// لأن سياسة المحتوى تمنع السكربت داخل الصفحة.
// الطباعة تنتظر خطوط المنصة فلا تقع على الخط البديل
const ready = async (win) => { try { await win.document.fonts?.ready; } catch { /* الخط البديل أهون من تعطل الطباعة */ } };
const fileName = (c) => `${c.kind === 'completion_success' ? 'شهادة إتمام' : 'شهادة مشاركة'} ${c.name_ar || ''} ${c.sample ? SAMPLE_STAMP_AR : c.serial || ''}`.trim();

// «تحميل PDF» (تصور الفخامة، الخيار ب): الملف المتجهي من مولّد الخادم من HTML الشهادة نفسه، بخطوط مضمّنة ونص حقيقي.
// بلا تذكرة (صفحة التحقق العامة) أو حين يتعذر المولّد: نافذة الطباعة بعد جاهزية الخطوط. يعيد 'server' أو 'print'
export async function downloadCertificate(win, c, qr, opts = {}) {
  const { pdfServer } = await import('./pdf-source.js');
  const server = await pdfServer(opts.pdf);
  if (server) {
    try {
      const { embedAssets, fetchAsset, saveBlob } = await import('./pdf.js');
      const html = await embedAssets(certificateHtml(c, qr, { ...opts, print: true, base: `${location.origin}/` }), fetchAsset);
      const r = await fetch(`${server.url}/pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ ticket: server.ticket, html, name: fileName(c) }) });
      if (!r.ok || !/pdf/.test(r.headers.get('content-type') || '')) throw new Error(`pdf-render ${r.status}`);
      saveBlob(await r.blob(), { title: fileName(c) });
      return 'server';
    } catch (e) {
      console.warn('server pdf unavailable, printing instead:', e?.message || e);
    }
  }
  await ready(win); win.print();
  return 'print';
}

export async function writeCertificate(win, c, opts = {}) {
  if (!win) return false;
  const qr = c.sample ? '' : await qrSvgFor(c.verify_url);
  const html = certificateHtml(c, qr, opts);
  win.document.open();
  win.document.write(html);
  win.document.close();
  const on = (act, fn) => win.document.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
  on('print', async () => { await ready(win); win.print(); });
  const btn = win.document.querySelector('[data-act="pdf"]');
  btn?.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'يُولَّد الملف…';
    try { btn.textContent = (await downloadCertificate(win, c, qr, opts)) === 'server' ? 'حُفظ الملف' : label; } catch { btn.textContent = 'تعذّر التحميل، استعمل «طباعة»'; }
    setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2500);
  });
  on('close', () => win.close());
  on('linkedin', () => win.open(linkedinUrl(c), '_blank', 'noopener'));
  return true;
}
