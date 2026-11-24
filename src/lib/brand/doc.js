// ════════════════════════════════════════════════════════════════
// وثائق Milestone Impact: محرك تقارير الطباعة بالهوية (الوضع الفاتح)
// ════════════════════════════════════════════════════════════════
// كل تقرير في المنصات يُبنى من هنا فيخرج بهوية واحدة: أرضية Mist،
// نص Graphite، والذهب خطًا وماسةً وختمًا فقط (≈5%). A4 بهامش 18 مم،
// ترويسة بالشعار ونقش الماس الخافت، وتذييل بحقوق النشر على كل صفحة.
// المرجع: Milestone-Impact-Brand-Brief (الألوان، الخطوط الخفيفة، الماسة، الختم مرة واحدة).
// كل نص يدخل الوثيقة يمر عبر esc(): النافذة ترث نطاق التطبيق.
import LOGO_SRC from '../../assets/brand/milestone-impact.svg?raw';

// الشعار من الملف الأصلي كما هو، دون إعلان XML لأنه يُضمَّن داخل HTML
const LOGO = LOGO_SRC.replace(/<\?xml[^>]*>\s*/, '');

export const C = {
  graphite: '#0B272F', gold: '#A97A2E', goldText: '#8A6424', goldLight: '#D9A85A', mist: '#F7F8F6',
  paper: '#FFFFFF', slate: '#2C4148', muted: '#5F7176', line: '#DCE2E1', faint: '#EEF1F0',
};

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : esc(n));
export const today = () => new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });

// رقم وثيقة قابل للتتبع: MI-<نوع>-<تاريخ>-<أربعة رموز>
export function docId(kind) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MI-${kind}-${ymd}-${r}`;
}

// ── عناصر الهوية ──
const diamond = (size = 8, fill = C.gold) => `<svg class="dm" width="${size}" height="${size}" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" transform="rotate(45 5 5)" fill="${fill}"/></svg>`;
const LATTICE = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><path d='M0 20 20 0 40 20 20 40Z' fill='none' stroke='${C.graphite}' stroke-width='.6' opacity='.07'/></svg>`)}")`;

export const SEAL = (label = 'MILESTONE IMPACT') => `<svg class="seal" width="118" height="118" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="56" fill="none" stroke="${C.gold}" stroke-width=".8"/>
  <circle cx="60" cy="60" r="49" fill="none" stroke="${C.gold}" stroke-width=".5" stroke-dasharray="1.5 2.5"/>
  <circle cx="60" cy="60" r="31" fill="none" stroke="${C.gold}" stroke-width=".5"/>
  <defs><path id="sealArc" d="M60 60 m-41 0 a41 41 0 1 1 82 0 a41 41 0 1 1 -82 0"/></defs>
  <text font-family="Noto Sans, sans-serif" font-size="6.4" letter-spacing="2.2" fill="${C.gold}"><textPath href="#sealArc" startOffset="0">${esc(label)} · FROM INTENTION TO IMPACT ·</textPath></text>
  <rect x="51" y="51" width="18" height="18" transform="rotate(45 60 60)" fill="${C.gold}"/>
</svg>`;

// ── مكونات المحتوى ──
// القسم القصير لا ينقسم بين صفحتين فلا يبقى عنوانه وحيدًا أسفل الصفحة؛ والجدول الطويل (أكثر من 15 صفًا) ينقسم بصفوفه
const short = (body) => (body.match(/<tr/g) || []).length <= 16;
export const section = (en, ar, body, note) => `<section class="sec${short(body) ? ' keep' : ''}">
  <header><span class="eyebrow">${esc(en)}</span><h2>${esc(ar)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}</header>
  ${body}
</section>`;

// مؤشرات: [{ value, label, hint? }]
export const kpis = (items) => `<div class="kpis">${items.map((k) => `<div class="kpi"><b>${num(k.value)}</b><span>${esc(k.label)}</span>${k.hint ? `<small>${esc(k.hint)}</small>` : ''}</div>`).join('')}</div>`;

// سلسلة الأثر: مراحل متتابعة بعقد ماسية وأعداد
export const chain = (steps) => `<div class="chain">${steps.map((s, i) => `<div class="node${s.value ? ' on' : ''}">
  <span class="n">${num(s.value ?? '')}</span>${diamond(12, s.value ? C.gold : C.line)}<span class="l">${esc(s.label)}</span>${s.en ? `<span class="e">${esc(s.en)}</span>` : ''}
</div>${i < steps.length - 1 ? '<i class="link"></i>' : ''}`).join('')}</div>`;

// أشرطة أفقية رفيعة تنتهي بماسة: [{ label, value }]، والنسبة من total
export const bars = (rows, total, { ltr = false } = {}) => (rows.length ? `<div class="bars">${rows.map((r) => {
  const pct = Math.max(0, Math.min(100, (r.value / Math.max(1, total)) * 100));
  return `<div class="bar"><span class="bl"${ltr ? ' dir="ltr"' : ''}>${esc(r.label)}</span><span class="bt"><i style="width:${pct.toFixed(1)}%"></i>${diamond(7)}</span><b>${num(r.value)}</b></div>`;
}).join('')}</div>` : '<p class="muted">لا بيانات بعد.</p>');

// جدول: cols [{ label, align?, ltr?, width? }]، rows مصفوفة قيم (نص أو { html })
export const table = (cols, rows, empty = 'لا بيانات') => `<table class="tbl"><thead><tr>${cols.map((c) => `<th${c.width ? ` style="width:${c.width}"` : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
<tbody>${rows.length ? rows.map((r) => `<tr>${r.map((v, i) => `<td${cols[i]?.ltr ? ' dir="ltr"' : ''}${cols[i]?.align ? ` style="text-align:${cols[i].align}"` : ''}>${v && typeof v === 'object' && 'html' in v ? v.html : esc(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="muted c">${esc(empty)}</td></tr>`}</tbody></table>`;

export const progress = (pct) => `<span class="pg"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span><span class="pgn">${num(Math.round(pct))}%</span>`;
export const raw = (html) => ({ html });
// خلاصة مميّزة بشريط ذهبي: عنوان ونص
export const callout = (title, text) => `<div class="callout"><b>${esc(title)}</b><p>${esc(text)}</p></div>`;
// قائمة نقاط بمعين ذهبي
export const points = (items, empty = 'لا شيء') => (items.length ? `<ul class="points">${items.map((t) => `<li>${t && t.html != null ? t.html : esc(t)}</li>`).join('')}</ul>` : `<p class="muted">${esc(empty)}</p>`);

// ── الغلاف المشترك (الوثيقة المؤسسية) ──
// brand: { name, logo, color }. شعار الجهة أعلى الغلاف، و«بإعداد Milestone Impact» أصغر، ولون الجهة خط تمييز وحده.
// بلا شعار يُكتب اسمها نصًا؛ بلا جهة «مبادرة مجتمعية». اللون يُقبل بصيغة #RGB أو #RRGGBB وحدها فلا يُحقن في النمط
// نص آمن داخل سلسلة CSS (ترويسة الصفحة)
const cssStr = (v) => String(v ?? '').replace(/[\\"\n\r<>]/g, ' ');
export const brandColor = (c) => (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(c || '')) ? c : null);
const safeLogo = (u) => (/^(data:image\/(png|jpe?g|webp|svg\+xml);base64,|https:\/\/|\/(?!\/))/i.test(String(u || '')) ? u : null);
function coBrand(b, id, kindLabel) {
  const logo = safeLogo(b.logo);
  const org = logo ? `<img src="${esc(logo)}" alt="${esc(b.name || '')}">`
    : `<span class="nm"><small>${b.name ? 'Initiative of' : 'Community initiative'}</small>${esc(b.name || 'مبادرة مجتمعية')}</span>`;
  return `<div class="top"><div class="org">${org}</div><div class="by"><span>بإعداد</span>${LOGO}</div></div>
    <div class="ref" style="margin-top:4mm;text-align:start;direction:ltr">Document<b>${esc(id)}</b>${esc(kindLabel || '')}</div>`;
}

// ── الوثيقة ──
// meta: { kind: 'ORG'|'PLAN'|..., eyebrow, title, subtitle?, for?, rows: [[label, value]], confidential?: نص, pageAr?: ترقيم الصفحات بالعربية,
//         selfFonts?: خطوط المنصة المستضافة ذاتيًا (/fonts/fonts.css): سياسة CSP في تطبيقي القادة والإدارة تمنع Google Fonts,
//         pdfName?: اسم ملف PDF الجاهز، فيظهر في الشريط زر «تحميل PDF» (pdf.js) }
// opts.pdf: الوثيقة تُرسم لتصدير PDF (pdf.js): بلا شريط ولا ظل ولا هامش حول الورقة
// opts.embed: الوثيقة داخل صفحة (رابط المشاركة): بلا شريط، والصفحة المضيفة تحمل أزرارها
export function documentHtml(meta, body, opts = {}) {
  const id = meta.id || docId(meta.kind || 'DOC');
  const year = new Date().getFullYear();
  const conf = meta.confidential || 'سري: مخصص للجهة المعنية فقط';
  return `<!doctype html><html lang="ar" dir="rtl"${opts.pdf ? ' class="pdf"' : opts.embed ? ' class="embed"' : ''}><head><meta charset="utf-8">
<title>${esc(meta.title)} · Milestone Impact</title>
${meta.selfFonts ? '<link rel="stylesheet" href="/fonts/fonts.css">' : `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@200;300;400;500&family=Noto+Sans:wght@200;300;400&display=swap" rel="stylesheet">`}
<style>
@page { size: A4; margin: 16mm 18mm 20mm;
  @bottom-right { content: "MILESTONE IMPACT  ·  DECISIONS  ·  DIRECTION  ·  IMPACT"; font: 300 6.5pt "Noto Sans", sans-serif; letter-spacing: .25em; color: ${C.muted}; }
  ${meta.brand ? `@top-right { content: "${cssStr(meta.title)}"; font: 300 7pt "Noto Kufi Arabic", sans-serif; color: ${C.muted}; } @top-left { content: "${cssStr(meta.brand.name || 'مبادرة مجتمعية')}"; font: 300 7pt "Noto Kufi Arabic", sans-serif; color: ${C.muted}; }` : ''}
  @bottom-left { ${meta.pageAr ? `content: "صفحة " counter(page) " من " counter(pages); font: 300 7pt "Noto Kufi Arabic", sans-serif; letter-spacing: 0;` : `content: "PAGE " counter(page) " OF " counter(pages); font: 300 6.5pt "Noto Sans", sans-serif; letter-spacing: .2em;`} color: ${C.muted}; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { background: ${C.faint}; }
body { margin: 0; font-family: "Noto Kufi Arabic", "Noto Sans", system-ui, sans-serif; font-weight: 300; color: ${C.graphite}; font-size: 10pt; line-height: 1.65; }
.sheet { max-width: 210mm; margin: 0 auto; background: ${C.paper}; padding: 0 0 14mm; }
@media screen { .sheet { margin: 12mm auto; box-shadow: 0 0 0 1px ${C.line}; } .sheet > *:not(.mast) { padding-inline: 18mm; } }
@media print { html { background: none; } .sheet { max-width: none; padding: 0; } .toolbar { display: none !important; } }
html.pdf { background: ${C.paper}; } html.pdf .toolbar { display: none !important; }
html.pdf .sheet { margin: 0; box-shadow: none; max-width: 210mm; width: 210mm; padding-bottom: 0; }
html.embed { background: transparent; } html.embed .toolbar { display: none !important; }
html.embed .sheet { margin: 0 auto; box-shadow: 0 0 0 1px ${C.line}; }
@media screen and (max-width: 700px) { html.embed .sheet > *:not(.mast) { padding-inline: 6mm; } html.embed .mast { padding: 8mm 6mm; } html.embed .mast .meta { grid-template-columns: repeat(2, 1fr); } }
p, li { orphans: 3; widows: 3; }
h2, h3 { break-after: avoid; }
.toolbar { position: sticky; top: 0; z-index: 5; display: none; gap: 8px; justify-content: center; padding: 10px; background: ${C.graphite}; }
@media screen { .toolbar { display: flex; } }
.toolbar button { font: 400 11px "Noto Kufi Arabic", sans-serif; border: 1px solid ${C.gold}; background: transparent; color: ${C.mist}; padding: 7px 16px; border-radius: 2px; cursor: pointer; letter-spacing: 0; }
.toolbar button.pri { background: ${C.goldLight}; color: ${C.graphite}; }
.mast { position: relative; background: ${C.mist} ${LATTICE}; border-bottom: 1px solid ${C.gold}; padding: 12mm 18mm 10mm; }
.mast .top { display: flex; justify-content: space-between; align-items: flex-start; direction: ltr; }
.mast .logo svg { height: 46px; width: auto; display: block; }
.mast .ref { text-align: right; font: 300 7.5pt "Noto Sans", sans-serif; letter-spacing: .3em; text-transform: uppercase; color: ${C.muted}; line-height: 2; }
.mast .ref b { display: block; font-weight: 400; letter-spacing: .12em; color: ${C.graphite}; }
.mast .eyebrow { margin-top: 10mm; }
.mast h1 { font-weight: 200; font-size: 26pt; line-height: 1.25; margin: 2mm 0 1mm; letter-spacing: 0; }
.mast .sub { color: ${C.slate}; font-size: 11pt; margin: 0; }
.mast .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 8mm; border-top: 1px solid ${C.line}; }
.mast .meta div { padding: 3mm 0 0; border-inline-start: 1px solid ${C.line}; padding-inline-start: 4mm; }
.mast .meta div:first-child { border-inline-start: 0; padding-inline-start: 0; }
.mast .meta span { display: block; font-size: 7.5pt; color: ${C.muted}; }
.mast .meta b { font-weight: 400; font-size: 9.5pt; }
.thesis { display: flex; align-items: center; gap: 3mm; margin: 7mm 0 0; color: ${C.gold}; font-size: 9pt; }
.thesis::before, .thesis::after { content: ''; flex: 1; height: 1px; background: ${C.gold}; opacity: .45; }
.eyebrow { display: block; font: 400 7pt "Noto Sans", sans-serif; letter-spacing: .3em; text-transform: uppercase; color: ${C.goldText}; }
.sec { margin-top: 9mm; break-inside: auto; }
.sec.keep { break-inside: avoid; }
.tbl tr { break-inside: avoid; }
.sec > header { border-top: 1px solid ${C.line}; padding-top: 4mm; margin-bottom: 4mm; break-after: avoid; }
.sec h2 { font-weight: 300; font-size: 15pt; margin: 1mm 0 0; }
.sec .note { margin: 1mm 0 0; color: ${C.muted}; font-size: 8.5pt; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(30mm, 1fr)); border-top: 1px solid ${C.gold}; border-bottom: 1px solid ${C.line}; }
.kpi { padding: 4mm 4mm 4mm 0; border-inline-start: 1px solid ${C.line}; padding-inline-start: 4mm; break-inside: avoid; }
.kpi:first-child { border-inline-start: 0; padding-inline-start: 0; }
.kpi b { display: block; font: 200 24pt/1.1 "Noto Sans", sans-serif; color: ${C.graphite}; }
.kpi span { display: block; font-size: 8.5pt; color: ${C.slate}; }
.kpi small { color: ${C.muted}; font-size: 7.5pt; }
.chain { display: flex; align-items: flex-start; margin: 2mm 0; break-inside: avoid; }
.chain .node { text-align: center; width: 24mm; flex: none; display: grid; justify-items: center; gap: 1mm; }
.chain .n { font: 200 15pt/1 "Noto Sans", sans-serif; min-height: 15pt; }
.chain .l { font-size: 8.5pt; } .chain .e { font: 300 6.5pt "Noto Sans", sans-serif; letter-spacing: .2em; text-transform: uppercase; color: ${C.muted}; }
.chain .node:not(.on) .n, .chain .node:not(.on) .l { color: ${C.muted}; }
.chain .link { flex: 1; height: 1px; background: ${C.gold}; opacity: .45; margin-top: calc(15pt + 1mm + 6px); }
.bars { display: grid; gap: 2.4mm; }
.bar { display: grid; grid-template-columns: 42mm 1fr 12mm; align-items: center; gap: 3mm; break-inside: avoid; }
.bar .bl { font-size: 9pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar .bt { position: relative; height: 1px; background: ${C.line}; display: flex; align-items: center; }
.bar .bt i { display: block; height: 2px; background: ${C.graphite}; }
.bar .bt .dm { margin-inline-start: -4px; }
.bar b { font: 300 10pt "Noto Sans", sans-serif; text-align: left; }
.tbl { width: 100%; border-collapse: collapse; font-size: 8.8pt; }
.tbl thead { display: table-header-group; }
.tbl th { text-align: right; font-weight: 400; font-size: 7.5pt; color: ${C.muted}; padding: 2mm 1.5mm; border-bottom: 1px solid ${C.graphite}; white-space: nowrap; }
.tbl td { padding: 2.2mm 1.5mm; border-bottom: 1px solid ${C.line}; vertical-align: top; }
.tbl tr { break-inside: avoid; }
.tbl td.c { text-align: center; padding: 6mm; }
.tbl td:has(.pg) { white-space: nowrap; }
.pg { display: inline-block; width: 16mm; height: 2px; background: ${C.line}; vertical-align: middle; margin-inline-end: 2mm; }
.pg i { display: block; height: 100%; background: ${C.gold}; }
.pgn { font: 300 8.5pt "Noto Sans", sans-serif; }
.callout { border-right: 0.6mm solid ${C.gold}; background: ${C.mist}; padding: 4mm 5mm; border-radius: 2px; }
.callout b { display: block; font-weight: 300; font-size: 15pt; color: ${C.graphite}; margin-bottom: 1.5mm; }
.callout p { margin: 0; font-size: 9.5pt; line-height: 1.9; color: ${C.slate}; }
.points { list-style: none; margin: 0; padding: 0; display: grid; gap: 2.2mm; }
.points li { position: relative; padding-right: 5mm; font-size: 9.5pt; line-height: 1.8; color: ${C.slate}; }
.points li::before { content: ''; position: absolute; right: 0; top: 2.2mm; width: 1.8mm; height: 1.8mm; background: ${C.gold}; transform: rotate(45deg); }
.tag { display: inline-block; border: 1px solid ${C.line}; padding: 0 2mm; border-radius: 2px; font-size: 7.5pt; color: ${C.slate}; white-space: nowrap; }
.tag.gold { border-color: ${C.gold}; color: ${C.gold}; }
.mono { font-family: "Noto Sans", monospace; font-size: 8pt; letter-spacing: .05em; }
.muted { color: ${C.muted}; }
.close { break-before: avoid; display: flex; align-items: center; justify-content: space-between; gap: 8mm; margin-top: 12mm; padding-top: 6mm; border-top: 1px solid ${C.gold}; break-inside: avoid; }
.close p { margin: 0; font-size: 8.5pt; color: ${C.slate}; max-width: 120mm; }
.close .sig { font-size: 9pt; } .close .sig b { font-weight: 400; display: block; }
.rights { margin-top: 8mm; font-size: 7.2pt; color: ${C.muted}; line-height: 1.7; border-top: 1px solid ${C.line}; padding-top: 3mm; }
.rights b { font-weight: 400; color: ${C.slate}; }
.dm { display: inline-block; vertical-align: middle; }
.mast .stamp { position: absolute; top: 6mm; inset-inline-start: 50%; transform: translateX(50%) rotate(-2deg); border: 1px solid ${C.muted}; color: ${C.muted}; padding: .6mm 4mm; border-radius: 2px; font-size: 8pt; letter-spacing: .05em; background: ${C.paper}; }
.mast.co .top { direction: rtl; align-items: center; }
.mast.co .org img { max-height: 64px; max-width: 70mm; display: block; object-fit: contain; }
.mast.co .org .nm { font-weight: 300; font-size: 17pt; line-height: 1.3; color: ${C.graphite}; display: block; }
.mast.co .org .nm small { display: block; font: 400 7pt "Noto Sans", sans-serif; letter-spacing: .3em; color: ${C.muted}; text-transform: uppercase; }
.mast.co .by { display: flex; align-items: center; gap: 2mm; direction: rtl; font-size: 7.5pt; color: ${C.muted}; }
.mast.co .by svg { height: 24px; width: auto; display: block; }
.mast .accent { position: absolute; inset-inline: 0; bottom: -1px; height: 1.2mm; }
.mast.co { padding: 14mm 18mm 12mm; }
.mast.co .eyebrow { margin-top: 14mm; }
.mast.co h1 { font-size: 30pt; font-weight: 200; line-height: 1.2; margin: 3mm 0 2mm; }
.mast.co .sub { font-size: 11.5pt; color: ${C.slate}; }
.mast.co .meta { margin-top: 12mm; }
.mast.co .meta b { font-size: 10pt; }
/* ملف PDF: الغلاف صفحة كاملة وحده (حتى هامش التذييل، 1047 بكسل = PAGE.h - PAGE.bottom في pdf.js)، والعنوان في ثلثه الأوسط،
   وبيانات الوثيقة وخط لون الجهة في أسفله؛ فتبدأ «نظرة عامة» كاملة في الصفحة الثانية ولا تنقسم مع الغلاف */
html.pdf .mast.co { min-height: 1047px; display: flex; flex-direction: column; padding: 16mm 18mm 14mm; break-inside: avoid; }
html.pdf .mast.co .eyebrow { margin-top: auto; }
html.pdf .mast.co h1 { font-size: 34pt; }
html.pdf .mast.co .meta { margin-top: auto; }
html.pdf .mast.co .accent { bottom: 0; height: 2.4mm; }
</style></head><body>
<div class="toolbar">${meta.pdfName ? '<button class="pri" data-act="pdf">تحميل PDF</button><button data-act="print">طباعة</button>' : '<button class="pri" data-act="print">طباعة أو حفظ PDF</button>'}<button data-act="close">إغلاق</button></div>
<article class="sheet">
  <header class="mast${meta.brand ? ' co' : ''}">
    ${meta.stamp ? `<span class="stamp">${esc(meta.stamp)}</span>` : ''}
    ${meta.brand ? coBrand(meta.brand, id, meta.kindLabel) : `<div class="top"><div class="logo">${LOGO}</div><div class="ref">Document<b>${esc(id)}</b>${esc(meta.kindLabel || '')}</div></div>`}
    ${meta.brand && brandColor(meta.brand.color) ? `<i class="accent" style="background:${brandColor(meta.brand.color)}"></i>` : ''}
    <span class="eyebrow">${esc(meta.eyebrow || 'Milestone Impact · Report')}</span>
    <h1>${esc(meta.title)}</h1>
    ${meta.subtitle ? `<p class="sub">${esc(meta.subtitle)}</p>` : ''}
    ${meta.rows?.length ? `<div class="meta">${meta.rows.slice(0, 4).map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
    <p class="thesis">من النية… إلى الأثر</p>
  </header>
  ${body}
  <div class="close">
    <p>${esc(meta.closing || 'أُعدّت هذه الوثيقة آليًا من بيانات المنصة لحظة إصدارها، وتعكس الحالة في ذلك التاريخ.')}</p>
    ${SEAL()}
  </div>
  <footer class="rights">
    <b>جميع الحقوق محفوظة <bdi dir="ltr">© ${year} Milestone Impact</bdi>.</b>
    هذه الوثيقة ومحتواها ملكية فكرية لـ <bdi dir="ltr">Milestone Impact</bdi>. ${esc(conf)}. لا يجوز نسخها أو نشرها أو مشاركتها مع طرف ثالث دون إذن كتابي.
    <span class="mono"><bdi dir="ltr">${esc(id)}</bdi> · ${esc(today())}</span>
  </footer>
</article>
${opts.pdf ? runningHead(meta) : ''}
</body></html>`;
}

// ترويسة صفحات ملف PDF بعد الغلاف (pdf.js يرسمها مرة ويكررها): شعار الجهة أو اسمها ولونها في البداية، وعنوان الوثيقة، وعلامة Milestone Impact في الطرف الآخر.
// خارج .sheet فلا تدخل في حساب الصفحات، وتُرسم بالخطوط والصور نفسها
function runningHead(meta) {
  const b = meta.brand;
  const logo = b && safeLogo(b.logo);
  const color = (b && brandColor(b.color)) || C.gold;
  const org = b ? (logo ? `<img src="${esc(logo)}" alt="">` : `<b>${esc(b.name || 'مبادرة مجتمعية')}</b>`) : '';
  return `<div id="pdf-head" style="position:absolute;top:0;left:0;width:794px;height:60px;background:#fff;direction:rtl;display:flex;align-items:center;gap:10px;padding:14px 68px 0;font:300 8pt 'Noto Kufi Arabic',sans-serif;color:${C.muted}">
<span class="ph-org" style="display:flex;align-items:center;gap:8px;max-width:60%;white-space:nowrap;overflow:hidden">${org ? `<span style="display:flex;align-items:center;height:22px">${org}</span><i style="width:1px;height:14px;background:${C.line}"></i>` : ''}<span style="overflow:hidden;text-overflow:ellipsis">${esc(meta.title)}</span></span>
<span style="margin-inline-start:auto;display:flex;align-items:center;direction:ltr" class="ph-mi">${LOGO}</span>
<i style="position:absolute;bottom:8px;left:68px;right:68px;height:1px;background:${color};opacity:.7"></i>
</div><style>#pdf-head img{max-height:22px;max-width:150px;object-fit:contain;display:block}#pdf-head b{font-weight:400;color:${C.graphite}}#pdf-head .ph-mi svg{height:17px;width:auto;display:block}</style>`;
}

// يفتح الوثيقة في نافذة مستقلة بشريط «طباعة أو حفظ PDF». يعيد false إن حُجبت النافذة.
// الأزرار تُربط من هنا لا بسكربت داخل الوثيقة: سياسة CSP في المنصات تمنع السكربت المضمّن.
export const openDocument = (meta, body) => writeDocument(window.open('', '_blank'), meta, body);

// يكتب الوثيقة في نافذة مفتوحة سلفًا: تُفتح النافذة عند النقر مباشرة ثم تُملأ
// بعد تحميل المحرك، وإلا عدّها المتصفح نافذة منبثقة غير مطلوبة وحجبها.
export function writeDocument(win, meta, body) {
  if (!win) return false;
  win.document.open();
  win.document.write(documentHtml(meta, body));
  win.document.close();
  win.document.querySelector('[data-act="print"]')?.addEventListener('click', () => win.print());
  // «تحميل PDF»: يُبنى الملف في نافذة المنصة (pdf.js) ويُحفظ من النافذة نفسها، والزر يعرض تقدمه
  const pdfBtn = win.document.querySelector('[data-act="pdf"]');
  pdfBtn?.addEventListener('click', async () => {
    if (pdfBtn.disabled) return;
    pdfBtn.disabled = true;
    const label = pdfBtn.textContent;
    try {
      const { downloadPdf } = await import('./pdf.js');
      await downloadPdf(meta, body, { onProgress: (t) => { pdfBtn.textContent = t; } });
      pdfBtn.textContent = 'حُفظ الملف';
    } catch (e) {
      console.error(e);
      pdfBtn.textContent = 'تعذّر التحميل، استعمل «طباعة»';
    } finally {
      setTimeout(() => { pdfBtn.textContent = label; pdfBtn.disabled = false; }, 2500);
    }
  });
  win.document.querySelector('[data-act="close"]')?.addEventListener('click', () => win.close());
  return true;
}
