// ════════════════════════════════════════════════════════════════
// وثائق Milestone Impact: محرك تقارير الطباعة بالهوية (الوضع الفاتح)
// ════════════════════════════════════════════════════════════════
// كل تقرير في المنصات يُبنى من هنا فيخرج بهوية واحدة: أرضية Mist،
// نص Graphite، والذهب خطًا وماسةً وختمًا فقط (≈5%). A4 بهامش 18 مم،
// ترويسة بالشعار ونقش الماس الخافت، وتذييل بحقوق النشر على كل صفحة.
// المرجع: Milestone-Impact-Brand-Brief (الألوان، الخطوط الخفيفة، الماسة، الختم مرة واحدة).
// كل نص يدخل الوثيقة يمر عبر esc(): النافذة ترث نطاق التطبيق.
import { pdfServer } from './pdf-source.js';
import { orgLogoHtml, refreshLogos, primeLogos, logosPending } from './logo.js';
import { DOC_LIVE_HEAD_AR, DOC_WATERMARK_AR, REPORT_RIGHTS_AR } from '../../../supabase/functions/leaders-api/labels.js';
import LOGO_SRC from '../../assets/brand/milestone-impact.svg?raw';

// الشعار من الملف الأصلي كما هو، دون إعلان XML لأنه يُضمَّن داخل HTML
const LOGO = LOGO_SRC.replace(/<\?xml[^>]*>\s*/, '');

export const C = {
  graphite: '#0B272F', gold: '#A97A2E', goldText: '#8A6424', goldLight: '#D9A85A', mist: '#F7F8F6',
  paper: '#FFFFFF', slate: '#2C4148', muted: '#5F7176', line: '#DCE2E1', faint: '#EEF1F0',
};

// ── الصفحة (المرحلة 27): مصدر واحد لهوامش A4 يحكم @page في الطباعة ومولّد الخادم، ويشتق منه pdf.js (PAGE) هوامش ملفه المرسوم ──
export const PAGE_MM = Object.freeze({ w: 210, h: 297, top: 22, side: 20, bottom: 24 });
/** مم إلى بكسل بدقة 96 (A4 = 794×1123) */
export const mmPx = (mm) => Math.round((mm * 96) / 25.4);
// السلم الطباعي للصفحات الداخلية: لا وزن دون 400 في الطباعة
// المرحلة 4: سبع درجات فقط (TYPE_STEPS)، وكل حجم خط في doc.js وinstitutional.js وcapstone.js مربوط بها (type-scale.test.js)
export const TYPE_SCALE = Object.freeze({ footer: 7.5, caption: 8.5, small: 9, body: 10.5, h3: 12, chapter: 18, display: 30, leading: 1.7, workLeading: 1.75, chapterWeight: 600, h3Weight: 500, label: 8.5, labelWeight: 600, table: 9, footerColor: '#5F7176' });
export const TYPE_STEPS = Object.freeze([TYPE_SCALE.footer, TYPE_SCALE.caption, TYPE_SCALE.small, TYPE_SCALE.body, TYPE_SCALE.h3, TYPE_SCALE.chapter, TYPE_SCALE.display]);
const TS = TYPE_SCALE;
// المرحلة 28: العلامة المائية للنسخة الحية في كل صفحة (المعتمدة نظيفة): زاوية 30 درجة، 54pt، لون #0B272F، شفافية 0.045.
// مصدر واحد للطباعة ومولّد الخادم (عنصر ثابت يتكرر في كل صفحة مطبوعة) ولطبقة jsPDF في pdf.js
export const WATERMARK = Object.freeze({ text: DOC_WATERMARK_AR, angle: 30, size: 54, color: '#0B272F', opacity: 0.045 });
export const isLiveDoc = (meta) => meta?.live === true;
// ختم الحية في الاعتماد: حلقة رمادية منقطة بلا ذهب، وعلامة Milestone الصغيرة في الإغلاق
export const LIVE_RING = () => `<svg class="ring" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="#8A948F" stroke-width="1" stroke-dasharray="2 3"/></svg>`;

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : esc(n));
// خلية رقمية في الجدول (المرحلة 5): عدد، أو نص أرقام بفواصل ونسبة أو عملة، فلا تلتف ولا تنكسر («480,00» ثم «0»)
const NUMERIC = /^[+\-−]?[\d٠-٩][\d٠-٩,.٬٫\s]*(%|٪)?(\s*(ريال|ر\.س|SAR))?$/;
const isNumeric = (v) => typeof v === 'number' || (typeof v === 'string' && NUMERIC.test(v.trim()));
// المرحلة 5: صيغة تاريخ بشرية واحدة في الوثائق (27 نوفمبر 2026) بأرقام لاتينية وتوقيت الرياض، وISO في البصمة وحدها
export const humanDate = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric' }); };
export const today = () => humanDate(new Date());

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

export const SEAL = (label = 'MILESTONE IMPACT') => `<svg class="seal" width="128" height="128" viewBox="0 0 120 120" style="width:34mm;height:34mm" aria-hidden="true">
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
<tbody>${rows.length ? rows.map((r) => `<tr>${r.map((v, i) => `<td${isNumeric(v) ? ' class="num"' : ''}${cols[i]?.ltr ? ' dir="ltr"' : ''}${cols[i]?.align ? ` style="text-align:${cols[i].align}"` : ''}>${isRaw(v) ? v.html : num(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="muted c">${esc(empty)}</td></tr>`}</tbody></table>`;

export const progress = (pct) => `<span class="pg"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span><span class="pgn">${num(Math.round(pct))}%</span>`;
// علامة HTML الخام رمز لا يُزوَّر (المرحلة 21): كائن قادم من القاعدة أو JSON يحمل html لا يمر خامًا، بل يُهرَّب نصًا
const RAW = Symbol('raw');
export const raw = (html) => ({ [RAW]: true, html: String(html ?? '') });
export const isRaw = (v) => !!(v && typeof v === 'object' && v[RAW] === true);
// خلاصة مميّزة بشريط ذهبي: عنوان ونص
export const callout = (title, text) => `<div class="callout"><b>${esc(title)}</b><p>${esc(text)}</p></div>`;
// قائمة نقاط بمعين ذهبي
export const points = (items, empty = 'لا شيء') => (items.length ? `<ul class="points">${items.map((t) => `<li>${isRaw(t) ? t.html : esc(t)}</li>`).join('')}</ul>` : `<p class="muted">${esc(empty)}</p>`);

// ── الغلاف المشترك (الوثيقة المؤسسية) ──
// brand: { name, logo, color }. شعار الجهة أعلى الغلاف، و«بإعداد Milestone Impact» أصغر، ولون الجهة خط تمييز وحده.
// بلا شعار يُكتب اسمها نصًا؛ بلا جهة «مبادرة مجتمعية». اللون يُقبل بصيغة #RGB أو #RRGGBB وحدها فلا يُحقن في النمط
// نص آمن داخل سلسلة CSS (ترويسة الصفحة)
const cssStr = (v) => String(v ?? '').replace(/[\\"\n\r<>]/g, ' ');
export const brandColor = (c) => (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(c || '')) ? c : null);
// الشعار مضمّن (data:) أو من أصل المنصة نفسها وحده (المرحلة 21): رابط https خارجي يُرفض، فلا يجلب قارئ الوثيقة أو مولّد PDF
// شيئًا من خارجها ولا يُتتبع من يفتحها. بلا شعار صالح يُكتب اسم الجهة نصًا
export const safeLogo = (u) => (/^(data:image\/(png|jpe?g|webp|svg\+xml);base64,|\/(?!\/))/i.test(String(u || '')) ? u : null);
// ── التباين: لون الجهة أو الدفعة يقود العناصر البنيوية (أرقام الأبواب وخطوطها) بعد فحص آلي، وإلا لون الهوية ──
// WCAG 2.x: النسبة بين الإضاءتين النسبيتين. الأرقام الكبيرة والخطوط نص كبير أو عناصر غير نصية، فالحد 3:1 على الأبيض
const lum = (hex) => {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrastRatio = (a, b = '#FFFFFF') => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
export const ACCENT_MIN_CONTRAST = 3;
/** أول لون صالح يجتاز فحص التباين على الأبيض من المرشحين بالترتيب (الجهة ثم الدفعة)، وإلا لون الهوية الذهبي */
export function structuralAccent(...candidates) {
  for (const c of candidates) if (brandColor(c) && contrastRatio(c) >= ACCENT_MIN_CONTRAST) return { color: brandColor(c), source: c };
  return { color: C.gold, source: null };
}

// ── قواعد التشارك (قرار المالك 2026-11-25): الجهة في الصدارة، والبرنامج (هوية الدفعة) سطر توقيع صغير، وMilestone علامة خافتة.
// شعار الجهة بفئة أبعاده (logo.js): عريض 14 مم بعرض أقصى 64 مم، مربع 20 مم، طويل 24 مم بعرض أقصى 20 مم، داخل لوحة 4×5 مم. شعار الدفعة 9 مم. علامة Milestone 9 مم
function coBrand(b, id, kindLabel, ctl) {
  const plogo = safeLogo(b.programLogo);
  const program = b.program || plogo ? `<div class="prog">${plogo ? `<img src="${esc(plogo)}" alt="${esc(b.program || '')}">` : ''}${b.program ? `<span>${esc(b.program)}</span>` : ''}</div>` : '';
  const ref = ctl ? '' : `<div class="ref" style="margin-top:4mm;text-align:start;direction:ltr">Document<b>${esc(id)}</b>${esc(kindLabel || '')}</div>`;
  return `${lockup(b)}${program}${ref}`;
}

// العلامة المشتركة (الغلاف وصفحة الاعتماد): شعار الجهة بفئة أبعاده، فاصل ذهبي بارتفاعه، ثم «بإعداد» فوق علامة المنصة.
// الفئة والفاتح وسقف الحدة من logo.js (orgLogoHtml): من قياس الصورة المحمّلة إن سبق (primeLogos في writeDocument)، وإلا من الترويسة وSVG
export function lockup(b) {
  const logo = safeLogo(b.logo);
  const org = logo ? orgLogoHtml(logo, { escape: esc, alt: b.name || '', base: 'org plate', light: b.logoLight ?? null })
    : `<div class="org"><span class="nm">${esc(b.name || 'مبادرة مجتمعية')}</span></div>`;
  return `<div class="top">${org}<i class="dv"></i><div class="by"><span>بإعداد</span>${LOGO}</div></div>`;
}

// ── المرحلة 25: خط لون الجهة أسفل الغلاف (1.6 مم موحدًا). يمر بـ structuralAccent، وإن لم يجتزه يُرسم بلون الجهة الخام
// فلا تُطمس الهوية، ويُضاف تحته حد جرافيتي 0.3 مم إن قل تباينه عن 1.5:1 على mist فلا يختفي. لا يمس أي نص
export const ACCENT_GUARD_MIN = 1.5;
export function coverAccent(color) {
  const raw = brandColor(color);
  if (!raw) return null;
  const passes = Boolean(structuralAccent(raw).source);
  return { color: raw, passes, guard: !passes && contrastRatio(raw, C.mist) < ACCENT_GUARD_MIN };
}
// شريط الضبط الوثائقي: رمز · إصدار · تاريخ ISO · حالة لاتينية، والأجزاء تُنقّى فلا يدخلها إلا [A-Z0-9-.]
export const controlStrip = (parts) => parts.map((x) => String(x ?? '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '')).filter(Boolean).join(' · ');

// ── الوثيقة ──
// meta: { kind: 'ORG'|'PLAN'|..., eyebrow, title, subtitle?, for?, rows: [[label, value]], confidential?: نص, pageAr?: ترقيم الصفحات بالعربية,
//         selfFonts?: خطوط المنصة المستضافة ذاتيًا (/fonts/fonts.css): سياسة CSP في تطبيقي القادة والإدارة تمنع Google Fonts,
//         pdfName?: اسم ملف PDF الجاهز، فيظهر في الشريط زر «تحميل PDF» (pdf.js) }
// opts.pdf: الوثيقة تُرسم لتصدير PDF (pdf.js): بلا شريط ولا ظل ولا هامش حول الورقة
// opts.embed: الوثيقة داخل صفحة (رابط المشاركة): بلا شريط، والصفحة المضيفة تحمل أزرارها
export function documentHtml(meta, body, opts = {}) {
  const id = meta.id || docId(meta.kind || 'DOC');
  const year = new Date().getFullYear();
  const accent = meta.brand ? coverAccent(meta.brand.color) : null;
  const T = TYPE_SCALE;
  const rows = (meta.rows || []).slice(0, meta.brand ? (meta.control ? 3 : 6) : 4);
  const conf = meta.confidential || 'سري: مخصص للجهة المعنية فقط';
  // opts.print: الوثيقة نفسها لمولّد PDF على الخادم (workers/pdf-render): بلا شريط، وbase لخطوط المنصة وصورها
  return refreshLogos(`<!doctype html><html lang="ar" dir="rtl"${opts.pdf ? ' class="pdf"' : opts.embed ? ' class="embed"' : opts.print ? ' class="print"' : ''}><head><meta charset="utf-8">
<meta name="color-scheme" content="light"><meta name="darkreader-lock">
${opts.base ? `<base href="${esc(opts.base)}">` : ''}
<title>${esc(meta.title)} · Milestone Impact</title>
${meta.selfFonts ? '<link rel="stylesheet" href="/fonts/fonts.css">' : `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@300;400;500;600&family=Noto+Sans:wght@300;400;600&display=swap" rel="stylesheet">`}
<style>
@page { size: A4; margin: ${PAGE_MM.top}mm ${PAGE_MM.side}mm ${PAGE_MM.bottom}mm;
  ${meta.brand ? `@bottom-right { content: "${cssStr(meta.footer || id)}"; font: 400 ${T.footer}pt "Noto Sans", sans-serif; letter-spacing: .08em; color: ${T.footerColor}; }` : `@bottom-right { content: "MILESTONE IMPACT  ·  DECISIONS  ·  DIRECTION  ·  IMPACT"; font: 400 ${T.footer}pt "Noto Sans", sans-serif; letter-spacing: .25em; color: ${T.footerColor}; }`}
  ${meta.brand ? `@top-right { ${isLiveDoc(meta) ? `content: "${cssStr(DOC_LIVE_HEAD_AR)}";` : `content: "${cssStr(meta.title)}"; content: string(chapter);`} font: 400 ${T.footer}pt "Noto Kufi Arabic", sans-serif; color: ${T.footerColor}; } @top-left { content: "${cssStr(meta.brand.name || 'مبادرة مجتمعية')}"; font: 400 ${T.footer}pt "Noto Kufi Arabic", sans-serif; color: ${T.footerColor}; }` : ''}
  @bottom-left { ${meta.pageAr ? `content: "صفحة " counter(page) " من " counter(pages); font: 400 ${T.footer}pt "Noto Kufi Arabic", sans-serif; letter-spacing: 0;` : `content: "PAGE " counter(page) " OF " counter(pages); font: 400 ${T.footer}pt "Noto Sans", sans-serif; letter-spacing: .2em;`} color: ${T.footerColor}; } }
/* الترويسة باسم الباب الحالي (string set) */
body { string-set: chapter "${cssStr(meta.title)}"; }
.sec > header h2, .in-open h2 { string-set: chapter content(text); }
${meta.brand ? '' : `/* المرحلة 5: لا تذييل على الصفحة الأولى */
@page :first { @bottom-right { content: none; } @bottom-left { content: none; } }`}
${meta.brand ? `/* الغلاف صفحة كاملة بلا هامش ولا ترويسة (الطباعة ومولّد الخادم)، والمحتوى يبدأ الصفحة الثانية */
@page :first { margin: 0; @top-right { content: none; } @top-left { content: none; } @bottom-right { content: none; } @bottom-left { content: none; } }
@media print { html:not(.pdf) .mast.co { height: 296.5mm; overflow: hidden; display: flex; flex-direction: column; padding: 18mm 18mm 16mm; break-after: page; margin: 0; }
  html:not(.pdf) .mast.co .eyebrow { margin-top: auto; } html:not(.pdf) .mast.co .meta { margin-top: auto; }
  html:not(.pdf) .mast.co .accent { bottom: 0; } }` : ''}
${isLiveDoc(meta) ? `/* العلامة المائية: عنصر ثابت يتكرر في كل صفحة مطبوعة، ولا يُرسم في ملف pdf.js لأنه يضيفها طبقة بـ jsPDF */
.wm { display: none; }
@media print { html:not(.pdf) .wm { display: flex; position: fixed; inset: 0; align-items: center; justify-content: center; pointer-events: none; z-index: 9; }
  html:not(.pdf) .wm span { transform: rotate(-${WATERMARK.angle}deg); font: 500 ${WATERMARK.size}pt "Noto Kufi Arabic", sans-serif; color: ${WATERMARK.color}; opacity: ${WATERMARK.opacity}; white-space: nowrap; } }` : ''}
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* الوثيقة فاتحة فقط (المرحلة 22): الإعلان في الجذر والرأس، ووسم قفل Dark Reader لأن الإعلان وحده لا يوقف الإضافة */
:root { color-scheme: light; }
html { background: ${C.faint}; background-color: ${C.faint}; }
body { margin: 0; font-family: "Noto Kufi Arabic", "Noto Sans", system-ui, sans-serif; font-weight: 400; color: ${C.graphite}; font-size: ${T.body}pt; line-height: ${T.leading}; }
.sheet { max-width: 210mm; margin: 0 auto; background: ${C.paper}; background-color: ${C.paper}; padding: 0 0 14mm; }
@media screen { .sheet { margin: 12mm auto; box-shadow: 0 0 0 1px ${C.line}; } .sheet > *:not(.mast) { padding-inline: ${PAGE_MM.side}mm; } }
html.pdf .sheet > *:not(.mast) { padding-inline: ${PAGE_MM.side}mm; }
@media print { html { background: none; } .sheet { max-width: none; padding: 0; } .toolbar { display: none !important; } }
html.pdf { background: ${C.paper}; } html.pdf .toolbar { display: none !important; }
html.pdf .sheet { margin: 0; box-shadow: none; max-width: 210mm; width: 210mm; padding-bottom: 0; }
html.print { background: ${C.paper}; } html.print .toolbar { display: none !important; }
html.embed { background: transparent; } html.embed .toolbar { display: none !important; }
html.embed .sheet { margin: 0 auto; box-shadow: 0 0 0 1px ${C.line}; }
@media screen and (max-width: 700px) { html.embed .sheet > *:not(.mast) { padding-inline: 6mm; } html.embed .mast { padding: 8mm 6mm; } html.embed .mast .meta { grid-template-columns: repeat(2, 1fr); } }
p, li { orphans: 3; widows: 3; text-wrap: pretty; }
h2, h3 { break-after: avoid; }
h3 { font-size: ${T.h3}pt; font-weight: ${T.h3Weight}; }
.toolbar { position: sticky; top: 0; z-index: 5; display: none; gap: 8px; justify-content: center; padding: 10px; background: ${C.graphite}; }
@media screen { .toolbar { display: flex; } }
.toolbar button { font: 400 ${TS.small}pt "Noto Kufi Arabic", sans-serif; border: 1px solid ${C.gold}; background: transparent; color: ${C.mist}; padding: 7px 16px; border-radius: 2px; cursor: pointer; letter-spacing: 0; }
.toolbar button.pri { background: ${C.goldLight}; color: ${C.graphite}; }
.mast { position: relative; background: ${C.mist} ${LATTICE}; background-color: ${C.mist}; color: ${C.graphite}; border-bottom: 1px solid ${C.gold}; padding: 12mm 18mm 10mm; }
.mast .top { display: flex; justify-content: space-between; align-items: flex-start; direction: ltr; }
.mast .logo svg { height: 46px; width: auto; display: block; }
.mast .ref { text-align: right; font: 300 ${TS.footer}pt "Noto Sans", sans-serif; letter-spacing: .3em; text-transform: uppercase; color: ${C.muted}; line-height: 2; }
.mast .ref b { display: block; font-weight: 400; letter-spacing: .12em; color: ${C.graphite}; }
.mast .eyebrow { margin-top: 10mm; }
.mast h1 { font-weight: 500; color: ${C.graphite}; font-size: ${TS.display}pt; line-height: 1.25; margin: 2mm 0 1mm; letter-spacing: 0; }
.mast .sub { color: ${C.slate}; font-size: ${TS.h3}pt; margin: 0; }
.mast .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 8mm; border-top: 1px solid ${C.line}; }
.mast .meta div { padding: 3mm 0 0; border-inline-start: 1px solid ${C.line}; padding-inline-start: 4mm; }
.mast .meta div:first-child { border-inline-start: 0; padding-inline-start: 0; }
.mast .meta span { display: block; font-size: ${TS.footer}pt; color: ${C.muted}; }
.mast .meta b { font-weight: 400; font-size: ${TS.small}pt; color: ${C.graphite}; }
.thesis { display: flex; align-items: center; gap: 3mm; margin: 7mm 0 0; color: ${C.goldText}; font-size: ${TS.small}pt; }
.thesis::before, .thesis::after { content: ''; flex: 1; height: 1px; background: ${C.gold}; opacity: .45; }
.eyebrow { display: block; font: 400 ${TS.footer}pt "Noto Sans", sans-serif; letter-spacing: .12em; text-transform: uppercase; color: ${C.goldText}; opacity: .7; }
.sec { margin-top: 9mm; break-inside: auto; }
.sec.keep { break-inside: avoid; }
.tbl tr { break-inside: avoid; }
.sec > header { border-top: 1px solid ${C.line}; padding-top: 4mm; margin-bottom: 4mm; break-after: avoid; }
.sec h2 { font-weight: ${T.chapterWeight}; font-size: ${T.chapter}pt; margin: 1mm 0 0; }
.sec .note { margin: 1mm 0 0; color: ${C.muted}; font-size: ${TS.caption}pt; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(30mm, 1fr)); border-top: 1px solid ${C.gold}; border-bottom: 1px solid ${C.line}; }
.kpi { padding: 4mm 4mm 4mm 0; border-inline-start: 1px solid ${C.line}; padding-inline-start: 4mm; break-inside: avoid; }
.kpi:first-child { border-inline-start: 0; padding-inline-start: 0; }
.kpi b { display: block; font: 400 ${TS.chapter}pt/1.1 "Noto Sans", sans-serif; color: ${C.graphite}; }
.kpi span { display: block; font-size: ${T.label}pt; font-weight: ${T.labelWeight}; color: ${C.slate}; }
.kpi small { color: ${C.muted}; font-size: ${TS.footer}pt; }
.chain { display: flex; align-items: flex-start; margin: 2mm 0; break-inside: avoid; }
.chain .node { text-align: center; width: 24mm; flex: none; display: grid; justify-items: center; gap: 1mm; }
.chain .n { font: 400 ${TS.h3}pt/1 "Noto Sans", sans-serif; min-height: 15pt; }
.chain .l { font-size: ${TS.caption}pt; } .chain .e { font: 400 ${TS.footer}pt "Noto Sans", sans-serif; letter-spacing: .2em; text-transform: uppercase; color: ${C.muted}; }
.chain .node:not(.on) .n, .chain .node:not(.on) .l { color: ${C.muted}; }
.chain .link { flex: 1; height: 1px; background: ${C.gold}; opacity: .45; margin-top: calc(15pt + 1mm + 6px); }
.bars { display: grid; gap: 2.4mm; }
.bar { display: grid; grid-template-columns: 42mm 1fr 12mm; align-items: center; gap: 3mm; break-inside: avoid; }
.bar .bl { font-size: ${TS.small}pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar .bt { position: relative; height: 1px; background: ${C.line}; display: flex; align-items: center; }
.bar .bt i { display: block; height: 2px; background: ${C.graphite}; }
.bar .bt .dm { margin-inline-start: -4px; }
.bar b { font: 400 ${TS.body}pt "Noto Sans", sans-serif; text-align: left; }
.tbl { width: 100%; border-collapse: collapse; font-size: ${T.table}pt; }
.tbl thead { display: table-header-group; }
.tbl th { text-align: right; font-weight: 400; font-size: ${TS.caption}pt; color: ${C.muted}; padding: 2mm 1.5mm; border-bottom: 1px solid ${C.graphite}; white-space: nowrap; }
.tbl td { padding: 2.2mm 1.5mm; border-bottom: 1px solid ${C.line}; vertical-align: top; }
.tbl tr { break-inside: avoid; }
.tbl td.c { text-align: center; padding: 6mm; }
.tbl td.num { white-space: nowrap; font-variant-numeric: tabular-nums; min-width: 22mm; }
.tbl td:has(.pg) { white-space: nowrap; }
.pg { display: inline-block; width: 16mm; height: 2px; background: ${C.line}; vertical-align: middle; margin-inline-end: 2mm; }
.pg i { display: block; height: 100%; background: ${C.gold}; }
.pgn { font: 400 ${TS.caption}pt "Noto Sans", sans-serif; }
.callout { border-right: 0.6mm solid ${C.gold}; background: ${C.mist}; padding: 4mm 5mm; border-radius: 2px; }
.callout b { display: block; font-weight: 400; font-size: ${TS.h3}pt; color: ${C.graphite}; margin-bottom: 1.5mm; }
.callout p { margin: 0; font-size: ${TS.body}pt; line-height: 1.9; color: ${C.slate}; }
.points { list-style: none; margin: 0; padding: 0; display: grid; gap: 2.2mm; }
.points li { position: relative; padding-right: 5mm; font-size: ${TS.body}pt; line-height: 1.8; color: ${C.slate}; }
.points li::before { content: ''; position: absolute; right: 0; top: 2.2mm; width: 1.8mm; height: 1.8mm; background: ${C.gold}; transform: rotate(45deg); }
.tag { display: inline-block; border: 1px solid ${C.line}; padding: 0 2mm; border-radius: 2px; font-size: ${TS.footer}pt; color: ${C.slate}; white-space: nowrap; }
.tag.gold { border-color: ${C.gold}; color: ${C.gold}; }
.mono { font-family: "Noto Sans", monospace; font-size: ${TS.caption}pt; letter-spacing: .05em; }
.muted { color: ${C.muted}; }
.close { break-before: avoid; display: flex; align-items: center; justify-content: space-between; gap: 8mm; margin-top: 12mm; padding-top: 6mm; border-top: 1px solid ${C.gold}; break-inside: avoid; }
.close p { margin: 0; font-size: ${TS.caption}pt; color: ${C.slate}; max-width: 120mm; }
.close .sig { font-size: ${TS.small}pt; } .close .sig b { font-weight: 400; display: block; }
.rights { margin-top: 8mm; font-size: ${TS.footer}pt; color: ${C.muted}; line-height: 1.7; border-top: 1px solid ${C.line}; padding-top: 3mm; word-break: keep-all; overflow-wrap: normal; }
.rights .rt-meta { display: block; white-space: nowrap; margin-top: 1mm; font-variant-numeric: tabular-nums; }
.rights b { font-weight: 400; color: ${C.slate}; }
.dm { display: inline-block; vertical-align: middle; }
.mast .stamp { display: inline-block; border: 1px solid ${C.gold}; color: ${C.goldText}; padding: .5mm 3mm; border-radius: 2px; font-size: ${TS.small}pt; font-weight: 500; letter-spacing: 0; background: ${C.paper}; line-height: 1.6; }
.mast > .stamp { position: absolute; top: 6mm; inset-inline-end: 18mm; }
.mast .ctlrow { display: flex; align-items: center; justify-content: space-between; gap: 4mm; margin-top: 3mm; flex-wrap: wrap; }
.mast .ctl { font: 400 ${TS.footer}pt "Noto Sans", sans-serif; letter-spacing: .14em; color: ${C.muted}; direction: ltr; unicode-bidi: isolate; }
.mast.co .top { direction: rtl; align-items: center; justify-content: flex-start; }
.mast.co .org { display: flex; align-items: center; }
.mast.co .org.plate { background: ${C.paper}; background-color: ${C.paper}; margin: 0; padding: 4mm 5mm; border: 0.25mm solid ${C.line}; border-radius: 0; box-shadow: none; }
.mast.co .org.plate.light { background: ${C.graphite}; background-color: ${C.graphite}; }
.mast.co .org img { display: block; width: auto; object-fit: contain; }
.mast.co .org.w img { height: 14mm; max-width: 64mm; }
.mast.co .org.s img { height: 20mm; max-width: 60mm; }
.mast.co .org.t img { height: 24mm; max-width: 20mm; }
.mast.co .dv { display: block; width: 0.3mm; align-self: stretch; margin: 0 6mm; background: ${C.gold}; }
.mast.co .org.w + .dv { align-self: center; height: 14mm; } .mast.co .org.s + .dv { align-self: center; height: 20mm; } .mast.co .org.t + .dv { align-self: center; height: 24mm; }
.mast.co .prog { display: flex; align-items: center; gap: 2.5mm; margin-top: 6mm; direction: rtl; font-size: ${TS.small}pt; font-weight: 400; color: ${C.slate}; }
.mast.co .prog img { max-height: 9mm; max-width: 40mm; object-fit: contain; display: block; }
.mast.co .meta { grid-template-columns: repeat(var(--n, 3), 1fr); row-gap: 4mm; }
.mast.co .meta div:first-child { border-inline-start: 0; padding-inline-start: 0; }
.mast.co .org .nm { font-weight: 500; font-size: ${TS.h3}pt; line-height: 1.4; color: ${C.graphite}; display: block; }
.mast.co .by { display: flex; flex-direction: column; align-items: flex-start; gap: 1mm; direction: rtl; color: ${C.muted}; }
.mast.co .by span { font-size: ${TS.footer}pt; line-height: 1; }
.mast.co .by svg { height: 9mm; width: auto; display: block; }
.mast .accent { position: absolute; inset-inline: 0; bottom: -1px; height: 1.6mm; }
.mast .accent.guard { box-shadow: 0 .3mm 0 ${C.graphite}; }
.mast.co { padding: 14mm 18mm 12mm; }
.mast.co .eyebrow { margin-top: 14mm; }
.mast.co h1 { font-size: ${TS.display}pt; font-weight: 500; line-height: 1.25; margin: 3mm 0 0; text-wrap: balance; max-width: 150mm; }
.mast.co .rule { display: block; width: 16mm; height: .6mm; background: ${C.gold}; margin: 4mm 0 3mm; }
.mast.co .sub { font-size: ${TS.h3}pt; color: ${C.slate}; }
.mast.co .meta { margin-top: 12mm; }
.mast.co .meta b { font-size: ${TS.body}pt; font-weight: 500; }
.mast.co { border-bottom: 0; }
.close .thesis { margin: 0 0 3mm; flex-basis: 100%; }
.close { flex-wrap: wrap; }
.close .mi-mark svg { height: 9mm; width: auto; display: block; }
/* ملف PDF: الغلاف صفحة كاملة وحده (إلى حافة الورقة بلا تذييل، المرحلة 5: FIRST_H = PAGE.h في pdf.js)، والعنوان في ثلثه الأوسط،
   وبيانات الوثيقة وخط لون الجهة في أسفله؛ فتبدأ «نظرة عامة» كاملة في الصفحة الثانية ولا تنقسم مع الغلاف */
html.pdf .mast.co { min-height: ${mmPx(PAGE_MM.h)}px; display: flex; flex-direction: column; padding: 16mm 18mm 14mm; break-inside: avoid; break-after: page; }
html.pdf .mast.co .eyebrow { margin-top: auto; }
html.pdf .mast.co .meta { margin-top: auto; }
html.pdf .mast.co .accent { bottom: 0; }
</style></head><body>
<div class="toolbar">${meta.pdfName ? '<button class="pri" data-act="pdf">تحميل PDF</button><button data-act="print">طباعة</button>' : '<button class="pri" data-act="print">طباعة أو حفظ PDF</button>'}<button data-act="close">إغلاق</button></div>
<article class="sheet">
  <header class="mast${meta.brand ? ' co' : ''}">
    ${meta.stamp && !(meta.brand && meta.control) ? `<span class="stamp">${esc(meta.stamp)}</span>` : ''}
    ${meta.brand ? coBrand(meta.brand, id, meta.kindLabel, meta.control) : `<div class="top"><div class="logo">${LOGO}</div><div class="ref">Document<b>${esc(id)}</b>${esc(meta.kindLabel || '')}</div></div>`}
    ${accent ? `<i class="accent${accent.guard ? ' guard' : ''}" style="background:${accent.color}"></i>` : ''}
    <span class="eyebrow">${esc(meta.eyebrow || 'Milestone Impact · Report')}</span>
    <h1>${esc(meta.title)}</h1>${meta.brand ? '<i class="rule" aria-hidden="true"></i>' : ''}
    ${meta.subtitle ? `<p class="sub">${esc(meta.subtitle)}</p>` : ''}
    ${rows.length ? `<div class="meta"${meta.brand ? ` style="--n:${rows.length}"` : ''}>${rows.map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
    ${meta.brand && meta.control ? `<div class="ctlrow"><bdi class="ctl" dir="ltr"${meta.controlLabel ? ` role="note" aria-label="${esc(meta.controlLabel)}"` : ''}>${esc(meta.control)}</bdi>${meta.stamp ? `<span class="stamp">${esc(meta.stamp)}</span>` : ''}</div>` : ''}
  </header>
  ${body}
  <div class="close">
    <p class="thesis">من النية… إلى الأثر</p>
    <p>${esc(meta.closing || 'أُعدّت هذه الوثيقة آليًا من بيانات المنصة لحظة إصدارها، وتعكس الحالة في ذلك التاريخ.')}</p>
    ${isLiveDoc(meta) ? `<span class="mi-mark" aria-hidden="true">${LOGO}</span>` : SEAL()}
  </div>
  <footer class="rights">
    <b>جميع الحقوق محفوظة <bdi dir="ltr">© ${year} Milestone Impact</bdi>.</b>
    ${esc(meta.rights || REPORT_RIGHTS_AR).replace('Milestone Impact', '<bdi dir="ltr">Milestone Impact</bdi>')} ${esc(conf.replace(/\.$/, ''))}.
    <span class="rt-meta"><bdi dir="ltr">${esc(id)}</bdi> · <bdi>${esc(today())}</bdi></span>
  </footer>
</article>
${isLiveDoc(meta) && !opts.pdf ? `<div class="wm" aria-hidden="true"><span>${esc(WATERMARK.text)}</span></div>` : ''}
${opts.pdf ? runningHead(meta) : ''}
</body></html>`);
}

// ترويسة صفحات ملف PDF بعد الغلاف (pdf.js يرسمها مرة ويكررها): شعار الجهة أو اسمها ولونها في جهة، واسم الباب الحالي في الأخرى
// يكتبه pdf.js لكل صفحة (chapterAt) كما تفعل string(chapter) في الطباعة. الوثيقة بلا جهة تأخذ علامة Milestone Impact مكان الجهة.
// خارج .sheet فلا تدخل في حساب الصفحات، وتُرسم بالخطوط والصور نفسها
function runningHead(meta) {
  const b = meta.brand;
  const logo = b && safeLogo(b.logo);
  const color = (b && brandColor(b.color)) || C.gold;
  const org = b ? (logo ? `<img src="${esc(logo)}" alt="">` : `<b>${esc(b.name || 'مبادرة مجتمعية')}</b>`) : '';
  return `<div id="pdf-head" style="position:absolute;top:0;left:0;width:794px;height:${mmPx(PAGE_MM.top)}px;background:#fff;direction:rtl;display:flex;align-items:center;gap:10px;padding:14px ${mmPx(PAGE_MM.side)}px 0;font:400 ${TYPE_SCALE.footer}pt 'Noto Kufi Arabic',sans-serif;color:${C.muted}">
<span class="ph-org" style="display:flex;align-items:center;gap:8px;max-width:45%;white-space:nowrap;overflow:hidden">${org ? `<span style="display:flex;align-items:center;height:6mm">${org}</span>` : ''}</span><span style="display:flex;align-items:center;direction:ltr;margin-right:auto" class="ph-mi">${LOGO}</span>
<i style="position:absolute;bottom:12px;left:${mmPx(PAGE_MM.side)}px;right:${mmPx(PAGE_MM.side)}px;height:1px;background:${color};opacity:.7"></i>
</div><style>#pdf-head .ph-org img{height:6mm;max-width:40mm;object-fit:contain;display:block}#pdf-head b{font-weight:400;color:${C.graphite}}#pdf-head .ph-mi svg{height:4mm;width:auto;display:block}</style>`;
}

// يفتح الوثيقة في نافذة مستقلة بشريط «طباعة أو حفظ PDF». يعيد false إن حُجبت النافذة.
// الأزرار تُربط من هنا لا بسكربت داخل الوثيقة: سياسة CSP في المنصات تمنع السكربت المضمّن.
export const openDocument = (meta, body) => writeDocument(window.open('', '_blank'), meta, body);

// يكتب الوثيقة في نافذة مفتوحة سلفًا: تُفتح النافذة عند النقر مباشرة ثم تُملأ
// بعد تحميل المحرك، وإلا عدّها المتصفح نافذة منبثقة غير مطلوبة وحجبها.
// opts.pdf: مصدر تذكرة لهذه الوثيقة وحدها بدل مصدر التطبيق
export function writeDocument(win, meta, body, opts = {}) {
  if (!win) return false;
  // الشعار يُقاس من الصورة نفسها مرة ثم تُكتب الوثيقة بفئته ولوحته (ينتظر أول مرة فقط)
  const first = documentHtml(meta, body);
  if (logosPending(first)) primeLogos(first).then(() => fill(win, meta, body, opts, documentHtml(meta, body)));
  else fill(win, meta, body, opts, first);
  return true;
}

function fill(win, meta, body, opts, html) {
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.querySelector('[data-act="print"]')?.addEventListener('click', () => win.print());
  // «تحميل PDF»: من الخادم حين تتاح تذكرة، وإلا يُبنى في نافذة المنصة (pdf.js downloadBest)، ويُحفظ من النافذة نفسها، والزر يعرض تقدمه
  const pdfBtn = win.document.querySelector('[data-act="pdf"]');
  pdfBtn?.addEventListener('click', async () => {
    if (pdfBtn.disabled) return;
    pdfBtn.disabled = true;
    const label = pdfBtn.textContent;
    try {
      // مصدر التذكرة يسجله كل تطبيق عند إقلاعه (pdf-source.js)، فيكسب كل مستعمل لـwriteDocument الملف المتجهي بلا تغيير في شاشته
      const [{ downloadBest }, server] = await Promise.all([import('./pdf.js'), pdfServer(opts.pdf)]);
      await downloadBest(meta, body, { server, onProgress: (t) => { pdfBtn.textContent = t; } });
      pdfBtn.textContent = 'حُفظ الملف';
    } catch (e) {
      console.error(e);
      pdfBtn.textContent = 'تعذّر التحميل، استعمل «طباعة»';
    } finally {
      setTimeout(() => { pdfBtn.textContent = label; pdfBtn.disabled = false; }, 2500);
    }
  });
  win.document.querySelector('[data-act="close"]')?.addEventListener('click', () => win.close());
}
