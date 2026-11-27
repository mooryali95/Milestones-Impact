// ════════════════════════════════════════════════════════════════
// النسخة المؤسسية: وثيقة المبادرة لصاحب القرار، خارج المنصة
// ════════════════════════════════════════════════════════════════
// منتج واحد اسمه وحجمه من مسار المشارك (قرار المالك 2026-11-25، doc-form.js): «بطاقة المبادرة» (3 إلى 5 صفحات: بطاقة
// في صفحة وخطة أول 90 يومًا)، «ميثاق المبادرة» (8 إلى 12)، «حالة العمل» (18 إلى 25). الشكل يُحل لحظة العرض ولا يُخزَّن إلا
// مجمّدًا في لقطة الاعتماد. داخل الوثيقة يبقى كل فصل بعمق مستوى إطاره (الحقول كما فتحها الخادم)، فلا مستوى عام يُطبع.
// تُبنى من القيم الصالحة وحدها (doc-quality.js cleanDoc): الفارغ والتالف يُحذفان بصمت ويُعاد ترقيم الأبواب.
// الترتيب: غلاف صفحة كاملة، ثم صفحة القرار التنفيذية من الحقول القائمة، ثم أبواب الشكل، ثم الاعتماد ببصمة ورمز تحقق.
// المصدر واحد: وثيقة الخادم (capstone.doc أو لقطة الاعتماد)؛ ملف العمل الكامل من المصدر نفسه في capstone.js capstoneReport.
// المسودة الحية تُعلَّم بتاريخ بنائها وبصمتها، والمعتمدة بتاريخ اعتمادها وبصمتها المجمّدة ورابط تحققها.
import { footerLine, qrSvg, verifyMark, verifyUrl, VERIFY_STYLE } from './verify-mark.js';
import { contrastRatio, controlStrip, C, esc, isRaw, kpis, raw, section, LIVE_RING, structuralAccent } from './doc.js';
// تاريخ ISO لشريط الضبط (YYYY-MM-DD)، وفارغ لتاريخ غير صالح فلا يُكتب في الشريط
import { cleanDoc, docFingerprint, fingerprint, institutionalGate } from '../../../supabase/functions/leaders-api/doc-quality.js';
import { benefitsOf, charterData, durationAr, launchPlan } from '../../../supabase/functions/leaders-api/business-case.js';
import { BUDGET_PLAIN_AR, BUDGET_TOTAL_AR, DOC_DOORS_AR, budgetTotalPctAr, decisionDeadlineAr, decisionSentenceAr, DOC_DECISION_AR, fromToAr, CONFIDENTIAL_AR, DOC_APPROVED_AR, DOC_LIVE_AR, DOC_RIGHTS_AR, DOC_SIGN_AR, DOC_VERIFY_AR, DOC_QR_EXPORT_AR, DOC_SEND_STAMP_AR, DOC_TEXT, docBlockedAr, docClosingApprovedAr, docClosingLiveAr } from '../../../supabase/functions/leaders-api/labels.js';
import { formOfDoc } from '../../../supabase/functions/leaders-api/doc-form.js';
import { FORMS } from '../../../supabase/functions/leaders-api/document-forms.js';
import { termsAt, trackManifest } from '../../../supabase/functions/leaders-api/track-manifest.js';
import { capstoneReport, heatmap, levelAnnex, levelAnnexEmpty, pdfFileName, paras, STYLE, tableOf, withoutReadiness } from './capstone.js';
import { dateAr, parseNumber, RISK_HIGH, RISK_MID } from '../../../supabase/functions/leaders-api/capstone.js';
import { costBarsSvg, ganttLegend, ganttSvg, scheduleModel } from './visuals.js';
import { SITES } from '../../../supabase/functions/_shared/sites.js';
import { caseQuestions, doorQuestion } from './decision-questions.js';

const TZ = 'Asia/Riyadh';
export const isoDay = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric' }) : null);
const fmtAt = (d) => (d ? new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);
const money = (n) => `${Math.round(n).toLocaleString('en-US')} ريال`;

// ── النظام الطباعي (قرار المالك 2026-11-25): متن 10.5pt بوزن 400، والجداول 9pt على الأقل، ولا وزن 200 أو 300 في الطباعة،
// وبطاقات بدل الجداول العريضة (المنافع والمخاطر). لون البنية (--acc) لون الجهة أو الدفعة بعد فحص التباين، وإلا الذهبي ──
const IN_STYLE = `<style>
body { font-weight: 400; }
.mast.co h1, .mast.co .sub { font-weight: 400; }
.in-sec { margin-top: 12mm; padding-top: 0; }
.in-sec:first-child { margin-top: 0; }
.in-sec p, .in-sec li { orphans: 3; widows: 3; }
.in-sec.np { break-before: page; }
.in-open { display: grid; grid-template-columns: 20mm 1fr; align-items: end; gap: 4mm; padding-bottom: 4mm; margin: 0 0 6mm; border-top: 0.6mm solid #0B272F; padding-top: 5mm; border-bottom: 1px solid var(--acc); break-after: avoid; break-inside: avoid; }
.in-open + * { break-before: avoid; }
.in-open .n { font: 400 28pt/0.9 "Noto Sans", sans-serif; color: var(--acc); letter-spacing: -.02em; padding-inline-end: 3mm; border-inline-end: 0.4mm solid var(--acc); }
.in-open .eyebrow { margin-bottom: 1mm; letter-spacing: .18em; font-size: 7.5pt; color: #5F7176; text-transform: none; }
.in-open h2 { margin: 0; font-weight: 600; font-size: 18pt; line-height: 1.3; color: #0B272F; }
.in-open p { margin: 1.5mm 0 0; font-size: 9pt; color: #5F7176; line-height: 1.7; }
.in-open p.ask { font-size: 11pt; color: #0B272F; padding-inline-start: 3mm; border-inline-start: 2pt solid var(--acc); }
/* المرحلة 29: حالة العمل كل باب في صفحة؛ الميثاق انسياب متصل، وحاجز 60 مم غير مرئي قبل الفاتحة يمنع بدء باب في أسفل صفحة */
.in-keep { display: block; height: 60mm; margin-bottom: -60mm; break-inside: avoid; visibility: hidden; }
.num { white-space: nowrap; unicode-bidi: isolate; }
.in-contents-list { list-style: none; margin: 4mm 0 0; padding: 0; }
.in-contents-list li { display: flex; align-items: baseline; gap: 3mm; padding: 2.6mm 0; border-bottom: 1px solid #DCE2E1; font-size: 11pt; color: #0B272F; break-inside: avoid; }
.in-contents-list a { color: inherit; text-decoration: none; display: flex; gap: 4mm; flex: 1; }
.in-contents-list .n { font: 400 10pt "Noto Sans", sans-serif; color: var(--acc-text); min-width: 8mm; }
.in-contents-list .cp-pgno { font: 400 10pt "Noto Sans", sans-serif; color: #5F7176; }
.in-toc { margin-top: 6mm; padding-top: 2.5mm; border-top: 1px solid #DCE2E1; break-inside: avoid; }
.in-toc span { font-size: 8pt; font-weight: 600; color: #8A6424; margin-inline-end: 2mm; }
.in-toc ol { display: inline; list-style: none; margin: 0; padding: 0; }
.in-toc li { display: inline; font-size: 8pt; color: #2C4148; }
.in-toc li + li::before { content: ' · '; color: #8A979A; }
.in-toc a { color: inherit; text-decoration: none; }
.in-toc .cp-pgno { min-width: 0 !important; margin-inline-start: 1mm; }
.in-toc .cp-pgno:empty { display: none !important; }
.in-sec h3, .in-sec .cp-f > b { break-after: avoid; }
.in-sec .cp-p { font-size: 10.5pt; line-height: 1.85; color: #22383F; }
.in-sec .cp-f { margin: 0 0 6mm; break-inside: auto; }
.in-sec .cp-f > b { display: block; font-weight: 500; font-size: 10pt; color: #0B272F; margin-bottom: 2mm; padding-inline-start: 3mm; border-inline-start: 0.6mm solid var(--acc); }
.in-sec .tbl { font-size: 9pt; }
.in-sec .tbl th { color: #0B272F; font-weight: 500; font-size: 9pt; background: #F7F8F6; border-bottom: 1px solid #0B272F; padding: 2.4mm 2mm; white-space: normal; }
.in-sec .tbl td { padding: 2.4mm 2mm; }
.in-sec .tbl tr, .in-sec .tbl td { break-inside: avoid; }
.in-sec .kpis { background: #F7F8F6; border-top: 0; border-bottom: 0; margin: 0 0 6mm; break-inside: avoid; }
.in-sec .kpi { padding: 4mm 5mm 4mm 0; padding-inline-start: 5mm; }
.in-sec .kpi b { font: 400 20pt/1.15 "Noto Sans", sans-serif; color: #0B272F; overflow-wrap: anywhere; }
.in-sec .kpi span { margin-top: 1mm; font-size: 9pt; color: #5F7176; }
.in-lead { font-size: 11pt; line-height: 1.9; color: #0B272F; font-weight: 400; margin: 0 0 6mm; padding: 1mm 0; border-inline-start: 0.6mm solid var(--acc); padding-inline-start: 6mm; break-inside: avoid; }
.in-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 9mm; margin: 0 0 6mm; }
.in-grid > div { border-top: 1px solid #DCE2E1; padding-top: 2.5mm; break-inside: avoid; }
.in-grid > div span { display: block; font-size: 8.5pt; font-weight: 600; color: #8A6424; }
.in-grid > div p { margin: .8mm 0 0; font-size: 10.5pt; line-height: 1.75; color: #22383F; }
.in-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 0 0 6mm; }
.in-card { border: 1px solid #DCE2E1; border-top: 0.6mm solid var(--acc); padding: 3.5mm 4mm; break-inside: avoid; }
.in-card b { display: block; font-weight: 500; font-size: 10.5pt; color: #0B272F; line-height: 1.5; }
.in-card p { margin: 1.5mm 0 0; font-size: 9.5pt; line-height: 1.7; color: #2C4148; }
.in-card small { display: block; margin-top: 1.5mm; font-size: 9pt; color: #5F7176; }
.in-card .sc { float: left; font: 500 9pt "Noto Sans", sans-serif; border: 1px solid #DCE2E1; padding: 0 2mm; color: #2C4148; }
.in-card .sc.hi { background: #E1BE85; border-color: #E1BE85; color: #0B272F; } .in-card .sc.md { background: #F2E6D0; border-color: #F2E6D0; }
/* صفحة القرار: تبدأ بعد الغلاف وتملأ صفحتها وحدها */
.in-dec { break-after: page; }
.in-dec .in-cards { grid-template-columns: repeat(3, 1fr); gap: 3mm; }
.in-dec .in-card p { font-size: 9pt; }
.in-dec .in-grid { margin-bottom: 4mm; }
.in-dec .q { border: 1px solid #DCE2E1; border-inline-start: 1.2mm solid var(--acc); padding: 4mm 5mm; margin: 0 0 5mm; background: #F7F8F6; }
.in-dec .q span { display: block; font-size: 9pt; font-weight: 500; color: #8A6424; letter-spacing: .02em; }
.in-dec .q p { margin: 1.5mm 0 0; font-size: 12.5pt; line-height: 1.75; font-weight: 500; color: #0B272F; }
.in-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 4mm 0 0; }
.in-strip > div { border-top: 0.6mm solid var(--acc); padding-top: 2mm; }
.in-strip span { display: block; font-size: 9pt; color: #2C4148; font-weight: 400; }
.in-strip b { display: block; font-size: 11pt; font-weight: 500; color: #0B272F; }
.in-dec .q .in-choices { font-size: 10pt; font-weight: 500; margin: 4mm 0 0; color: #0B272F; }
.in-dec .in-due { display: block; margin-top: 1.5mm; font-size: 9pt; color: #2C4148; }
.in-dec .in-card i { font-style: normal; font-weight: 500; }
.in-dec h3 { font-size: 10.5pt; font-weight: 500; margin: 6mm 0 2.5mm; color: #0B272F; }
.in-lean { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 0 0 6mm; }
.in-lean > div { border: 1px solid #DCE2E1; padding: 3mm 3.5mm; break-inside: avoid; min-height: 30mm; }
.in-lean > div.w2 { grid-column: span 2; }
.in-lean span { display: block; font-size: 8.5pt; font-weight: 600; color: var(--acc-text, #8A6424); margin-bottom: 1mm; }
.in-lean p { margin: 0; font-size: 9.5pt; line-height: 1.7; color: #22383F; white-space: pre-line; }
.in-90 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin: 0 0 6mm; }
.in-90 > div { border-top: 0.6mm solid var(--acc); padding-top: 3mm; break-inside: avoid; }
.in-90 h3 { margin: 0; font-size: 10.5pt; font-weight: 500; } .in-90 small { color: #5F7176; font-size: 9pt; }
.in-90 ul { margin: 2mm 0 0; padding-inline-start: 4mm; font-size: 9.5pt; line-height: 1.75; }
.in-approve { border: 1px solid #DCE2E1; border-top: 0.6mm solid #0B272F; padding: 7mm 7mm 6mm; break-inside: avoid; }
.in-approve .st { display: inline-block; border: 1px solid var(--acc); color: #0B272F; padding: 1.2mm 5mm; font-size: 10pt; font-weight: 500; margin-bottom: 6mm; }
.in-approve .st.live { border-style: dashed; color: #5F7176; }
.in-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
.in-sign > div { padding-top: 14mm; border-bottom: 1px solid #0B272F; padding-bottom: 2mm; break-inside: avoid; }
.in-sign span { display: block; font-size: 9pt; color: #8A6424; }
.in-sign b { font-weight: 500; font-size: 10pt; color: #0B272F; }
.in-sign small { display: block; font-size: 9pt; color: #2C4148; margin-top: 1mm; }
.in-fp { display: flex; justify-content: space-between; gap: 6mm; margin-top: 7mm; padding-top: 3mm; border-top: 1px solid #DCE2E1; font: 400 8.5pt "Noto Sans", sans-serif; letter-spacing: .08em; color: #5F7176; direction: ltr; }
.in-fp b { font-weight: 500; color: #0B272F; }
.in-verify { display: flex; align-items: center; gap: 6mm; margin-top: 6mm; break-inside: avoid; }
.in-verify .qr { width: 26mm; height: 26mm; flex: none; }
.in-verify p { margin: 0; font-size: 9.5pt; line-height: 1.7; color: #2C4148; }
.in-verify a { color: #0B272F; font: 400 8.5pt "Noto Sans", sans-serif; direction: ltr; unicode-bidi: isolate; word-break: break-all; }
.in-verify .ring { width: 18mm; height: 18mm; margin-inline-start: auto; flex: none; }
.in-contents + .in-sec { break-before: page; }
.in-approve-h { margin: 0 0 5mm; font-size: 11pt; font-weight: 500; color: #0B272F; }
.in-approve.send { padding-top: 5mm; }
.in-sign > div.blank { padding-top: 0; border-bottom: 0; padding-bottom: 0; }
.in-sign .blank ul { list-style: none; margin: 3mm 0 0; padding: 0; display: grid; gap: 5mm; }
.in-sign .blank li { font-size: 8.5pt; color: #5F7176; padding-top: 6mm; border-bottom: 1px solid #0B272F; padding-bottom: 1mm; }
.in-benefits { width: 100%; }
.in-chart text { font-family: "Noto Kufi Arabic", "Noto Sans", sans-serif; }
</style>`;

// المرحلة 30 (إكمال): بطاقة المبادرة ضمن 3 إلى 5 صفحات (الغلاف، القرار، البطاقة وخطة 90 يومًا، الاعتماد).
// تكثيف للبطاقة وحدها بلا حذف محتوى ولا نزول عن السلم الطباعي (متن 10.5pt، وجداول 9pt): أبواب متصلة بفاصل أقصر،
// وخلايا البطاقة بقدر محتواها، وصفحة القرار بمسافات أضيق لتبقى صفحة واحدة
export const LEAN_STYLE = `<style>
.in-lean-doc .in-sec { margin-top: 8mm; }
.in-lean-doc .in-sec:first-child { margin-top: 0; }
.in-lean-doc .in-open { margin-bottom: 4mm; padding-top: 3.5mm; padding-bottom: 3mm; }
.in-lean-doc .in-lean { grid-template-columns: 1fr 1fr; grid-auto-flow: row; gap: 2.5mm; margin-bottom: 4mm; }
.in-lean-doc .in-lean > div { min-height: 0; padding: 2.5mm 3mm; }
.in-lean-doc .in-lean p { line-height: 1.6; }
.in-lean-doc .in-lead { margin-bottom: 4mm; }
.in-lean-doc .in-90 { margin-bottom: 4mm; }
.in-lean-doc .in-dec .q { padding: 3mm 4mm; margin-bottom: 4mm; }
.in-lean-doc .in-dec .in-grid { gap: 3mm 8mm; margin-bottom: 3mm; }
.in-lean-doc .in-dec h3 { margin: 2mm 0 2mm; }
.in-lean-doc .in-dec .in-cards { margin-bottom: 3mm; }
.in-lean-doc .in-dec .q p { font-size: 11pt; line-height: 1.6; }
.in-lean-doc .in-dec .in-strip { margin-top: 2.5mm; }
.in-lean-doc .in-dec .q .in-choices { margin-top: 2.5mm; }
.in-lean-doc .in-dec .in-grid p { line-height: 1.65; margin-top: .4mm; }
.in-lean-doc .in-dec .in-card { padding: 2.5mm 3mm; }
.in-lean-doc .in-dec .in-card p { line-height: 1.55; }
.in-lean-doc .in-dec .in-grid > div { padding-top: 1.5mm; }
.in-lean-doc .in-dec > .in-open p { margin-top: 1mm; }
</style>`;

export { fingerprint };

// الأرقام في خلايا الجداول لا تنكسر بين سطرين («480,000» لا «480,00 / 0»): كل رقم في نص خلية يُلف بـ bdi.num
export const nowrapNumbers = (html) => String(html).replace(/(<td\b[^>]*>)([\s\S]*?)(<\/td>)/g, (_, a, inner, z) => a + inner.replace(/(^|>)([^<]+)/g, (__, g, t) => g + t.replace(/(?<![#\w&])(?:\d[\d,٬.]*\d%?|\d%?)(?![\w;])/g, (n) => `<bdi class="num">${n}</bdi>`)) + z);

const sec = (doc, k) => (doc.sections || []).find((s) => s.key === k) || null;
const fld = (doc, k, f) => (sec(doc, k)?.fields || []).find((x) => x.key === f) || null;
const val = (doc, k, f) => fld(doc, k, f)?.value ?? null;
const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

// حقل صالح بعنوانه، أو لا شيء
// نسخة الإرسال: رؤوس الأعمدة بصيغة اسمية (لا قوس شارح ولا جملة تعليمات)، يضبطها institutionalReport لمدة البناء
let SEND_HEADS = false;
export const sendHead = (h) => { const t = String(h ?? '').trim(); return DOC_TEXT.send.headers[t] || t.replace(/\s*\([^)]*\)\s*$/, '').trim() || t; };
function field(doc, k, f, label) {
  const x = fld(doc, k, f);
  if (!x || !has(x.value)) return '';
  const title = esc(label || x.label);
  const heads = x.labels || x.columns;
  if (x.type === 'table') return `<div class="cp-f"><b>${title}</b>${tableOf(SEND_HEADS && Array.isArray(heads) ? heads.map(sendHead) : heads, x.value)}</div>`;
  if (x.type === 'select') return `<div class="cp-f"><b>${title}</b><span class="tag gold">${esc(x.value)}</span></div>`;
  return `<div class="cp-f"><b>${title}</b>${paras(x.value)}</div>`;
}
const grid = (pairs) => {
  const ok = pairs.filter(([, v]) => has(v));
  return ok.length ? `<div class="in-grid">${ok.map(([k, v]) => `<div><span>${esc(k)}</span><p>${isRaw(v) ? v.html : esc(v)}</p></div>`).join('')}</div>` : '';
};

// ── المخاطر مرتبة بالدرجة (الاحتمال × الأثر)، أعلاها أولًا، من سجل المخاطر كما كُتب ──
function risksOf(doc, limit = 3) {
  const f = fld(doc, 'raid', 'items');
  if (!f || !Array.isArray(f.value)) return [];
  const col = (...w) => (f.columns || []).findIndex((c) => w.some((x) => String(c).includes(x)));
  const p = col('الاحتمال'), i = col('الأثر'), d = col('الوصف'), o = col('المالك'), r = col('الاستجابة'), t = col('النوع');
  const cell = (row, k) => (k >= 0 ? String(row[k] ?? '').trim() : '');
  // الافتراض ليس خطرًا: يُعرض في بابه (assumptionsOf)، فلا يتكرر في سجل المخاطر ولا في صفحة القرار
  return f.value.filter((row) => Array.isArray(row) && row.some((c) => String(c ?? '').trim()) && cell(row, t) !== DOC_DOORS_AR.assumptionType)
    .map((row) => ({ title: cell(row, d) || cell(row, 0), owner: cell(row, o), response: cell(row, r), score: (parseNumber(cell(row, p)) || 0) * (parseNumber(cell(row, i)) || 0) }))
    .filter((x) => x.title)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
// ── الافتراضات (المرحلة 29): بنود سجل RAID التي نوعها «افتراض» كما كُتبت، بمالكها وطريقة التحقق منها ──
export function assumptionsOf(doc) {
  const f = fld(doc, 'raid', 'items');
  if (!f || !Array.isArray(f.value)) return [];
  const col = (w) => (f.columns || []).findIndex((c) => String(c).includes(w));
  const t = col('النوع'), d = col('الوصف'), o = col('المالك'), r = col('الاستجابة');
  if (t < 0) return [];
  const cell = (row, k) => (k >= 0 ? String(row[k] ?? '').trim() : '');
  return f.value.filter((row) => Array.isArray(row) && cell(row, t) === DOC_DOORS_AR.assumptionType)
    .map((row) => ({ title: cell(row, d), owner: cell(row, o), response: cell(row, r) })).filter((x) => x.title);
}
const assumptionCards = (list, send = false) => (list.length ? `<div class="cp-f"><b>${esc(DOC_DOORS_AR.assumptions)}</b>${send ? '' : `<p class="cp-p">${esc(DOC_DOORS_AR.assumptionsNote)}</p>`}<div class="in-cards">${list.map((x) => `<div class="in-card"><b>${esc(x.title)}</b>${x.response ? `<p>${esc(x.response)}</p>` : ''}${x.owner ? `<small>${esc(DOC_DOORS_AR.owner)}: ${esc(x.owner)}</small>` : ''}</div>`).join('')}</div></div>` : '');

// ── القيود: في نسخة الإرسال لا يتكرر وسم الحقل في أول قيمته («القيد: ...»)، ويُفصل «الافتراض الأكبر» حقلًا مستقلًا ──
export function constraintsOf(v, send = false) {
  if (!send || !has(v)) return [['القيود', v]];
  const t = String(v).trim().replace(/^\s*القيود?\s*[:：]\s*/, '');
  const k = DOC_TEXT.send.keyAssumption;
  const at = t.search(new RegExp(`${k}\\s*[:：]`));
  if (at < 0) return [['القيود', t]];
  return [['القيود', t.slice(0, at).trim()], [k, t.slice(at).replace(new RegExp(`^${k}\\s*[:：]\\s*`), '').trim()]];
}

// ── كلفة عدم القرار: من بديل «عدم التدخل» أو «الوضع الحالي» في جدول البدائل إن كتبه القائد، وإلا لا خانة ──
export const STATUS_QUO = /^\s*(عدم التدخل|عدم القرار|الوضع الحالي|بلا تدخل|لا شيء|الإبقاء)/;
function statusQuoCost(doc) {
  const f = fld(doc, 'options-analysis', 'options');
  if (!f || !Array.isArray(f.value)) return null;
  const row = f.value.find((r) => Array.isArray(r) && STATUS_QUO.test(String(r[0] ?? '')));
  const rest = row ? row.slice(1).map((c) => String(c ?? '').trim()).filter(Boolean) : [];
  return rest.length ? rest.join('، ') : null;
}
const riskCards = (list, labelled = false) => (list.length ? `<div class="in-cards">${list.map((x) => `<div class="in-card">${x.score ? `<span class="sc ${x.score >= RISK_HIGH ? 'hi' : x.score >= RISK_MID ? 'md' : ''}">${x.score}</span>` : ''}<b>${esc(x.title)}</b>${x.response ? `<p>${labelled ? `<i>${esc(DOC_DECISION_AR.response)}:</i> ` : ''}${esc(x.response)}</p>` : ''}${x.owner ? `<small>المالك: ${esc(x.owner)}</small>` : ''}</div>`).join('')}</div>` : '');
const benefitCards = (list) => (list.length ? `<div class="in-cards">${list.map((x) => `<div class="in-card"><b>${esc(x.title)}</b>${x.indicator ? `<p>${esc(x.indicator)}</p>` : ''}${x.baseline || x.target ? `<p>${fromToAr(x.baseline && `<bdi>${esc(x.baseline)}</bdi>`, x.target && `<bdi>${esc(x.target)}</bdi>`)}</p>` : ''}${x.owner ? `<small>المالك: ${esc(x.owner)}</small>` : ''}</div>`).join('')}</div>` : '');

// ── رسم المنافع: خط الأساس مقابل المستهدف لكل منفعة رقمية الطرفين، بمقياس كل منفعة (لا محور مشترك بين وحدات مختلفة) ──
// أول جملة من مصدر التمويل: يقطع عند الفاصلة العربية أو نقطة تنهي جملة فقط (لا يقطع 1.5)، وإن فرغ فالنص مقصوصًا
export const fundingHead = (funding) => {
  const t = String(funding ?? '').trim();
  const head = t.split(/،|\.(?=\s|$)|[؟!](?=\s|$)/)[0].trim();
  return head || (t.length > 60 ? `${t.slice(0, 60)}…` : t);
};

// موعد القرار يُعرض فقط إن كان بعد تاريخ إصدار الوثيقة؛ الموعد الفائت يضلل صاحب القرار
export const isFutureDeadline = (start, issuedAt) => {
  if (!start) return false;
  const t = new Date(start).getTime();
  return Number.isFinite(t) && t > new Date(issuedAt || Date.now()).getTime();
};

export function benefitsChart(doc) {
  const rows = benefitsOf(doc, 6).map((b) => ({ ...b, a: parseNumber(b.baseline), z: parseNumber(b.target) }))
    .filter((b) => Number.isFinite(b.a) && Number.isFinite(b.z) && (b.a || b.z));
  if (rows.length < 1) return '';
  // الرسم بعرض النص كاملًا وباتجاه ثابت (ltr) فلا يقلب اتجاه الصفحة مراسيه: اسم المنفعة في عمود يمين الزوج، والأعمدة تمتد
  // من حده يسارًا، والقيمة خارج طرف العمود في عمود خاص بها (عزل اتجاه)، فلا يغطي نص عمودًا ولا يقع اسم خارج الرسم
  const W = 1000, rowH = 62, label = 340, gap = 16, vw = 130, H = rows.length * rowH + 8;
  const right = W - label - gap, span = right - vw;
  let g = '';
  rows.forEach((b, i) => {
    const y = 6 + i * rowH, max = Math.max(Math.abs(b.a), Math.abs(b.z)) || 1;
    const wa = Math.max(2, (Math.abs(b.a) / max) * span), wz = Math.max(2, (Math.abs(b.z) / max) * span);
    const t = b.title.length > 30 ? `${b.title.slice(0, 29)}…` : b.title;
    g += `<g class="bn-row" data-row="${i}"><text class="bn-name" x="${W}" y="${y + 29}" text-anchor="end" font-size="20" fill="#0B272F">${esc(t)}</text>
<rect class="bn-bar" x="${(right - wa).toFixed(1)}" y="${y + 6}" width="${wa.toFixed(1)}" height="18" fill="#DCE2E1"/><text class="bn-val" x="${(right - wa - 10).toFixed(1)}" y="${y + 21}" text-anchor="end" direction="ltr" unicode-bidi="isolate" font-size="16" fill="#5F7176">${esc(b.baseline)}</text>
<rect class="bn-bar" x="${(right - wz).toFixed(1)}" y="${y + 30}" width="${wz.toFixed(1)}" height="18" fill="var(--acc)"/><text class="bn-val" x="${(right - wz - 10).toFixed(1)}" y="${y + 45}" text-anchor="end" direction="ltr" unicode-bidi="isolate" font-size="16" fill="#0B272F">${esc(b.target)}</text></g>`;
  });
  return `<figure class="cp-fig in-chart in-benefits"><svg viewBox="0 0 ${W} ${H}" width="100%" direction="ltr" style="display:block;width:100%;height:auto;direction:ltr" role="img" aria-label="المنافع: خط الأساس مقابل المستهدف">${g}</svg>
<div class="mi-legend"><span class="mi-lg"><i style="background:#DCE2E1"></i>${esc(DOC_TEXT.send.legendBase)}</span><span class="mi-lg"><i style="background:var(--acc)"></i>${esc(DOC_TEXT.send.legendTarget)}</span></div></figure>`;
}

// رمز التحقق ورابطه من مصدرهما الواحد (verify-mark.js، المرحلة 32)
export { qrSvg, verifyUrl };

/** هوية الوثيقة: الجهة في الصدارة، والدفعة (اسم برنامجها وشعاره ولونها) توقيعًا، ولون البنية بعد فحص التباين */
// لون البنية نصًا صغيرًا (تسميات .in-lean): يحتاج 4.5:1 على الأبيض لا 3:1، وإلا الذهبي النصي
export const TEXT_MIN_CONTRAST = 4.5;
export const accentText = (accent) => (accent && contrastRatio(accent) >= TEXT_MIN_CONTRAST ? accent : C.goldText);

export function identityOf(m) {
  const org = m.org || null;
  const co = m.cohort_brand || null;
  const accent = structuralAccent(org?.color, co?.color);
  return {
    brand: { name: org?.name || null, logo: org?.logo || null, color: org?.color || co?.color || null, program: co?.program || null, programLogo: co?.logo || null },
    accent: accent.color,
  };
}

/**
 * النسخة المؤسسية من وثيقة الخادم (docFor أو لقطة الاعتماد).
 * يعيد { blocked: true, missing } إن لم تكتمل الأسئلة العشرة، وإلا { meta, body, fingerprint, form }
 */
export function institutionalReport(input, options = {}) {
  const opt = docOptions(options, 'institutional');
  // نسخة الإرسال (finalDocument): لا تحمل لغة المسودة الداخلية؛ ختمها الوحيد DOC_SEND_STAMP_AR
  const send = options?.send === true;
  SEND_HEADS = send;
  try { return institutionalBody(input, options, opt, send); } finally { SEND_HEADS = false; }
}
function institutionalBody(input, options, opt, send) {
  // المعتمدة: محتواها النظيف وبصمتها وشكلها مجمّدة في اللقطة لحظة الاعتماد (capstone.ts approve: snapshot.issued)،
  // فلا يغيّر تعديل لاحق ولا تحسين في قواعد الجودة ولا تغيّر مسار المشارك وثيقةً صدرت. غير المعتمدة تُبنى لحظة العرض
  const frozen = input?.meta?.status === 'approved' && input?.issued?.sections ? input.issued : null;
  const doc = frozen ? { ...input, sections: frozen.sections, cost: frozen.cost ?? input.cost, summary: frozen.summary ?? input.summary, meta: { ...input.meta, ...(frozen.meta || {}) } } : cleanDoc(input, { strict: true }).doc;
  const gate = institutionalGate(doc);
  if (!gate.ok) return { blocked: true, missing: gate.missing };
  const m = doc.meta || {};
  const form = formOfDoc(frozen ? input : doc);
  const approved = m.status === 'approved';
  const fp = docFingerprint(input);
  const cost = doc.cost?.withContingency > 0 ? doc.cost : null;
  const c = charterData(doc);
  const duration = durationAr(m.start, m.end);
  const durationHtml = duration && raw([m.start && `من ${esc(dateAr(m.start))}`, m.end && `${m.start ? 'إلى' : 'حتى'} ${esc(dateAr(m.end))}`].filter(Boolean).join(' '));
  const funding = val(doc, 'cost-plan', 'funding');
  const parts = [];
  const add = (en, ar, body, note) => { if (body && body.replace(/<[^>]+>/g, '').trim()) parts.push([en, ar, body, note]); };
  const lean = form.key === 'card', full = form.key === 'case';
  const limits = (FORMS[form.key] || FORMS.charter).limits;
  const benefits = benefitsOf(doc, limits.benefits);
  // وسم المبلغ بعد الاحتياطي في كل موضع من النسخة المؤسسية (المرحلة 26)
  const budgetLabel = cost?.contingency ? BUDGET_TOTAL_AR : BUDGET_PLAIN_AR;
  // حالة العمل تُبنى على أسئلة صاحب القرار (slices.json، بمستوى المشارك في الأثر): كل باب يفتح بسؤاله، فيقرأ صاحب القرار
  // الحالات الخمس (الاستراتيجية والاقتصادية والتجارية والمالية والإدارية) في أبوابها. بلا مسار معروف: أسئلة الاحترافي
  const man = full ? trackManifest(m.track_key || null, m.priority || null) : null;
  const ask5 = full ? caseQuestions(m) : {};
  // فاتحة الباب في حالة العمل: سؤال صاحب القرار من decision-questions.json (ومنه باب الأثر)، والميثاق بلا أسئلة
  const askOf = (en) => (full ? doorQuestion(en, ask5) : null);
  const viz = scheduleModel(doc);
  const g = viz ? ganttSvg(viz, { today: null }) : null;
  const ganttFig = g?.svg ? `<figure class="cp-fig">${g.svg}${ganttLegend()}<figcaption>المخطط الزمني؛ الذهبي على المسار الحرج</figcaption></figure>` : '';
  const costKpis = cost ? kpis(cost.contingency ? [{ value: Math.round(cost.total).toLocaleString('en-US'), label: 'التكلفة التقديرية (ريال)' }, { value: `${cost.contingency}%`, label: 'الاحتياطي' }, { value: Math.round(cost.withContingency).toLocaleString('en-US'), label: `${budgetLabel} (ريال)` }] : [{ value: Math.round(cost.total).toLocaleString('en-US'), label: `${budgetLabel} (ريال)` }]) : '';
  const cb = costBarsSvg(doc);
  const costFig = cb?.svg ? `<figure class="cp-fig in-chart">${cb.svg}<figcaption>التكلفة بحسب الحزمة</figcaption></figure>` : '';

  // ── صفحة القرار التنفيذية (المرحلة 26): من الحقول القائمة وحدها (لا مصدر جديد)، ونصوصها من labels.js ──
  const D = DOC_DECISION_AR;
  const ask = cost ? `${budgetLabel}: ${money(cost.withContingency)}${duration ? `، على مدة ${duration}` : ''}${funding ? `، من ${funding}` : ''}` : duration ? `${D.duration}: ${duration}` : null;
  const recommendation = val(doc, 'options-analysis', 'recommendation') || val(doc, 'initiative-charter', 'objective');
  const decisionStrip = [
    cost && [cost.contingency ? budgetTotalPctAr(cost.contingency) : BUDGET_PLAIN_AR, money(cost.withContingency)],
    duration && [D.duration, durationHtml || duration],
    // الشريط مختصر: أول جملة من مصدر التمويل، ونصه كاملًا في «الموارد المطلوبة»
    has(funding) && [D.funding, fundingHead(funding)],
  ].filter(Boolean);
  const deadline = !approved && isFutureDeadline(m.start, m.generated_at) ? dateAr(m.start) : null;
  const noDecision = statusQuoCost(doc);
  const topBenefits = benefits.slice(0, limits.decision);
  const topRisks = risksOf(doc, limits.decision);
  const decision = [
    `<div class="q"><span>${esc(D.decision)}</span><p>${esc(decisionSentenceAr(m.initiative, m.sponsor ? String(m.sponsor).split(/[:：]/)[0].trim() : null))}</p>
      ${decisionStrip.length ? `<div class="in-strip">${decisionStrip.map(([k, v]) => `<div><span>${esc(k)}</span><b>${isRaw(v) ? v.html : esc(v)}</b></div>`).join('')}</div>` : ''}
      <p class="in-choices">${D.choices.map(esc).join(' · ')}</p>${deadline ? `<small class="in-due">${esc(decisionDeadlineAr(deadline))}</small>` : ''}</div>`,
    grid([[D.issue, val(doc, 'initiative-charter', 'problem')], [D.recommend, recommendation], [D.resources, ask], [D.noDecision, noDecision]]),
    topBenefits.length ? `<h3>${esc(D.benefits)}</h3>${benefitCards(topBenefits.map((b) => ({ ...b, indicator: null })))}` : '',
    topRisks.length ? `<h3>${esc(D.risks)}</h3>${riskCards(topRisks.map((x) => ({ ...x, owner: '' })), true)}` : '',
  ].join('');

  if (lean) {
    // ── بطاقة المبادرة: صفحة واحدة (Lean)، ثم خطة أول 90 يومًا ──
    const cell = (label, v, wide = false) => (has(v) ? `<div${wide ? ' class="w2"' : ''}><span>${esc(label)}</span><p>${esc(Array.isArray(v) ? v.map((r) => (Array.isArray(r) ? r.filter(Boolean).join('، ') : r)).join('\n') : v)}</p></div>` : '');
    const card = [
      cell('المشكلة أو الفرصة', val(doc, 'initiative-charter', 'problem'), true),
      cell('المستفيدون', val(doc, 'initiative-charter', 'beneficiaries')),
      cell('الهدف', val(doc, 'initiative-charter', 'objective'), true),
      cell('النطاق', val(doc, 'initiative-charter', 'in_scope')),
      cell('المخرجات', c?.deliverables ? c.deliverables.rows.map((r) => r[0]).filter(Boolean).slice(0, 5).join('\n') : null),
      cell('مؤشرات النجاح', benefits.map((b) => `${b.title}${b.target ? `: ${b.target}` : ''}`).join('\n') || val(doc, 'evidence-plan', 'success_signal')),
      cell('الموارد والتكلفة', ask),
      cell('المخاطر', risksOf(doc, 3).map((x) => x.title).join('\n'), true),
      cell('الراعي ومن يشغّل بعدها', [m.sponsor, val(doc, 'initiative-charter', 'operator')].filter(Boolean).join('\n')),
    ].join('');
    add('Initiative card', form.name, `${doc.summary ? `<p class="in-lead">${esc(doc.summary)}</p>` : ''}<div class="in-lean">${card}</div>`);
    const l = launchPlan(doc);
    const ms = val(doc, 'milestone-register', 'milestones') || [];
    add('First 90 days', 'خطة أول 90 يومًا', [
      l && !l.empty ? `<div class="in-90">${l.windows.map((w) => `<div><h3>${esc(w.title)}</h3><small>${esc(w.range || 'من تاريخ البداية')}</small>${w.items.length ? `<ul>${w.items.slice(0, 5).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>` : '',
      ms.length ? `<div class="cp-f"><b>المعالم</b>${tableOf(fld(doc, 'milestone-register', 'milestones').labels || fld(doc, 'milestone-register', 'milestones').columns, ms.slice(0, 5))}</div>` : '',
      // البطاقة مختصرة: المعالم تكفي، والمخطط الزمني لمن لم يكتب معالم
      ms.length ? '' : ganttFig,
    ].join(''));
  } else {
    // ── الميثاق وحالة العمل: نظرة عامة، ولماذا، والقيمة، والخطة، والحوكمة والمخاطر، والأثر (حالة العمل) ──
    const packages = (val(doc, 'wbs', 'packages') || []).length;
    const tiles = [
      cost && { value: Math.round(cost.withContingency).toLocaleString('en-US'), label: `${budgetLabel} (ريال)` },
      benefits.length && { value: benefits.length, label: 'منفعة مقيسة' },
      (val(doc, 'milestone-register', 'milestones') || []).length && { value: val(doc, 'milestone-register', 'milestones').length, label: 'معلمًا' },
      packages && { value: packages, label: 'حزمة عمل' },
    ].filter(Boolean);
    add('Overview', 'نظرة عامة', `${tiles.length ? kpis(tiles) : ''}
      ${doc.summary ? `<p class="in-lead">${esc(doc.summary)}</p>` : ''}
      ${grid([
        ['المشكلة أو الفرصة', val(doc, 'initiative-charter', 'problem')],
        ['الهدف الأعلى', val(doc, 'initiative-charter', 'objective')],
        ['المستفيدون', val(doc, 'initiative-charter', 'beneficiaries')],
        ['المدة', durationHtml],
        [budgetLabel, cost ? `${money(cost.withContingency)}${funding ? `، من ${funding}` : ''}` : null],
      ])}`);
    add('Why', 'لماذا هذه المبادرة', [
      full ? field(doc, 'options-analysis', 'evidence', 'الدليل على المشكلة') : '',
      field(doc, 'options-analysis', 'options', 'البدائل'),
      field(doc, 'options-analysis', 'recommendation', 'التوصية ومبررها'),
      field(doc, 'theory-of-change', 'chain', 'كيف يحدث التغيير'),
      full ? field(doc, 'theory-of-change', 'impact', 'الأثر المنشود') : '',
      full ? field(doc, 'options-analysis', 'criteria', 'معايير المفاضلة') : '',
      full ? grid([[send ? DOC_TEXT.send.weakest : 'أضعف حلقة في السلسلة', val(doc, 'theory-of-change', 'weakest')], [send ? DOC_TEXT.send.test : 'كيف نختبرها مبكرًا', val(doc, 'theory-of-change', 'test')], [send ? DOC_TEXT.send.external : 'ما خارج سيطرتنا', val(doc, 'theory-of-change', 'external')], ...constraintsOf(val(doc, 'initiative-charter', 'constraints'), send)]) : '',
    ].join(''), askOf('Why'));
    // فصل نجاح المشروع (النطاق والوقت والتكلفة) عن نجاح المنافع (المرحلة 29): الأول يُحكم عند التسليم، والثاني بعده
    const T = DOC_DOORS_AR;
    const nDel = c?.deliverables?.rows?.length || 0;
    const project = grid([
      [T.scope, nDel ? T.deliverables(nDel) : val(doc, 'initiative-charter', 'in_scope')],
      [T.time, durationHtml],
      [T.cost, cost ? `${money(cost.withContingency)}${cost.contingency ? ' شاملًا الاحتياطي' : ''}` : null],
    ]);
    add('Value', 'القيمة والقياس', [
      project ? `<div class="cp-f in-success" data-success="project"><b>${esc(T.project)}</b>${send ? '' : `<p class="cp-p">${esc(T.projectNote)}</p>`}${project}</div>` : '',
      benefits.length ? `<div class="cp-f in-success" data-success="benefits"><b>${esc(T.benefits)}</b>${send ? '' : `<p class="cp-p">${esc(T.benefitsNote)}</p>`}${benefitCards(benefits)}</div>` : '',
      benefitsChart(doc),
      field(doc, 'evidence-plan', 'success_signal', 'مؤشرات النجاح'),
      full ? field(doc, 'evidence-plan', 'plan', 'خطة القياس') : '',
      full ? field(doc, 'cost-plan', 'cba', 'التكلفة مقابل المنفعة') : '',
      // القيمة مقابل المال: فصل الاحترافي في الأثر، فيبلغ البعد الاقتصادي في حالة العمل عمق لجنة الاستثمار
      full ? field(doc, 'value-for-money', 'appraisal', 'تقييم البدائل اقتصاديًا') : '',
      full ? field(doc, 'value-for-money', 'sensitivity', 'الحساسية') : '',
      full ? field(doc, 'value-for-money', 'optimism', 'تحيز التفاؤل') : '',
      full ? field(doc, 'benefits-register', 'benefits', 'سجل المنافع') : '',
      full ? field(doc, 'benefits-register', 'realization_curve', 'منحنى تحقق المنافع') : '',
      full ? grid([['مستوى الدليل', val(doc, 'evidence-plan', 'evidence_level')], ['نسبة الأثر إلى المبادرة', val(doc, 'evidence-plan', 'attribution')], ['الخصوصية', val(doc, 'evidence-plan', 'privacy')]]) : '',
    ].join(''), askOf('Value'));
    add('Plan', 'الخطة والموارد', [
      grid([['داخل النطاق', val(doc, 'initiative-charter', 'in_scope')], ['خارج النطاق', val(doc, 'initiative-charter', 'out_scope')]]),
      c?.deliverables ? `<div class="cp-f"><b>المخرجات الرئيسة</b>${tableOf(c.deliverables.columns, c.deliverables.rows)}</div>` : '',
      field(doc, 'milestone-register', 'milestones', 'المعالم'),
      full ? field(doc, 'milestone-register', 'critical_path', 'المسار الحرج والاعتماديات') : '',
      ganttFig || field(doc, 'schedule', 'activities', 'الجدول الزمني'),
      costKpis,
      costFig,
      full ? field(doc, 'cost-plan', 'items', 'الموارد والتكلفة') : '',
      full ? field(doc, 'wbs', 'packages', 'هيكل تجزئة العمل') : '',
      full ? grid([['الاحتياطي الزمني', val(doc, 'schedule', 'buffer')], ['حساسية الجدول', val(doc, 'schedule', 'sensitivity')], ['المفاضلة عند الضغط', val(doc, 'initiative-charter', 'trade_off')]]) : '',
    ].join(''), askOf('Plan'));
    if (full) {
      add('Commercial', 'الشراء والتعاقد', [
        grid([['ما نحتاج شراءه', val(doc, 'procurement', 'need')], ['مدة التوريد', val(doc, 'procurement', 'lead_time')]]),
        field(doc, 'procurement', 'items', 'بنود الشراء'),
        field(doc, 'procurement', 'contract', 'شكل التعاقد وتوزيع المخاطر'),
      ].join(''), askOf('Commercial'));
    }
    const risks = val(doc, 'raid', 'items') || [];
    const raidF = fld(doc, 'raid', 'items');
    add('Governance & risks', 'الحوكمة والمخاطر', [
      grid([['الراعي ودوره', m.sponsor], ['من يقرر', val(doc, 'governance', 'structure')], ['إيقاع المتابعة', val(doc, 'governance', 'cadence')]]),
      field(doc, 'stakeholder-map', 'stakeholders', 'أصحاب المصلحة'),
      full ? field(doc, 'stakeholder-map', 'coalitions', 'التحالفات وتحريك المعارضين') : '',
      (() => { const r = risksOf(doc, limits.risks); return r.length ? `<div class="cp-f"><b>سجل المخاطر</b>${riskCards(r)}</div>` : ''; })(),
      risks.length && raidF ? heatmap(raidF.columns, risks) : '',
      assumptionCards(assumptionsOf(doc), send),
      full ? field(doc, 'governance', 'raci', 'مصفوفة المسؤوليات') : '',
      full ? grid([['التصعيد', val(doc, 'governance', 'escalation')], ['شهية المخاطر', val(doc, 'raid', 'appetite')], ['أصحاب المصلحة الصامتون', val(doc, 'stakeholder-map', 'silent')], ['قرار البوابة', [val(doc, 'stage-gate', 'decision'), val(doc, 'stage-gate', 'justification')].filter(has).join(': ')]]) : '',
    ].join(''), askOf('Governance & risks'));
    if (full) {
      add('Impact', 'الأثر والاستدامة', [
        field(doc, 'impact-report', 'program', 'البرنامج ومساره'),
        field(doc, 'impact-report', 'changes', 'ماذا تغيّر'),
        field(doc, 'impact-report', 'lessons', 'الدروس المستفادة'),
        grid([['إسهام المبادرة', val(doc, 'impact-report', 'contribution')], ['ما لم يتحقق', val(doc, 'impact-report', 'not_achieved')]]),
        field(doc, 'change-sustain', 'impacted', 'من يتأثر بالتغيير'),
        grid([['المقاومة المتوقعة', val(doc, 'change-sustain', 'resistance')], ['كسب المقاومين', val(doc, 'change-sustain', 'win_resisters')]]),
        field(doc, 'change-sustain', 'handover', 'التسليم والتسلم'),
        field(doc, 'change-sustain', 'sustain', 'ما يحمي المنافع'),
        grid([['من يشغّل بعد المبادرة', val(doc, 'initiative-charter', 'operator')]]),
      ].join(''), askOf('Impact'));
    }
  }

  // ── مصطلحات حالة العمل: مسرد الأطر الثلاثة من slices.json بعمق مستوى المشارك في كل إطار (المصدر نفسه لتلميح الكتاب)،
  // فيقرأ صاحب القرار المصطلح بالمعنى الذي كُتبت به الوثيقة. بلا مسار معروف: بعمق الاحترافي ──
  if (full) {
    const terms = ['milestone', 'impact', 'leadership'].flatMap((d) => man.card?.handbook.frameworks[d]?.terms || termsAt(d, 'advanced'));
    add('Glossary', 'مصطلحات الوثيقة', terms.length ? `<table class="cp-gloss"><tbody>${terms.map((t) => `<tr><th>${esc(t.term)}${t.en && !send ? `<br><small>${esc(t.en)}</small>` : ''}</th><td>${esc(t.def)}</td></tr>`).join('')}</tbody></table>` : '',
      'بالمعنى الذي كُتبت به هذه الوثيقة.');
  }

  // ── الاعتماد: المعتمدة بتاريخها وبصمتها المجمّدة ورمز تحقق عام؛ الحية بتاريخ بنائها، وبصمتها تتغير بأي تعديل ──
  const sp = doc.sponsor;
  const signs = [
    ['المستشار', approved || doc.review ? 'راجع الوثيقة وقبلها بمعيار التقييم' : DOC_SIGN_AR.reviewerPending, null],
    ['الراعي', sp?.status === 'endorsed' ? (sp.name || m.sponsor || 'الراعي') : sp?.waived ? 'اعتُمدت بقرار فريق البرنامج' : DOC_SIGN_AR.sponsorPending, sp?.status === 'endorsed' ? fmt(sp.at) : null],
    ['تاريخ الاعتماد', approved ? fmt(m.approved_at) : 'لم تُعتمد بعد', null],
  ];
  const built = fmtAt(m.generated_at) || fmtAt(new Date());
  // المرحلة 32: الرمز بالبصمة المجمّدة وحدها؛ المعتمدة بلا issued بلا رمز ولا رابط وبسطر «التحقق غير متاح لهذه النسخة»
  const mark = verifyMark(input, { qr: opt.qr, appUrl: m.app_url });
  const url = mark?.url || null;
  // المعتمدة تطبع البصمة المجمّدة وحدها (مصدر الرمز نفسه)؛ بلا مجمّدة لا بصمة مطبوعة تُكتب باليد فلا تُطابَق
  const shownFp = approved ? mark?.fingerprint || null : fp;
  // نسخة الإرسال غير المعتمدة: سطر عنوان وخانات توقيع فارغة (الاسم والتوقيع والتاريخ) بدل نصوص حالة العمل
  const S = DOC_TEXT.send;
  const blank = (k) => `<div class="blank"><span>${esc(k)}</span><ul>${S.blanks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  const signHtml = send && !approved
    ? [['المستشار', approved || doc.review ? signs[0][1] : null, null], ['الراعي', sp?.status === 'endorsed' || sp?.waived ? signs[1][1] : null, signs[1][2]], [S.authority, null, null]]
      .map(([k, v, d]) => (v ? `<div><span>${esc(k)}</span><b>${esc(v)}</b>${d ? `<small>${esc(d)}</small>` : ''}</div>` : blank(k))).join('')
    : signs.map(([k, v, d]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b>${d ? `<small>${esc(d)}</small>` : ''}</div>`).join('');
  add('Approval', 'الاعتماد', `<div class="in-approve${send && !approved ? ' send' : ''}">${approved ? `<span class="st">${esc(DOC_APPROVED_AR)} · ${esc(fmt(m.approved_at) || '')}</span>` : send ? `<h3 class="in-approve-h">${esc(S.approveTitle)}</h3>` : `<span class="st live">${esc(DOC_LIVE_AR)} · بُنيت ${esc(built)}</span>`}
    <div class="in-sign">${signHtml}</div>
    <p class="in-fp"><span>${send ? esc(DOC_TEXT.send.docNo) : 'DOCUMENT'} <b>${send ? `<bdi dir="ltr">${esc(`${m.ref || 'MI-CP'}-V${m.version || 1}`)}</bdi>` : esc(`${m.ref || 'MI-CP'}-V${m.version || 1}`)}</b></span>${shownFp ? `<span>${send ? esc(DOC_TEXT.send.fingerprint) : 'FINGERPRINT'} <b>${send ? `<bdi dir="ltr">${esc(shownFp)}</bdi>` : esc(shownFp)}</b></span>` : ''}</p>
    ${mark ? mark.html : send ? '' : `<div class="in-verify"><p>${esc(DOC_VERIFY_AR.draft)}</p>${LIVE_RING()}</div>`}</div>`,
  url ? DOC_VERIFY_AR.lead : null);

  // المرحلة 29: كل باب في حالة العمل يبدأ صفحة جديدة؛ الميثاق انسياب متصل بحاجز 60 مم؛ ولكل باب مرساة لفهرس سطر القرار
  const doorId = (en) => `in-${String(en).toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`;
  const doorNo = (en, i) => (en === 'Approval' ? '◆' : String(i + 1).padStart(2, '0'));
  const opener = ([en, ar, b, note0], i) => {
    let note = note0;
    const np = Boolean((i && en === 'Approval') || (full && i > 0));
    const flow = !np && !lean && i > 0;
    const isAsk = full && note && en !== 'Approval' && en !== 'Glossary';
    // نسخة الإرسال: لا وسم لاتيني فوق العنوان العربي، ولا سؤال توجيهي تحته (أسئلة صاحب القرار للعرض في المنصة)
    if (send && note && (isAsk || /[؟?]/.test(note))) note = null;
    return `<section class="in-sec${np ? ' np' : ''}" id="${doorId(en)}">${flow ? '<i class="in-keep" aria-hidden="true"></i>' : ''}<header class="in-open"><span class="n">${doorNo(en, i)}</span><div>${send ? '' : `<span class="eyebrow">${esc(en)}</span>`}<h2>${esc(ar)}</h2>${note ? `<p${isAsk ? ' class="ask"' : ''}>${esc(note)}</p>` : ''}</div></header>${b}</section>`;
  };
  const toc = lean ? '' : `<nav class="in-toc" aria-labelledby="in-toc-h"><span id="in-toc-h">${esc(DOC_DOORS_AR.toc)}</span><ol>${parts.map(([en, ar], i) => `<li><a href="#${doorId(en)}">${doorNo(en, i)} ${esc(ar)}</a><span class="cp-pgno" data-ref="#${doorId(en)}"></span></li>`).join('')}</ol></nav>`;
  const { brand, accent } = identityOf(m);
  const decisionPage = opt.decision && decision.replace(/<[^>]+>/g, '').trim() ? `<section class="in-dec"><header class="in-open"><span class="n">◆</span><div><span class="eyebrow">${esc(DOC_DECISION_AR.eyebrow)}</span><h2>${esc(DOC_DECISION_AR.title)}</h2><p>${esc(DOC_DECISION_AR.lead)}</p></div></header>${decision}${toc}</section>` : '';
  // نسخة الإرسال بلا صفحة القرار: صفحة «المحتويات» مستقلة بعد الغلاف، تفتحها التوصية بصيغة مؤسسية
  const contents = send && !lean && !decisionPage ? `<section class="in-sec in-contents" id="in-contents"><header class="in-open"><span class="n">◆</span><div><h2>${esc(DOC_TEXT.toc.title)}</h2></div></header><p class="in-lead">${esc(DOC_TEXT.send.recommend(m.initiative, m.sponsor ? String(m.sponsor).split(/[:：]/)[0].trim() : null))}</p><ol class="in-contents-list">${parts.map(([en, ar], i) => `<li><a href="#${doorId(en)}"><span class="n">${doorNo(en, i)}</span>${esc(ar)}</a><span class="cp-pgno" data-ref="#${doorId(en)}"></span></li>`).join('')}</ol></section>` : '';
  const inner = (decisionPage || contents) + parts.map(opener).join('') + (opt.annex ? levelAnnex(input) || levelAnnexEmpty() : '');
  const body = (send ? nowrapNumbers : (x) => x)(STYLE + IN_STYLE + VERIFY_STYLE + (lean ? LEAN_STYLE : '') + `<style>:root { --acc: ${accent}; --acc-text: ${accentText(accent)}; }</style>` + (lean ? `<div class="in-lean-doc">${inner}</div>` : inner));
  // بلا اسم للمبادرة: العنوان اسم الوثيقة وحده، فلا يتكرر في العنوان الفرعي
  const title = m.initiative || form.name;
  const subtitle = send ? DOC_TEXT.send.docType : [m.initiative ? form.name : null, m.scope_title].filter(Boolean).join(' · ') || null;
  const org = m.org || null;
  return {
    fingerprint: fp,
    form,
    meta: {
      id: `${m.ref || 'MI-CP'}-V${m.version || 1}`, kind: 'CP', kindLabel: form.en,
      // التذييل: الرقم المرجعي والبصمة المجمّدة في كل صفحة بلا رمز (المرحلة 32)
      footer: footerLine(`${m.ref || 'MI-CP'}-V${m.version || 1}`, mark?.fingerprint), pageAr: true, selfFonts: true,
      pdfName: pdfFileName({ ...m, initiative: m.initiative }, 'institutional').replace(/^وثيقة-المبادرة/, form.name.replace(/\s+/g, '-')),
      brand,
      eyebrow: brand.program || 'برنامج القادة', title, subtitle,
      // المرحلة 25: صف رسمي واحد (الجهة، الراعي، القائد)، والرمز والإصدار والتاريخ والحالة في شريط الضبط اللاتيني، والحالة في الختم
      rows: [['الجهة', org?.name || m.host], ['الراعي', m.sponsor ? String(m.sponsor).split(/[:：]/)[0].trim() : null], ['قائد المبادرة', m.participant?.name]].filter(([, v]) => v),
      // نسخة الإرسال: رقم الوثيقة وحده في شريطه اللاتيني، والتاريخ بالصيغة العربية نفسها في بقية الوثيقة بجانبه (لا ISO ولا رمز إصدار)
      control: send ? controlStrip([`${m.ref || 'MI-CP'}`]) : controlStrip([`${m.ref || 'MI-CP'}`, `V${m.version || 1}`, isoDay(approved ? m.approved_at : (m.generated_at || new Date())), approved ? 'APPROVED' : 'DRAFT']),
      ...(send ? { controlDate: fmt(approved ? m.approved_at : (m.generated_at || new Date())) } : {}),
      // المعتمدة برمز تحقق: رمز صغير ورابطه على الغلاف أيضًا
      ...(send && url ? { coverMark: `<div class="vm cover" data-verify="cover">${qrSvg(url)}<div class="vm-l"><span>${esc(DOC_VERIFY_AR.scan)}</span><a href="${esc(url)}">${esc(url.replace(/^https?:\/\//, ''))}</a></div></div>` } : {}),
      stamp: approved ? DOC_APPROVED_AR : DOC_LIVE_AR,
      // المرحلة 28: الحية بعلامة مائية في كل صفحة وترويسة DOC_LIVE_HEAD_AR، والختم الذهبي في إغلاق المعتمدة وحدها
      live: !approved,
      controlLabel: `رمز الوثيقة ${m.ref || 'MI-CP'}، الإصدار ${m.version || 1}، التاريخ ${isoDay(approved ? m.approved_at : (m.generated_at || new Date()))}، الحالة ${approved ? DOC_APPROVED_AR : send ? DOC_SEND_STAMP_AR : DOC_LIVE_AR}`,
      confidential: send ? DOC_TEXT.send.confidential : CONFIDENTIAL_AR, rights: DOC_RIGHTS_AR,
      closing: approved ? docClosingApprovedAr(fmt(m.approved_at) || '', shownFp) : send ? DOC_TEXT.sendClosing : docClosingLiveAr(built),
    },
    body,
  };
}

/**
 * معامل الخيارات الموحد للوثيقة (المرحلة 21): { annex, decision, appendix, qr }
 *   annex: ملحق المراجع (مستوى الوثيقة وموقع كل فصل منه). لا يُرسم إلا بطلب صريح من شاشة مراجع (الخبير والإدارة)،
 *     ولو وصل الحقل review_levels، فللحماية حاجزان: الخادم والعارض
 *   decision: صفحة القرار في المؤسسية. appendix: ملحق «ما ينقص» في ملف العمل. qr: رمز التحقق في المعتمدة
 * والأنواع الأربعة إعدادات مسبقة له لا قوالب موازية. ما لا يُمرَّر يأخذ قيمة النوع
 */
export const DOC_PRESETS = Object.freeze({
  working: Object.freeze({ annex: false, decision: true, appendix: true, qr: true }),
  institutional: Object.freeze({ annex: false, decision: true, appendix: true, qr: true }),
  external: Object.freeze({ annex: false, decision: true, appendix: false, qr: true }),
  reader: Object.freeze({ annex: false, decision: true, appendix: false, qr: true }),
});
// نسختا تحميل الأدمن للوثيقة النهائية: «للإرسال» (الافتراض المعتمد) بلا ملحق المراجع ولا صفحة القرار ولا ملحق ما ينقص، و«كاملة» بكل الأقسام
export const EXPORT_PRESETS = Object.freeze({
  send: Object.freeze({ annex: false, decision: false, appendix: false, qr: true }),
  full: Object.freeze({ annex: true, decision: true, appendix: true, qr: true }),
});
export const DOC_OPTION_KEYS = ['annex', 'decision', 'appendix', 'qr'];
/** الخيارات بعد دمجها بإعداد النوع: قيم منطقية وحدها، وما سواها يُهمل */
export function docOptions(options = {}, kind = 'working') {
  const base = DOC_PRESETS[kind] || DOC_PRESETS.working;
  const o = options && typeof options === 'object' ? options : {};
  return Object.fromEntries(DOC_OPTION_KEYS.map((k) => [k, typeof o[k] === 'boolean' ? o[k] : base[k]]));
}

/** الوثيقتان من مصدر واحد: 'institutional' (النسخة المؤسسية) أو 'working' (ملف العمل الكامل). يعيد { meta, body } أو { blocked, message } */
// 'external': لمن هو خارج العمل (الراعي، الجهة، رابط المشاركة): المؤسسية إن اكتملت، وإلا صفحة «قيد الإعداد» مهذبة، ولا ملحق ولا ختم مسودة،
// ولا ملحق مراجع أبدًا مهما مُرِّر
// 'reader': من يقرأ قبل الاعتماد (الراعي ليؤيد، والخبير بوضع القارئ): المؤسسية إن اكتملت، وإلا ملف العمل بلا ملحق «ما ينقص» ولا ختم.
// ملحق المراجع لا يُلحق إلا بـ { annex: true } صريح، تمرره شاشة الخبير (ExpertFile) وشاشات الإدارة وحدها
export function renderInitiative(doc, kind = 'working', options = {}) {
  const opt = docOptions(kind === 'external' ? { ...options, annex: false } : options, kind);
  if (kind === 'external' || kind === 'reader') {
    const r = institutionalReport(doc, opt);
    if (!r.blocked) return r;
    return kind === 'reader' ? capstoneReport(doc, { ...opt, appendix: false }) : pendingReport(doc);
  }
  if (kind !== 'institutional') return capstoneReport(doc, opt);
  const r = institutionalReport(doc, opt);
  return r.blocked ? { blocked: true, missing: r.missing, message: missingMessage(r.missing, formOfDoc(doc).name) } : r;
}

/**
 * الوثيقة النهائية كما يحمّلها الأدمن (المرحلة 21): المؤسسية بالخيارات، وإن لم تكتمل فملف العمل بالخيارات نفسها.
 * بلا نسبة الجاهزية دائمًا (withoutReadiness)، وغير المعتمدة بختم ظاهر DOC_LIVE_AR فلا تُرسل على أنها نهائية
 */
export function finalDocument(doc, options = EXPORT_PRESETS.send) {
  const src = withoutReadiness(doc);
  const opt = docOptions(options, 'institutional');
  const send = !opt.appendix;
  const inst = institutionalReport(src, { ...opt, send });
  const out = inst.blocked ? capstoneReport(src, { ...opt, final: true }) : inst;
  // نسخة الإرسال من المؤسسية غير المعتمدة: ختم واحد رصين على الغلاف، بلا علامة مائية ولا ترويسة مسودة في الصفحات
  const approved = src?.meta?.status === 'approved';
  const meta = !inst.blocked && send && !approved ? { ...out.meta, stamp: DOC_SEND_STAMP_AR, live: false } : out.meta;
  return { ...out, meta, kind: inst.blocked ? 'working' : 'institutional' };
}

/** وصف ما سيحويه الملف في سطر، للوح التحميل */
export function exportSummary(options = EXPORT_PRESETS.send, { approved = false, available = true } = {}) {
  const o = docOptions(options, 'institutional');
  const qrNote = !approved || !available ? DOC_QR_EXPORT_AR.summaryNone : '';
  const has = [o.decision && 'صفحة القرار', o.appendix && 'ملحق ما ينقص', o.annex && 'ملحق المراجع', approved && available && o.qr && 'رمز التحقق'].filter(Boolean);
  const not = [!o.decision && 'صفحة القرار', !o.appendix && 'ملحق ما ينقص', !o.annex && 'ملحق المراجع', approved && available && !o.qr && 'رمز التحقق'].filter(Boolean);
  const stamp = approved ? '' : `وبختم «${o.appendix ? DOC_LIVE_AR : DOC_SEND_STAMP_AR}»`;
  return [`الوثيقة${has.length ? ` مع ${has.join(' و')}` : ''}`, not.length ? `بلا ${not.join(' ولا ')}` : '', 'وبلا نسبة الجاهزية', qrNote, stamp].filter(Boolean).join('، ') + '.';
}

/** رسالة ما ينقص لإصدار النسخة المؤسسية، بلغة المشارك */
export const missingMessage = (missing, name = 'الوثيقة المؤسسية') => docBlockedAr(missing.length, name, missing.map((x) => (x.add ? `${x.title} (${x.add})` : x.title)).join('، '));

/** صفحة مهذبة لقارئ خارجي حين لم تكتمل النسخة المؤسسية بعد */
export function pendingReport(doc) {
  const m = doc?.meta || {};
  const form = formOfDoc(doc);
  return {
    meta: { id: `${m.ref || 'MI-CP'}-V${m.version || 1}`, kind: 'CP', kindLabel: form.en, pageAr: true, selfFonts: true,
      brand: identityOf(m).brand,
      eyebrow: identityOf(m).brand.program || 'برنامج القادة', title: m.initiative || form.name, rows: [['قائد المبادرة', m.participant?.name]].filter(([, v]) => v),
      confidential: CONFIDENTIAL_AR, rights: DOC_RIGHTS_AR, closing: `تصدر ${form.name} حين يكتمل إعدادها.` },
    body: STYLE + section('In preparation', 'الوثيقة قيد الإعداد', `<p class="cp-p">يعمل قائد المبادرة على استكمال ${esc(form.name)} مع مستشاره. ستجدها هنا كاملة حين يكتمل إعدادها.</p>`),
  };
}
