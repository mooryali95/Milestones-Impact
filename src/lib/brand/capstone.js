// ════════════════════════════════════════════════════════════════
// وثيقة المبادرة (مشروع التخرج): قالب الطباعة الاحترافي
// ════════════════════════════════════════════════════════════════
// قالب واحد يفتحه المشارك والمستشار والراعي والجهة، من وثيقة يبنيها الخادم
// (capstone.doc / admin.capstone / sponsor.get / coord.capstone). يبني على
// محرك الوثائق doc.js فتخرج بالهوية نفسها، ويضيف رسوم الوثيقة: شجرة هيكل
// التجزئة، والمخطط الزمني، وخريطة المخاطر، وملخص التكلفة.
import { bars, callout, esc, kpis, points, raw, section, table } from './doc.js';
import { costLabel, dateAr, displayPages, pageNumberOf, parseDate, parseNumber, CHAPTER_STANDING_AR, PRIORITY_WEIGHT, RISK_HIGH, RISK_MID, RUBRIC, RUBRIC_MAX } from '../../../supabase/functions/leaders-api/capstone.js';
import { CHECKPOINT_STATUS_AR } from '../../../supabase/functions/leaders-api/tracking.js';

import { CHAPTER_STANDING_NOTE_AR, CONFIDENTIAL_AR, DIM_AR, DOC_CHARTER_NOTE_AR, DOC_LIVE_AR, DOC_RIGHTS_AR, DOC_SEND_STAMP_AR, DOC_SUMMARY_AR, DOC_TEXT, DOC_WORKING_AR, docRecommendAr, SEND_SECTIONS, LEVEL_AR as LVL, LEVELS as LEVEL_LIST, REVIEW_ANNEX_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { benefitsOf, businessCase, charterData, execSummary, launchPlan } from '../../../supabase/functions/leaders-api/business-case.js';
import { chapterInfo, groupByPhase, termsIn } from '../../../supabase/content/initiative-guide/v1/anatomy.js';
import { BOARDS, costBarsSvg, ganttLegend, ganttSvg, networkLegend, networkSvg, sCurveSvg, scheduleModel } from './visuals.js';
import { closureData } from '../../../supabase/functions/leaders-api/closure.js';
import { cleanDoc, REASONS } from '../../../supabase/functions/leaders-api/doc-quality.js';
import { formOfDoc } from '../../../supabase/functions/leaders-api/doc-form.js';
import { caseQuestions, chapterQuestion } from './decision-questions.js';
import { footerLine, verifyMark, VERIFY_STYLE } from './verify-mark.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : '·');
const money = (n) => (n == null ? '·' : `${Math.round(n).toLocaleString('en-US')} ريال`);
const filled = (r) => Array.isArray(r) && r.some((c) => String(c || '').trim());
export const paras = (t) => String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `<p class="cp-p">${esc(x)}</p>`).join('');

// ── رسوم الوثيقة ──
export const STYLE = `<style>
.cp-p { margin: 0 0 2mm; font-size: 9.6pt; line-height: 1.9; color: #2C4148; }
.cp-f { margin: 0 0 4mm; break-inside: avoid; }
.cp-f > b { display: block; font-weight: 400; font-size: 8.4pt; color: #5F7176; margin-bottom: 1mm; }
.cp-toc { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 10mm; }
.cp-toc li { display: flex; gap: 3mm; padding: 1.6mm 0; border-bottom: 1px solid #EEF1F0; font-size: 9.4pt; break-inside: avoid; }
.cp-toc li span { font: 400 8pt "Noto Sans", sans-serif; color: #A97A2E; min-width: 7mm; }
.cp-toc li small { margin-inline-start: auto; color: #5F7176; font-size: 7.6pt; }
.cp-tree { margin: 3mm 0 0; padding: 0; list-style: none; }
.cp-tree li { position: relative; padding: 1.2mm 0; font-size: 9pt; }
.cp-tree li .c { display: inline-block; min-width: 12mm; font: 400 8pt "Noto Sans", sans-serif; color: #8A6424; }
.cp-tree li small { color: #5F7176; margin-inline-start: 2mm; }
.cp-tree li.l1 { font-weight: 400; border-top: 1px solid #DCE2E1; padding-top: 2mm; margin-top: 1mm; }
.cp-tree li.l2 { padding-inline-start: 7mm; } .cp-tree li.l3 { padding-inline-start: 14mm; } .cp-tree li.l4 { padding-inline-start: 21mm; }
.cp-tree li.l2::before, .cp-tree li.l3::before, .cp-tree li.l4::before { content: ''; position: absolute; top: 0; bottom: 50%; width: 3mm; border-bottom: 1px solid #DCE2E1; border-inline-start: 1px solid #DCE2E1; inset-inline-start: calc(var(--d) * 7mm - 4mm); }
.cp-fig { margin: 4mm 0 2mm; break-inside: avoid; }
.cp-fig figcaption { font-size: 7.6pt; color: #5F7176; margin-top: 1mm; }
.cp-heat { display: grid; grid-template-columns: 8mm repeat(5, 1fr); gap: 1px; width: 92mm; font: 400 7.5pt "Noto Sans", sans-serif; direction: ltr; }
.cp-heat div { aspect-ratio: 1.6; display: grid; place-items: center; color: #0B272F; }
.cp-heat .ax { color: #5F7176; aspect-ratio: auto; }
.cp-heat .lo { background: #EEF1F0; } .cp-heat .md { background: #F2E6D0; } .cp-heat .hi { background: #E1BE85; }
.cp-heat b { font-weight: 400; font-size: 10pt; }
.cp-legend { display: flex; gap: 4mm; font-size: 7.5pt; color: #5F7176; margin-top: 2mm; }
.cp-legend i { display: inline-block; width: 3mm; height: 3mm; vertical-align: middle; margin-inline-end: 1mm; }
.cp-check { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.6mm; }
.cp-check li { font-size: 9pt; padding-inline-start: 6mm; position: relative; }
.cp-check li::before { position: absolute; inset-inline-start: 0; font: 400 9pt "Noto Sans", sans-serif; }
.cp-check li.ok::before { content: '✓'; color: #A97A2E; } .cp-check li.no::before { content: '○'; color: #5F7176; }
.cp-check li small { display: block; color: #5F7176; font-size: 8pt; }
.cp-stamp { display: inline-block; border: 1px solid #A97A2E; color: #8A6424; padding: 1mm 4mm; border-radius: 2px; font-size: 8.5pt; }
.cp-gaps { width: 100%; border-collapse: collapse; font-size: 9pt; }
.cp-gaps th { text-align: right; font-weight: 400; font-size: 8.5pt; color: #5F7176; padding: 2mm 1.5mm; border-bottom: 1px solid #0B272F; }
.cp-gaps td { padding: 2mm 1.5mm; border-bottom: 1px solid #EEF1F0; vertical-align: top; }
.cp-gaps td.ch { color: #0B272F; font-weight: 400; } .cp-gaps td.why { color: #5F7176; font-size: 8.2pt; }
.cp-rev { display: inline-block; margin-inline-start: 1.5mm; font-size: 7.5pt; color: #8A6424; border-bottom: 1px dotted #A97A2E; }
.cp-flag > .cp-p { color: #5F7176; }
.cp-gaps td q { color: #2C4148; font-size: 8pt; }
.cp-draft { border: 1px dashed #5F7176; color: #5F7176; padding: 3mm 5mm; border-radius: 2px; font-size: 9pt; margin-top: 6mm; }
.cp-score b { font: 400 28pt/1 "Noto Sans", sans-serif; } .cp-score span { color: #5F7176; font-size: 9pt; margin-inline-start: 2mm; }
.cp-break { break-before: page; }
.cp-charter { width: 100%; border-collapse: collapse; font-size: 9pt; }
.cp-charter th { width: 34mm; text-align: start; vertical-align: top; font-weight: 400; color: #5F7176; padding: 1.3mm 0; border-bottom: 1px solid #EEF1F0; }
.cp-charter td { padding: 1.3mm 0 1.3mm 2mm; border-bottom: 1px solid #EEF1F0; line-height: 1.7; color: #2C4148; white-space: pre-line; }
.cp-case { margin: 0 0 5mm; break-inside: avoid; }
.cp-case h3 { margin: 0 0 1mm; } .cp-case > small { display: block; color: #5F7176; font-size: 8pt; margin-bottom: 2mm; }
/* الوثيقة عربية: عناوين الأقسام الصغيرة بالعربية بلا تباعد أحرف يقطع وصلها */
.sec > header .eyebrow { font: 400 7.6pt "Noto Kufi Arabic", sans-serif; letter-spacing: 0; text-transform: none; }
/* الفصل الطويل ينقسم بين الصفحات بحقوله، فلا تبقى صفحات نصف فارغة؛ والحقل القصير لا ينقسم، وعنوانه مع أوله */
.sec.keep:has(.cp-f) { break-inside: auto; }
.cp-f:has(.tbl) { break-inside: auto; }
.cp-f > b { break-after: avoid; }
.tbl { table-layout: fixed; }
.tbl th { white-space: normal; line-height: 1.5; vertical-align: bottom; }
.tbl td { overflow-wrap: break-word; }
/* صفحات تبدأ من أعلى الورقة: الفهرس، والميثاق، ومسوّغات المبادرة، وخطة الانطلاق، وأول الفصول، والملاحق. قاعدة واحدة تحكم الطباعة وملف PDF (pdf.js) */
.cp-np + .sec { break-before: page; }
.cp-why { break-after: avoid; }
.tbl thead { break-after: avoid; }
.kpis, .cp-case, .cp-launch > div, .cp-toc2 li, .cp-charter tr, .cp-gloss tr, .points li, .cp-check li, .cp-tree li { break-inside: avoid; }
/* رقم الصفحة في الفهرس: مكانه محجوز في الملف وحده، يكتبه pdf.js بعد تقسيم الصفحات */
.cp-pgno { display: none; }
/* الطباعة ومولّد الخادم: الرقم من target-counter (المرحلة 27)؛ وملف المتصفح يكتبه pdf.js في موضعه فلا يتكرر */
@media print { html:not(.pdf) .cp-pgno { display: inline-block; min-width: 7mm; text-align: left; font: 400 8pt "Noto Sans", sans-serif; color: #5F7176; }
  html:not(.pdf) .cp-pgno:empty::after { content: target-counter(attr(data-ref url), page); } }
html.pdf .cp-pgno { display: inline-block; min-width: 7mm; text-align: left; font: 400 8pt "Noto Sans", sans-serif; color: #5F7176; }
.cp-anchor { display: block; height: 0; }
.cp-toc2 { display: grid; gap: 3mm; }
.cp-toc2 .ph { break-inside: avoid; }
.cp-toc2 .ph > h3 { margin: 0 0 1mm; font-weight: 400; font-size: 10pt; display: flex; gap: 2mm; align-items: baseline; }
.cp-toc2 .ph > h3 small { color: #5F7176; font-size: 7.6pt; font-weight: 400; }
.cp-toc2 .ph > p { margin: 0 0 1.4mm; color: #5F7176; font-size: 7.8pt; }
.cp-toc2 ol { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 8mm; }
.cp-toc2 li { break-inside: avoid; border-bottom: 1px solid #EEF1F0; padding: 1.3mm 0; font-size: 9pt; display: flex; gap: 2.5mm; align-items: baseline; }
.cp-toc2 li a { color: inherit; text-decoration: none; flex: 1; }
.cp-toc2 li span.n { font: 400 8pt "Noto Sans", sans-serif; color: #A97A2E; min-width: 6mm; }
.cp-toc2 li i { font-style: normal; font-size: 7.5pt; color: #5F7176; white-space: nowrap; }
.cp-toc2 li i.no { color: #8A6424; }
.cp-toc2 .front { columns: 1; display: flex; flex-wrap: wrap; gap: 0 6mm; }
.cp-toc2 .front li { border: 0; padding: .6mm 0; }
.cp-join { margin: 6mm 0 2mm; padding-top: 3mm; border-top: 1px solid #DCE2E1; font-weight: 400; font-size: 10.4pt; color: #0B272F; break-after: avoid; }
.cp-ref { font-size: 8.4pt; color: #5F7176; margin: 1mm 0 0; }
.cp-ref b { font-weight: 400; color: #2C4148; }
.cp-why { margin: -2mm 0 4mm; color: #5F7176; font-size: 8.4pt; }
.cp-launch { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-top: 1px solid #A97A2E; margin-bottom: 4mm; }
.cp-launch > div { padding: 3mm 3mm 3mm 0; border-inline-start: 1px solid #DCE2E1; padding-inline-start: 3mm; break-inside: avoid; }
.cp-launch > div:first-child { border-inline-start: 0; padding-inline-start: 0; }
.cp-launch h3 { margin: 0; font-weight: 400; font-size: 10pt; }
.cp-launch small { display: block; color: #5F7176; font-size: 7.5pt; margin-bottom: 2mm; }
.cp-launch ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 1.6mm; }
.cp-launch li { font-size: 8.6pt; line-height: 1.7; color: #2C4148; padding-inline-start: 3.5mm; position: relative; }
.cp-launch li::before { content: ''; position: absolute; inset-inline-start: 0; top: 2.2mm; width: 1.4mm; height: 1.4mm; background: #A97A2E; transform: rotate(45deg); }
.cp-gloss { width: 100%; border-collapse: collapse; font-size: 9pt; }
.cp-gloss th { width: 34mm; text-align: start; vertical-align: top; font-weight: 400; padding: 1.6mm 0; border-bottom: 1px solid #EEF1F0; color: #0B272F; }
.cp-gloss td { padding: 1.6mm 0 1.6mm 2mm; border-bottom: 1px solid #EEF1F0; color: #2C4148; line-height: 1.7; }
.cp-gloss tr { break-inside: avoid; }
.cp-fig svg.mi-narrow { max-width: 105mm !important; display: block; margin: 0 auto; }
.mi-legend { display: flex; gap: 4mm; flex-wrap: wrap; font-size: 7.5pt; color: #5F7176; margin-top: 1.5mm; }
.mi-lg { display: inline-flex; align-items: center; gap: 1.2mm; }
.mi-lg i { display: inline-block; width: 4mm; height: 1.6mm; border-radius: 1px; }
.mi-lg i.dash { height: 0; border-top: 1px dashed #5F7176; background: none; }
.mi-lg i.dm { width: 2mm; height: 2mm; transform: rotate(45deg); }
.mi-lg i.ln { height: 0; border-top: 1px solid #5F7176; background: none; }
.cp-case .cp-miss { color: #5F7176; font-size: 8.6pt; border: 1px dashed #DCE2E1; padding: 2mm 3mm; border-radius: 2px; }
</style>`;

// شجرة هيكل التجزئة من الترميز الهرمي (1، 1.1، 1.1.2)
export function wbsTree(columns, rows) {
  const ci = (w) => (columns || []).findIndex((c) => String(c).includes(w));
  const code = Math.max(0, ci('الرمز')), name = ci('حزمة') >= 0 ? ci('حزمة') : 1, owner = ci('المالك');
  const list = (rows || []).filter(filled).map((r) => ({ c: String(r[code] || '').trim(), n: String(r[name] || '').trim(), o: owner >= 0 ? String(r[owner] || '').trim() : '' }))
    .filter((x) => x.c || x.n)
    .sort((a, b) => a.c.localeCompare(b.c, 'en', { numeric: true }));
  if (!list.length) return '';
  return `<figure class="cp-fig"><ul class="cp-tree">${list.map((x) => {
    const d = Math.min(4, Math.max(1, x.c ? x.c.split('.').filter(Boolean).length : 1));
    return `<li class="l${d}" style="--d:${d - 1}"><span class="c">${esc(x.c)}</span>${esc(x.n)}${x.o ? `<small>· ${esc(x.o)}</small>` : ''}</li>`;
  }).join('')}</ul><figcaption>شجرة هيكل تجزئة العمل كما رُمّزت حزمه</figcaption></figure>`;
}

// المخطط الزمني من اليمين إلى اليسار، بشهور على المحور
export function gantt(columns, rows) {
  const ci = (w) => (columns || []).findIndex((c) => String(c).includes(w));
  const s = ci('البداية'), e = ci('النهاية'), code = Math.max(0, ci('الرمز')), name = ci('النشاط') >= 0 ? ci('النشاط') : 1;
  const list = (rows || []).filter(filled).map((r) => ({ c: String(r[code] || ''), n: String(r[name] || ''), a: parseDate(r[s]), b: parseDate(r[e]) }))
    .filter((x) => x.a != null && x.b != null && x.b >= x.a);
  if (!list.length) return '';
  const min = Math.min(...list.map((x) => x.a)), max = Math.max(...list.map((x) => x.b));
  const span = Math.max(864e5, max - min);
  const W = 1000, label = 330, chart = W - label - 20, rowH = 34, top = 34, H = top + list.length * rowH + 8;
  const x = (t) => W - label - ((t - min) / span) * chart;
  const ticks = [];
  const d0 = new Date(min);
  for (let t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1); t <= max; ) {
    if (t >= min) ticks.push(t);
    const d = new Date(t);
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  const step = Math.max(1, Math.ceil(ticks.length / 10));
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="المخطط الزمني" font-family="Noto Kufi Arabic, Noto Sans, sans-serif">
${ticks.filter((_, i) => i % step === 0).map((t) => `<line x1="${x(t).toFixed(1)}" y1="${top - 6}" x2="${x(t).toFixed(1)}" y2="${H - 4}" stroke="#DCE2E1" stroke-width="1"/><text x="${x(t).toFixed(1)}" y="${top - 12}" font-size="15" fill="#5F7176" text-anchor="middle">${new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</text>`).join('')}
${list.map((r, i) => {
    const y = top + i * rowH;
    const x1 = x(r.b), x2 = x(r.a);
    const w = Math.max(4, x2 - x1);
    return `<text x="${W - 4}" y="${y + 22}" font-size="16" fill="#0B272F" text-anchor="end" direction="rtl">${esc(`${r.c ? `${r.c}  ` : ''}${r.n}`.slice(0, 32))}</text>
<rect x="${x1.toFixed(1)}" y="${y + 8}" width="${w.toFixed(1)}" height="18" rx="2" fill="${r.a === r.b ? '#A97A2E' : '#0B272F'}" opacity="${r.a === r.b ? 1 : 0.85}"/>`;
  }).join('')}
</svg>`;
  return `<figure class="cp-fig">${svg}<figcaption>المخطط الزمني من ${esc(fmt(min))} إلى ${esc(fmt(max))}</figcaption></figure>`;
}

// خريطة المخاطر: الاحتمال × شدة الأثر من 1 إلى 5 (العمود يُطابق بـ«الأثر» فيقرأ «شدة الأثر» والتسمية القديمة معًا)
export function heatmap(columns, rows) {
  const ci = (w) => (columns || []).findIndex((c) => String(c).includes(w));
  const p = ci('الاحتمال'), im = ci('الأثر');
  if (p < 0 || im < 0) return '';
  const grid = {};
  let n = 0;
  for (const r of (rows || []).filter(filled)) {
    const a = Math.round(parseNumber(r[p])), b = Math.round(parseNumber(r[im]));
    if (a >= 1 && a <= 5 && b >= 1 && b <= 5) { grid[`${a}:${b}`] = (grid[`${a}:${b}`] || 0) + 1; n++; }
  }
  if (!n) return '';
  let cells = '';
  for (let a = 5; a >= 1; a--) {
    cells += `<div class="ax">${a}</div>`;
    for (let b = 1; b <= 5; b++) {
      const k = a * b >= RISK_HIGH ? 'hi' : a * b >= RISK_MID ? 'md' : 'lo';
      cells += `<div class="${k}">${grid[`${a}:${b}`] ? `<b>${grid[`${a}:${b}`]}</b>` : ''}</div>`;
    }
  }
  cells += `<div class="ax"></div>${[1, 2, 3, 4, 5].map((b) => `<div class="ax">${b}</div>`).join('')}`;
  return `<figure class="cp-fig"><div class="cp-heat">${cells}</div>
<div class="cp-legend"><span><i style="background:#E1BE85"></i>عالٍ (${RISK_HIGH} فأكثر)</span><span><i style="background:#F2E6D0"></i>متوسط</span><span><i style="background:#EEF1F0"></i>منخفض</span><span>المحور الرأسي: الاحتمال · الأفقي: شدة الأثر</span></div>
<figcaption>خريطة المخاطر: عدد البنود في كل خانة</figcaption></figure>`;
}

function costBlock(cost, doc = null) {
  if (!cost) return '';
  // منحنى الإنفاق والتكلفة بالحزمة (visuals.js) حين تكتمل بياناتهما، وإلا أشرطة البنود
  const curve = doc ? sCurveSvg(doc) : null, bars2 = doc ? costBarsSvg(doc) : null;
  const figs = [curve?.svg && `<figure class="cp-fig">${curve.svg}<figcaption>الإنفاق التراكمي المخطط على أنشطة الجدول، مقابل الموازنة${cost.contingency ? ' والتكلفة مع الاحتياطي' : ''}</figcaption></figure>`,
    bars2?.svg && `<figure class="cp-fig">${bars2.svg}<figcaption>التكلفة بالحزمة الأولى في هيكل التجزئة</figcaption></figure>`].filter(Boolean).join('');
  const rows = Object.entries(cost.by || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ label: k, value: Math.round(v) }));
  return `${kpis([
    { value: money(cost.total), label: 'التكلفة التقديرية' },
    // بلا احتياطي لا خانتا «الاحتياطي 0%» و«مع الاحتياطي»
    ...(cost.contingency ? [{ value: `${cost.contingency}%`, label: 'الاحتياطي' }, { value: money(cost.withContingency), label: 'مع الاحتياطي' }] : []),
    { value: money(cost.envelope), label: 'الموازنة المتاحة', hint: cost.envelope != null ? (cost.withContingency <= cost.envelope ? 'ضمن الموازنة' : 'تتجاوز الموازنة') : '' },
  ])}${figs || (rows.length > 1 ? `<div class="cp-fig">${bars(rows, Math.max(...rows.map((r) => r.value)), { ltr: true })}<p class="cp-legend">التكلفة بحسب رمز الحزمة</p></div>` : '')}`;
}

// عرض كل عمود بقدر محتواه: الرقم القصير لا يأخذ عرض الوصف الطويل فينكسر الوصف كلمةً في كل سطر
export function columnWidths(columns, rows) {
  const list = (rows || []).filter(filled);
  const w = (columns || []).map((c, i) => {
    const lens = list.map((r) => Math.min(140, String(r[i] ?? '').trim().length));
    const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
    // أطول كلمة لا تنكسر (تاريخ أو رقم أو رمز) تحدد أدنى عرض للعمود
    const word = Math.max(0, ...list.flatMap((r) => String(r[i] ?? '').split(/\s+/).map((t) => t.length)));
    return Math.max(Math.pow(Math.max(avg, String(c).length * 0.45, 4), 0.85), Math.min(16, word) * 0.95);
  });
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => `${((x / sum) * 100).toFixed(1)}%`);
}
export const tableOf = (columns, rows, empty) => { const ws = columnWidths(columns, rows); return table((columns || []).map((c, i) => ({ label: c, width: ws[i] })), rows, empty); };

// علامة «يحتاج مراجعة» في ملف العمل: القيمة الأصلية تبقى ظاهرة، وسببها بجانبها (doc-quality.js cleanDoc keep)
const REV = (why) => `<small class="cp-rev">يحتاج مراجعة: ${esc(REASONS[why] || why)}</small>`;
function fieldHtml(f) {
  const v = f.value;
  if (f.type === 'table') {
    const rows = (Array.isArray(v) ? v : []).filter(filled);
    // الجدول الفارغ لا يُعرض: ما ينقص يُجمع في ملحق «ما ينقص لإكمال الوثيقة» (doc-quality.js)
    if (!rows.length) return '';
    if (!f.rowIssues?.length && !f.cellIssues?.length) return `<div class="cp-f"><b>${esc(f.label)}</b>${tableOf(f.labels || f.columns, rows)}</div>`;
    const dropped = new Map((f.rowIssues || []).map((x) => [x.row, x.reason]));
    const cells = new Map((f.cellIssues || []).map(([r, c, why]) => [`${r}:${c}`, why]));
    let k = 0;
    const marked = rows.map((r, i) => {
      if (dropped.has(i)) return r.map((c, j) => (j === 0 ? raw(`${esc(c)} ${REV(dropped.get(i))}`) : c));
      const n = k++;
      return r.map((c, j) => (cells.has(`${n}:${j}`) ? raw(`${esc(c)} ${REV(cells.get(`${n}:${j}`))}`) : c));
    });
    const ws = columnWidths(f.columns, rows);
    return `<div class="cp-f"><b>${esc(f.label)}</b>${table((f.labels || f.columns || []).map((c, i) => ({ label: c, width: ws[i] })), marked)}</div>`;
  }
  if (!String(v ?? '').trim()) return '';
  if (f.issue) return `<div class="cp-f cp-flag"><b>${esc(f.label)}</b>${paras(v)}${REV(f.issue)}</div>`;
  if (f.type === 'select') return `<div class="cp-f"><b>${esc(f.label)}</b><span class="tag gold">${esc(v)}</span></div>`;
  return `<div class="cp-f"><b>${esc(f.label)}</b>${paras(v)}</div>`;
}

// أبواب الوثيقة: عنوان صغير عربي برقم الفصل وإطاره، ومرساة يقفز إليها الفهرس
// np: القسم يبدأ صفحة جديدة
const anchor = (key, np = false) => `<span class="cp-anchor${np ? ' cp-np' : ''}" id="ch-${esc(key)}"></span>`;
const eyebrow = (s, n) => `الفصل ${n}${DIM_AR[s.dimension] ? ` · إطار ${DIM_AR[s.dimension]}` : ''}${s.optional ? ' · اختياري' : ''}`;

// skip: حقول عُرضت في الميثاق فلا تُكرر في فصل البطاقة
// رسم الفصل في الوثيقة من سجل اللوحات نفسه (visuals.js BOARDS): ما يقرأ فصلًا يُطبع داخله. الجدول والإنفاق لهما موضعاهما
const INLINE = Object.freeze({ wbs: 'wbs', 'milestone-register': 'roadmap', raid: 'risk', 'stakeholder-map': 'stakeholders', 'theory-of-change': 'change', 'benefits-register': 'benefits', governance: 'raci' });
function boardFigures(key, doc, viz) {
  const b = BOARDS.find((x) => x.key === INLINE[key]);
  if (!b || !doc) return '';
  return b.parts(doc, viz).filter((p) => p.svg).map((p) => `<figure class="cp-fig">${p.svg}${p.legend || ''}<figcaption>${esc(p.title || b.title)}</figcaption></figure>`).join('');
}

// متن الفصل: دليله وحقوله ورسومه، بلا فاتحة. يُطبع وحده في صفحته، أو بعد أصله في الصفحة المجمّعة للتأسيسي (displayPages)
function chapterBody(s, skip = null, viz = null, doc = null, gapKeys = null) {
  const info = chapterInfo(s.key);
  let body = info?.why ? `<p class="cp-why">${esc(info.why)}</p>` : '';
  // حقل الميثاق التالف لا يظهر في الميثاق (يُبنى من الصالح)، فيُعرض هنا بعلامته حتى لا يضيع ما كتبه المشارك
  const shown = s.fields.filter((f) => !NEVER_PRINTED.has(f.key) && (!skip?.has(f.key) || f.issue || f.rowIssues?.length));
  if (skip) body += `<p class="cp-ref"><b>الهدف والمشكلة والنطاق والمدة والراعي والمخرجات</b> في ميثاق المبادرة أعلاه. وهنا ما بقي من البطاقة.</p>`;
  for (const f of shown) {
    body += fieldHtml(f);
    const rows = Array.isArray(f.value) ? f.value : [];
    if (s.key === 'wbs' && f.key === 'packages' && !boardFigures('wbs', doc, viz)) body += wbsTree(f.columns, rows);
    if (s.key === 'schedule' && f.key === 'activities') {
      // جانت المتكامل بعلاقاته ومساره الحرج (visuals.js)، وإن لم يُرسم فالمخطط البسيط
      const g = viz ? ganttSvg(viz, { today: null }) : null;
      body += g?.svg ? `<figure class="cp-fig">${g.svg}${ganttLegend()}<figcaption>المخطط الزمني بعلاقات الأنشطة؛ الذهبي على المسار الحرج${g.stats.finish ? ` (${g.stats.finish} يومًا)` : ''}</figcaption></figure>` : gantt(f.columns, rows);
    }
    if ((s.key === 'raid' && f.key === 'items' && !boardFigures('raid', doc, viz)) || (s.key === 'stage-gate' && f.key === 'risks')) body += heatmap(f.columns, rows);
  }
  body += boardFigures(s.key, doc, viz);
  if (gapKeys?.has(s.key)) body += `<p class="cp-ref">ما ينقص هذا الفصل في <a href="#ch-gaps">ملحق «ما ينقص لإكمال الوثيقة»</a>.</p>`;
  return body;
}

// عنوان الصفحة المجمّعة: الفصلان بعنوانيهما، فيبقى كل سؤال مؤسسي ظاهرًا باسم فصله
export const pageTitle = (page) => page.map((s) => s.title).join(' و');

// صفحة الفصل: فصل واحد، أو أصل وتابعه (displayPages). n رقم الصفحة في الوثيقة؛ ولكل فصل مرساته فلا ينكسر رابط إليه.
// skipOf: حقول عُرضت في الميثاق لفصل بعينه
function chapter(page, i, skipOf = () => null, viz = null, doc = null, gapKeys = null, ask = null) {
  const [s, ...rest] = page;
  let body = chapterBody(s, skipOf(s), viz, doc, gapKeys);
  for (const j of rest) body += `${anchor(j.key)}<h3 class="cp-join">${esc(j.title)}</h3>${chapterBody(j, skipOf(j), viz, doc, gapKeys)}`;
  // المرحلة 29: فصل يقابل بابًا في حالة العمل يُفتتح بسؤال صاحب القرار نفسه (decision-questions.js)
  const q = ask ? page.map((x) => chapterQuestion(x.key, ask)).find(Boolean) : null;
  return anchor(s.key, i === 0) + section(eyebrow(s, i + 1), `${i + 1}. ${pageTitle(page)}`, body, q);
}

// ── المتابعة بعد الاعتماد: الخطة المعتمدة وما تحقق منها ──
const pct = (v) => (v == null ? '·' : `${v}%`);
function trackingBlock(t) {
  const s = t.summary;
  const st = t.statuses || {};
  const ms = (t.state?.milestones || []).map((x) => [x.title, x.due || '·', st[x.status] || 'لم يُحدَّث', x.actual || '', x.note || '']);
  const bs = (t.state?.benefits || []).map((x) => [x.title, x.baseline || '·', x.target || '·', x.value ?? '·', x.realization == null ? '·' : `${Math.round(x.realization * 100)}%`]);
  const cps = (s.checkpoints || []).map((c) => raw(`<b>${esc(c.title)}:</b> ${esc((c.status === 'submitted' && c.verify_title) || CHECKPOINT_STATUS_AR[c.status] || '')}`));
  const last = (t.updates || [])[0];
  return section('بعد الاعتماد', 'متابعة التنفيذ والأثر', `
    ${kpis([
      { value: t.health?.[s.health] || s.health_title, label: 'حالة المبادرة', hint: `اليوم ${s.day} من الاعتماد` },
      { value: pct(s.milestones.on_time), label: 'معالم في موعدها', hint: `${s.milestones.done} من ${s.milestones.total} تحققت` },
      { value: pct(s.benefits.realization), label: 'نسبة تحقق المنافع', hint: `${s.benefits.measured} من ${s.benefits.total} مقيسة` },
      { value: s.updates, label: 'تحديث شهري' },
    ])}
    <h3>المعالم</h3>
    ${table([{ label: 'المعلم' }, { label: 'المستهدف', width: '22mm' }, { label: 'الحالة', width: '24mm' }, { label: 'تحقق في', width: '22mm' }, { label: 'ملاحظة' }], ms)}
    <h3>المنافع</h3>
    ${table([{ label: 'المنفعة' }, { label: 'خط الأساس', width: '20mm' }, { label: 'المستهدف', width: '20mm' }, { label: 'الفعلي', width: '20mm' }, { label: 'نسبة التحقق', width: '16mm' }], bs)}
    ${points(cps, '')}
    ${last?.narrative ? callout(`آخر ما كتبه القائد (${last.period})`, last.narrative) : ''}`,
    'الخطة من الوثيقة المعتمدة، والفعلي من تحديثات القائد الشهرية. نسبة التحقق هي ما تحرك من خط الأساس نحو المستهدف، ويؤكد الراعي أرقام نقطتي المراجعة.');
}

// ── ميثاق المبادرة ومسوّغات المبادرة: عرضان مولّدان من الفصول (business-case.js) ──
// الحقول التي يعرضها الميثاق من البطاقة (business-case.js charterData): لا تُكرر في فصل البطاقة
// والبريد لا يُطبع في الوثيقة أصلًا: تُقرأ وتُتداول، والراعي يُعرف بمنصبه ودوره
const NEVER_PRINTED = new Set(['sponsor_email']);
const CHARTER_FIELDS = new Set(['sponsor_email', 'title', 'context', 'host', 'objective', 'problem', 'beneficiaries', 'reach', 'in_scope', 'out_scope', 'start', 'end', 'constraints', 'first_step', 'operator', 'sponsor', 'deliverables']);

function charterBlock(doc) {
  const c = charterData(doc);
  if (!c || !c.rows.length) return '';
  return anchor('charter', true) + section('للقرار · صفحة واحدة', 'ميثاق المبادرة', `
    <table class="cp-charter"><tbody>${c.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    ${c.deliverables ? `<div class="cp-f" style="margin-top:4mm"><b>المخرجات الرئيسة</b>${tableOf(c.deliverables.columns, c.deliverables.rows)}</div>` : ''}`,
  DOC_CHARTER_NOTE_AR);
}

// مسوّغات المبادرة: النقاط هنا، والجداول في فصولها بإحالة إليها، فلا يقرأ صاحب القرار الجدول نفسه مرتين
const TABLE_HOME = { 'الدليل على المشكلة': 'options-analysis', البدائل: 'options-analysis', 'ما يُشترى أو يُتعاقد عليه': 'procurement' };
// pages: صفحات العرض (displayPages)، فالإحالة برقم الصفحة كما في الفهرس والمتن
function caseBlock(doc, pages = displayPages(doc.sections)) {
  // البعد الذي لم تُملأ فصوله لا يُعرض: يُذكر في ملحق ما ينقص
  const cases = businessCase(doc).filter((c) => !c.missing);
  if (!cases.length) return '';
  const secs = doc.sections || [];
  const ref = (t) => {
    const home = secs.find((x) => x.key === TABLE_HOME[t.label]);
    const no = home ? pageNumberOf(pages, home.key) : 0;
    const n = t.rows.length;
    return `<p class="cp-ref"><b>${esc(t.label)}</b> (${n} ${n === 1 ? 'صف' : n === 2 ? 'صفان' : n <= 10 ? 'صفوف' : 'صفًا'}): ${home && no ? `<a href="#ch-${esc(home.key)}">الفصل ${no} «${esc(home.title)}»</a>` : 'في فصله'}.</p>`;
  };
  return anchor('case', true) + section('للقرار · خمسة أسئلة', 'مسوّغات المبادرة', cases.map((c) => `<div class="cp-case"><h3>${esc(c.title)}</h3><small>${esc(c.question)}</small>
    ${points(c.points.map(([k, v]) => raw(`<b>${esc(k)}:</b> ${esc(v)}`)), '')}${c.table ? ref(c.table) : ''}</div>`).join(''),
  'أسئلة يطرحها صاحب القرار قبل التمويل، يجاب عنها من فصول الوثيقة نفسها.');
}

// خطة الانطلاق: أول 90 يومًا، مولّدة من البطاقة والجدول والمعالم والقياس والمخاطر (business-case.js launchPlan)
function launchBlock(doc, { send = false } = {}) {
  const L = DOC_TEXT.launch;
  const l = launchPlan(doc);
  if (!l || l.empty) return '';
  const list = (items, empty) => (items.length ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p class="cp-ref">${esc(empty)}</p>`);
  return anchor('launch', true) + section('للتنفيذ', 'خطة الانطلاق: أول 90 يومًا', `
    <div class="cp-launch">${l.windows.map((w) => `<div><h3>${esc(w.title)}</h3><small>${esc(w.range || L.from)}</small>${list(w.items, L.none)}</div>`).join('')}</div>
    ${points([
      ...l.measure.map((t) => raw(`<b>${esc(L.measure)}:</b> ${esc(t)}`)),
      ...l.watch.map((t) => raw(`<b>${esc(L.watch)}:</b> ${esc(t)}`)),
      l.operator && raw(`<b>${esc(L.operator)}:</b> ${esc(l.operator)}`),
    ].filter(Boolean), '')}
    ${l.missing.length && !send ? `<p class="cp-ref">${esc(L.missing)} ${esc(l.missing.join('، و'))}.</p>` : ''}`,
  L.note);
}

// الفهرس: الأقسام الأمامية، ثم الفصول مجمّعة بمراحل بناء المبادرة، بروابط تقفز إليها، وحالة كل فصل في المسودة
// pages: صفحات العرض (displayPages)؛ الصفحة المجمّعة سطر واحد بعنوانيها ومرساة أصلها
function tocBlock(pages, front) {
  const groups = groupByPhase(pages.map((p) => ({ ...p[0], title: pageTitle(p) })));
  // لا عدّ للحقول الفارغة في الفهرس (قرار المالك 2026-11-24): ما ينقص في ملحقه وحده
  const state = () => '';
  const T = DOC_TEXT.toc;
  // فهرس مؤسسي: عناوين المستويين الأول والثاني وأرقام صفحاتها، بلا عدّ ولا وصف ولا تعليمات واجهة
  return anchor('toc', true) + section(T.eyebrow, T.title, `<div class="cp-toc2">
    <div class="ph"><h3>${esc(T.front)}</h3><ol class="front">${front.map(([k, t]) => `<li><a href="#ch-${k}">${esc(t)}</a><span class="cp-pgno" data-ref="#ch-${k}"></span></li>`).join('')}</ol></div>
    ${groups.map((g, gi) => `<div class="ph"><h3>${gi + 1}. ${esc(DOC_TEXT.phaseTitles[g.key] || g.title)}</h3>
      <ol>${g.items.map((s) => `<li><span class="n">${String(s.n).padStart(2, '0')}</span><a href="#ch-${esc(s.key)}">${esc(s.title)}</a>${state(s)}<span class="cp-pgno" data-ref="#ch-${esc(s.key)}"></span></li>`).join('')}</ol></div>`).join('')}
  </div>`);
}

// ملحق اللوحات المرئية: ما لا يقع في فصل بعينه (visuals.js). يُبنى منه ما اكتملت بياناته وحده
function visualsBlock(viz) {
  const net = networkSvg(viz, { vertical: true, width: 800 });
  if (!net.svg) return '';
  const st = net.stats;
  return anchor('visuals', true) + section('ملحق', 'اللوحات المرئية', `
    <h3>مخطط الشبكة والمسار الحرج</h3>
    ${kpis([{ value: st.activities, label: 'نشاطًا' }, { value: st.finish, label: 'يومًا على المسار الحرج' }, { value: st.critical, label: 'نشاطًا حرجًا' }])}
    <figure class="cp-fig">${net.svg}${networkLegend()}<figcaption>المسار الحرج: ${esc(st.path.join(' ← '))}</figcaption></figure>`,
  DOC_TEXT.visuals.note);
}

// ملحق المراجع (المرحلة 4، وعرضه المجمّع في المرحلة 24): للمستشار والخبير والإدارة وحدهم. يبنيه الخادم في review_levels
// (levelsView في capstone.js) ولا يدخل لقطة الاعتماد ولا ما يصل الراعي أو الجهة، ولا يُرسم إلا بخيار annex صريح.
// مجمّع حسب الإطار: رأس لكل إطار باسمه ومعياره مرة واحدة (فلا يطول صف عن صفحة في الطباعة)، ثم فصوله وموقع كل منها
const STANDING_ORDER = ['required', 'optional', 'kept'];
const STANDING_MARK = Object.freeze({ required: '●', optional: '○', kept: '◆' });
// شارة الموقع (نظير StatusChip): رمز ونص، فتُقرأ في الطباعة بالأبيض والأسود لا باللون وحده
const standingChip = (st) => (CHAPTER_STANDING_AR[st] ? `<span class="cp-chip st-${esc(st)}" data-status="${esc(st)}"><i aria-hidden="true">${STANDING_MARK[st]}</i> ${esc(CHAPTER_STANDING_AR[st])}</span>` : '·');
// مقياس المستوى (نظير Meter): خطوة المستوى من ثلاث
function levelMeter(level) {
  const l = LEVEL_LIST.find((x) => x.key === level);
  if (!l) return '';
  const max = LEVEL_LIST.length;
  return `<span class="cp-meter" role="meter" aria-valuemin="1" aria-valuemax="${max}" aria-valuenow="${l.step}" aria-valuetext="${l.step} من ${max}" aria-label="مستوى الوثيقة: ${esc(l.title)}، ${l.step} من ${max}">${LEVEL_LIST.map((x) => `<i class="${x.step <= l.step ? 'on' : ''}"></i>`).join('')}<b>${esc(l.title)}</b><small class="cp-meter-num">${l.step} من ${max}</small></span>`;
}
const ANNEX_STYLE = `<style>
.cp-annex-tag { display: inline-block; border: 1px solid currentColor; padding: .4mm 2mm; font-size: 8pt; margin: 0 0 2mm; }
.cp-chip { display: inline-block; white-space: nowrap; border: 1px solid #9a9a9a; border-radius: 2mm; padding: 0 1.6mm; font-size: 8pt; }
.cp-chip i { font-style: normal; }
.cp-meter { display: inline-flex; align-items: center; gap: .8mm; vertical-align: middle; }
.cp-meter i { display: inline-block; width: 6mm; height: 1.6mm; border: 1px solid #555; }
.cp-meter i.on { background: #555; }
.cp-meter b { margin-inline-start: 1.5mm; font-weight: 500; }
.cp-meter-num { margin-inline-start: 1.5mm; font-size: 8pt; }
.cp-legend { list-style: none; padding: 0; margin: 2mm 0 4mm; display: grid; gap: 1mm; font-size: 8.5pt; }
.cp-fw { break-inside: avoid; margin-top: 5mm; }
.cp-fw h3 { margin: 0 0 1.5mm; font-size: 11pt; }
.cp-fw h3 small { font-weight: 400; }
.cp-empty { border: 1px dashed #9a9a9a; padding: 3mm; text-align: center; }
</style>`;
// حالة التعذر (نظير Empty): طُلب الملحق ولم يصل أو لم يُبنَ، فيظهر للمراجع سطر صريح بدل الاختفاء الصامت
export const levelAnnexEmpty = () => anchor('levels', true) + ANNEX_STYLE + section(REVIEW_ANNEX_AR.title, 'مستوى الوثيقة وموقع كل فصل منه',
  `<p class="cp-annex-tag">${esc(REVIEW_ANNEX_AR.internal)}</p><p class="cp-empty">${esc(REVIEW_ANNEX_AR.failed)}</p>`);
export function levelAnnex(doc) {
  const v = doc?.review_levels;
  if (!v?.chapters?.length || !Array.isArray(v.frameworks)) return '';
  const legend = `<ul class="cp-legend">${STANDING_ORDER.map((st) => `<li>${standingChip(st)} ${esc(CHAPTER_STANDING_NOTE_AR[st])}</li>`).join('')}</ul>`;
  const chapterRows = (chs) => chs.map((c) => [c.title, raw(`${standingChip(c.standing)}${c.kept_fields ? ` <small>(${esc(c.kept_fields)} ${c.kept_fields === 1 ? 'حقل باقٍ' : 'حقول باقية'} مما كتبه)</small>` : ''}`)]);
  const byStanding = (a, b) => STANDING_ORDER.indexOf(a.standing) - STANDING_ORDER.indexOf(b.standing);
  const known = new Set(v.frameworks.map((fw) => fw.dimension));
  // فصول لا إطار لبعدها: تُرسم في كتلة أخيرة بدل أن تسقط من الجدول بصمت
  const orphans = v.chapters.filter((c) => !known.has(c.dimension)).sort(byStanding);
  const groups = v.frameworks.map((fw) => {
    const chs = v.chapters.filter((c) => c.dimension === fw.dimension)
      .sort((a, b) => STANDING_ORDER.indexOf(a.standing) - STANDING_ORDER.indexOf(b.standing));
    if (!chs.length) return '';
    // مستوى الإطار في رأسه حين يختلف عن مستوى الوثيقة وحده
    const lvl = fw.level && fw.level !== v.level && LVL[fw.level] ? ` <small>· مستواه ${esc(LVL[fw.level])}</small>` : '';
    const crit = (fw.criteria || []).length ? table([{ label: 'البعد', width: '40mm' }, { label: `وصف الدرجة ${RUBRIC_MAX}` }], fw.criteria.map((r) => [r.title, r.anchor])) : '';
    const rows = chapterRows(chs);
    return `<div class="cp-fw" data-dimension="${esc(fw.dimension)}"><h3>${esc(DIM_AR[fw.dimension] || fw.dimension)}${lvl}</h3>${crit}${table([{ label: 'الفصل' }, { label: 'موقعه', width: '58mm' }], rows)}</div>`;
  }).join('') + (orphans.length ? `<div class="cp-fw" data-dimension="other"><h3>فصول أخرى</h3>${table([{ label: 'الفصل' }, { label: 'موقعه', width: '58mm' }], chapterRows(orphans))}</div>` : '');
  if (!groups) return levelAnnexEmpty();
  return anchor('levels', true) + ANNEX_STYLE + section(REVIEW_ANNEX_AR.title, 'مستوى الوثيقة وموقع كل فصل منه', `
    <p class="cp-annex-tag">${esc(REVIEW_ANNEX_AR.internal)}</p>
    ${v.live ? '<p class="cp-p"><b>الحالة الآن:</b> الوثيقة معتمدة وتُعرض من نسختها المعتمدة، وهذا الملحق من حالة فصولها الآن لا من تلك النسخة.</p>' : ''}
    ${LVL[v.level] ? `<p class="cp-p">مستوى الوثيقة: ${levelMeter(v.level)}. يُقرأ كل فصل بمستوى القائد في إطاره، وتُقرأ درجته بمعيار ذلك المستوى.</p>` : ''}
    ${legend}${groups}`);
}

// ملحق «ما ينقص لإكمال الوثيقة»: الفصل والحقل والسبب، بدل «لم يُملأ» في المتن (doc-quality.js cleanDoc)
export function gapsBlock(gaps) {
  if (!gaps?.length) return '';
  return anchor('gaps', true) + section('ملحق', 'ما ينقص لإكمال الوثيقة', `<table class="cp-gaps"><thead><tr><th style="width:30%">الفصل</th><th style="width:30%">الحقل</th><th>ما ينقصه</th></tr></thead><tbody>${
    gaps.map((g, i) => `<tr><td class="ch">${i && gaps[i - 1].chapter === g.chapter ? '' : esc(g.chapter)}</td><td>${esc(g.field)}</td><td class="why">${esc(g.reason_ar)}${g.value ? `<br><q>${esc(g.value)}</q>` : ''}</td></tr>`).join('')}</tbody></table>`,
  'ما لم يُكتب أو كُتب بما لا يصلح للعرض. أكمله في فصله فيظهر في الوثيقة ويختفي من هنا.');
}

// مسرد ملحق: المصطلحات التي وردت في هذه الوثيقة وحدها، من مسرد واحد (anatomy.json)
function glossaryBlock(doc) {
  const txt = [doc.summary, ...(doc.sections || []).flatMap((s) => [s.title, ...(s.fields || []).flatMap((f) => [f.label, ...(f.columns || []), ...(Array.isArray(f.value) ? f.value.flat() : [f.value])])])].join(' \n ');
  const terms = termsIn(txt);
  if (!terms.length) return '';
  return anchor('glossary', true) + section('ملحق', 'مسرد المصطلحات', `<table class="cp-gloss"><tbody>${terms.map((g) => `<tr><th>${esc(g.term)}</th><td>${esc(g.def)}</td></tr>`).join('')}</tbody></table>`,
    'المصطلحات التي وردت في هذه الوثيقة بمعناها في البرنامج.');
}

// ── المرحلة الخامسة: سجل قرارات البوابات وتقرير الإغلاق (closure.js) ──
function decisionsBlock(list) {
  if (!Array.isArray(list) || !list.length) return '';
  return section('السجل', 'سجل قرارات البوابات', table([{ label: 'التاريخ', width: '30mm' }, { label: 'البوابة', width: '34mm' }, { label: 'القرار' }, { label: 'من', width: '24mm' }],
    list.map((x) => [fmt(x.at), x.gate, x.decision, x.by])), DOC_TEXT.decisions.note);
}

function closureBlock(doc) {
  const c = closureData(doc);
  if (!c) return '';
  const pct = (v) => (v == null ? '·' : `${v}%`);
  return section('الإغلاق', `تقرير إغلاق المبادرة (${c.status})`, `
    ${kpis([
      { value: `${c.delivered.done} من ${c.delivered.total}`, label: 'معالم تحققت', hint: c.delivered.on_time != null ? `${c.delivered.on_time}% في موعدها` : '' },
      { value: pct(c.realization), label: 'نسبة تحقق المنافع' },
      { value: c.sponsor || '·', label: 'مراجعة اليوم 180' },
    ])}
    ${c.benefits.length ? `<h3>ما تحقق من المنافع</h3>${table([{ label: 'المنفعة' }, { label: 'خط الأساس', width: '22mm' }, { label: 'المستهدف', width: '22mm' }, { label: 'الفعلي', width: '22mm' }, { label: 'نسبة التحقق', width: '18mm' }],
      c.benefits.map((b) => [b.title, b.baseline ?? '·', b.target ?? '·', b.value ?? '·', pct(b.pct)]))}` : ''}
    <h3>ما لم يتحقق ولماذا</h3>
    ${points([
      ...c.open.map((t) => raw(`<b>معلم لم يكتمل:</b> ${esc(t)}`)),
      ...c.dropped.map((t) => raw(`<b>معلم أُسقط:</b> ${esc(t)}`)),
      c.not_achieved && raw(`<b>تفسير القائد:</b> ${esc(c.not_achieved)}`),
    ].filter(Boolean), 'تحقق كل ما خُطط له.')}
    <h3>التشغيل بعد المبادرة</h3>
    ${points([c.operator && raw(`<b>من يشغّل:</b> ${esc(c.operator)}`), c.handover && raw(`<b>التسليم والتسلم:</b> ${esc(c.handover)}`), c.sustain && raw(`<b>ما يحمي المنافع:</b> ${esc(c.sustain)}`)].filter(Boolean), 'لم يُكتب بعد.')}
    ${c.lessons.length ? `<h3>الدروس</h3>${points(c.lessons)}` : ''}`,
  'يُبنى من الوثيقة المعتمدة والمتابعة وفصلي تقرير الأثر وقصة التحول، فلا يُكتب مرتين. يصير نهائيًا حين يؤكد الراعي مراجعة اليوم 180 أو تنتهي المتابعة.');
}

// ── الوثيقة ──
// doc: { meta, summary, sections, cost, checks, review, sponsor, rubric, tracking? }
// الترتيب: نظرة أولى والملخص لصاحب القرار، ثم الفهرس، ثم الميثاق وحالة العمل وخطة الانطلاق، ثم الفصول بتفصيلها، ثم الملاحق.
// مكان المبادرة في الغلاف: الجهة المستضيفة من البطاقة، وإلا سياق تنفيذها، وإلا لا صف.
// لا جهة ملف المشارك: تلك راعية البرنامج لا مالكة المبادرة (anatomy.json writing_rules، القاعدة 6)
export function placeRow(m) {
  if (m?.host) return [['الجهة المستضيفة', m.host]];
  if (m?.context) return [['سياق التنفيذ', m.context]];
  return [];
}

// appendix: ملحق «ما ينقص» وختم «مسودة عمل» للقراءة الداخلية وحدها (المشارك والإدارة)
// اسم ملف PDF بالعربية يدل على محتواه (قرار المالك 2026-11-24): «وثيقة-المبادرة-<اسم المبادرة>-<تاريخ الإصدار>».
// ملف العمل الكامل يُسمّى باسمه فلا يُخلط بالوثيقة المؤسسية. التاريخ بأرقام لاتينية (YYYY-MM-DD)
const PDF_PREFIX = { institutional: 'وثيقة-المبادرة', working: 'ملف-عمل-المبادرة', draft: 'مسودة-وثيقة-المبادرة' };
// kind: 'institutional' الوثيقة المؤسسية، 'working' ملف العمل بملحقه، 'draft' ملف العمل بلا ملحق (قارئ قبل الاعتماد)
export function pdfFileName(m = {}, kind = 'institutional', now = new Date()) {
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // تنظيف قبل البديل: محارف الاتجاه الخفية، وما لا يصلح في اسم ملف، ثم قص بنقاط الترميز لا بوحدات UTF-16 فلا يُشطر حرف
  const clean = (v) => [...String(v ?? '').replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().replace(/\s+/g, '-')]
    .slice(0, 60).join('').replace(/-+$/, '');
  const name = clean(m.initiative) || clean(m.ref) || 'المبادرة';
  // رقم الوثيقة وإصدارها لاحقة قصيرة: نسختان في اليوم نفسه لا تتطابقان اسمًا
  const tag = clean(`${String(m.ref || '').replace(/^MI-CP-/, '')}${m.version ? `-V${m.version}` : ''}`).replace(/^-+/, '');
  return [PDF_PREFIX[kind] || PDF_PREFIX.institutional, name, ymd, tag].filter(Boolean).join('-');
}

// «impact-advanced» ← «الأثر: مستوى احترافي»؛ مفتاح غير معروف لا يُعرض
const profileHint = (profile) => {
  const [dim, lv] = String(profile || '').split('-');
  return DIM_AR[dim] && LVL[lv] ? `${DIM_AR[dim]}: مستوى ${LVL[lv]}` : '';
};

// الملخص التنفيذي من execSummary (business-case.js). glance: مؤشرات «المبادرة في سطور» تُعرض معه في صفحة واحدة
function summaryBlock(doc, { example, approved, send, glance, funding }) {
  const S = DOC_TEXT.summary;
  const x = execSummary(doc);
  // التاريخ بصيغة عربية واحدة في الوثيقة كلها (dateAr): «4 يناير 2026» كما في الغلاف والنظرة العامة
  const d0 = x.start ? dateAr(x.start) : '', d1 = x.end ? dateAr(x.end) : '';
  const period = d0 || d1 ? `${d0 ? `<bdi class="num">${esc(d0)}</bdi>` : ''}${d0 && d1 ? ' إلى ' : d1 ? 'حتى ' : ''}${d1 ? `<bdi class="num">${esc(d1)}</bdi>` : ''}` : '';
  const periodTxt = d0 && d1 ? `من ${d0} إلى ${d1}` : '';
  // المشكلة في الملخص جملة واحدة، ونصها كاملًا في بابها
  const problem1 = x.problem ? (String(x.problem).match(/^[\s\S]*?[.؟!](?=\s|$)/)?.[0] || x.problem).trim() : null;
  // الراعي في الملخص بصفته وحدها (ما قبل النقطتين)، ووصف مسؤوليته في باب الحوكمة
  const sponsor1 = x.sponsor ? `${String(x.sponsor).split(/[:：]/)[0].trim().replace(/[.،\s]+$/, '')}.` : null;
  const amount = x.cost && x.cost.kind !== 'envelope' ? money(x.cost.value) : null;
  const rec = example ? null : docRecommendAr({ amount, operator: x.operator, period: periodTxt, firstStep: x.firstStep });
  const costLbl = x.cost ? (x.cost.kind === 'withContingency' ? S.costTotal : x.cost.kind === 'envelope' ? S.envelope : S.cost) : '';
  const pend = (ch) => (send || example ? null : raw(`<span class="cp-ref">${esc(S.pending(ch))}</span>`));
  const row = (label, html, ch) => (html ? raw(`<b>${esc(label)}:</b> ${html}`) : ch ? (pend(ch) && raw(`<b>${esc(label)}:</b> ${pend(ch).html}`)) : null);
  const items = [
    rec && raw(`<b>${esc(S.recommend)}:</b> ${esc(rec)}`),
    row(S.problem, problem1 && esc(problem1), 'ميثاق المبادرة'),
    row(S.value, x.benefits.length && esc(x.benefits.map((b) => `${b.title}${b.target ? ` (المستهدف ${b.target})` : ''}`).join('؛ ')), 'سجل المنافع'),
    row(costLbl || S.cost, x.cost && `${esc(money(x.cost.value))}${x.cost.contingency && x.cost.kind === 'withContingency' ? ` مع احتياطي ${esc(x.cost.contingency)}%` : ''}${funding ? `، من ${esc(funding)}` : ''}`, 'خطة التكلفة'),
    row(S.period, period, 'الجدول الزمني'),
    sponsor1 && raw(`<b>${esc(S.sponsor)}:</b> ${esc(sponsor1)}`),
  ].filter(Boolean);
  const draft = approved || example || send ? '' : `<p class="cp-draft">${esc(DOC_TEXT.draftNotice)}</p>`;
  // نسخة الإرسال: الوصف فقرة افتتاحية بلا صندوق يكرر عنوان الصفحة
  const lead = !x.summary ? '' : send ? `<p class="cp-p cp-lead" style="margin-top:5mm">${esc(x.summary)}</p>` : callout(example ? 'عن المثال' : DOC_SUMMARY_AR, x.summary);
  return section(S.eyebrow, S.title, `${glance}${lead}${points(items, '')}${draft}`);
}

// appendix: ملحق «ما ينقص». annex: ملحق المراجع، بطلب صريح وحده (المرحلة 21). final: تحميل الأدمن للنهائية، فغير المعتمدة بختم ظاهر
// qr: رمز التحقق في المعتمدة (المرحلة 32)، بالبصمة المجمّدة وحدها كما في المؤسسية
// send: نسخة الإرسال (final بلا ملحق ما ينقص): وثيقة خارجية لا تحمل أدوات العمل (صندوق المسودة، الفحوص الآلية، سجل البوابات،
// علامات «يحتاج مراجعة»)، وأقسامها من قائمة السماح SEND_SECTIONS وحدها، وختم واحد على الغلاف DOC_SEND_STAMP_AR
export function capstoneReport(input, { appendix = true, annex = false, final = false, qr = true } = {}) {
  const send = final && !appendix;
  const allow = (k) => !send || SEND_SECTIONS.includes(k);
  // ملف العمل الكامل: المشتق (الغلاف والميثاق وحالة العمل والمؤشرات) من القيم الصالحة، والفصول بكل ما كُتب
  // وتالفه معلَّم «يحتاج مراجعة»، وما ينقص في ملحقه. المثال المحلول يُعرض كما هو
  const exampleIn = !!input?.meta?.example;
  const { doc, gaps } = exampleIn ? { doc: input, gaps: [] } : cleanDoc(input);
  const annotated = exampleIn ? input : send ? doc : cleanDoc(input, { keep: true }).doc;
  const gapKeys = new Set(gaps.map((g) => g.chapter_key));
  const m = doc.meta || {};
  const secs = doc.sections || [];
  const approved = m.status === 'approved';
  // مثال محلول (guide.js): وثيقة تعليمية كاملة، بلا تنبيه المسودة ولا فحوص ولا اعتماد
  const example = !!m.example;
  const count = (key, field) => ((secs.find((s) => s.key === key)?.fields || []).find((f) => f.key === field)?.value || []).filter(filled).length;
  const funding = ((secs.find((s) => s.key === 'cost-plan')?.fields || []).find((f) => f.key === 'funding')?.value || '').trim();

  let body = STYLE;
  // المؤشر الصفري أو الفارغ لا يُعرض («0 ريال»، «0 حزمة عمل»، «النوع ·»)
  const tiles = [
    // ملف التعريف (trackManifest): إطار الأولوية ومستوى المشارك فيه، لا مستوى ملخص (قرار المالك 2026-11-25)
    m.scope_title && { value: m.scope_title, label: 'النوع', hint: profileHint(m.profile) },
    count('wbs', 'packages') > 0 && { value: count('wbs', 'packages'), label: 'حزمة عمل' },
    doc.cost?.withContingency > 0 && { value: money(doc.cost.withContingency), label: costLabel(doc.cost) },
    count('benefits-register', 'benefits') > 0 && { value: count('benefits-register', 'benefits'), label: 'منفعة مقيسة' },
    // الجاهزية مقياس عمل داخلي: تُعرض حين تحملها الوثيقة فقط، والنسخ الخارجة من المنصة بلا جاهزية إلا بإذن (withoutReadiness)
    m.readiness != null && { value: `${m.readiness}%`, label: 'الجاهزية' },
  ].filter(Boolean);
  const glance = tiles.length ? kpis(tiles) : '';

  // الملخص لصاحب القرار (execSummary مصدره الواحد): التوصية أولًا، ثم المشكلة والمنافع والكلفة والمدة والراعي.
  // ما لا بيانات له لا يُعرض في نسخة الإرسال، ويُشار في ملف العمل إلى فصله. الملخص الشحيح يُدمج بـ«المبادرة في سطور» فلا صفحة شبه فارغة
  body += summaryBlock(doc, { example, approved, send, glance, funding });

  const pages = displayPages(secs);
  const charter = charterBlock(doc), bcase = caseBlock(doc, pages), launch = launchBlock(doc, { send });
  const viz = scheduleModel(doc);
  const visuals = visualsBlock(viz);
  const gapsHtml = example || !appendix ? '' : gapsBlock(gaps);
  const front = [charter && ['charter', 'ميثاق المبادرة'], bcase && ['case', 'مسوّغات المبادرة'], launch && ['launch', 'خطة الانطلاق'], visuals && ['visuals', 'اللوحات المرئية'], ['glossary', 'مسرد المصطلحات'], gapsHtml && ['gaps', 'ما ينقص لإكمال الوثيقة']].filter(Boolean);
  body += tocBlock(pages, front);
  body += charter + bcase + launch;

  // الفصول بصفحات العرض: للتأسيسي يُجمع الفصلان القصيران في صفحة (displayPages)، والبيانات والجاهزية كما هي
  const marked = new Map(secs.map((s, i) => [s.key, annotated.sections[i] || s]));
  // أسئلة صاحب القرار لملف عمل وثيقته «حالة العمل» وحدها، بمستوى المشارك كما في النسخة المؤسسية
  const ask = formOfDoc(doc).key === 'case' ? caseQuestions(m) : null;
  pages.forEach((page, i) => {
    body += chapter(page.map((s) => marked.get(s.key) || s), i, (s) => (s.key === 'initiative-charter' && charter ? CHARTER_FIELDS : null), viz, doc, appendix ? gapKeys : null, ask);
    if (page.some((s) => s.key === 'cost-plan') && doc.cost?.total > 0) body += section('ملخص', 'ملخص التكلفة', costBlock(doc.cost, doc));
  });

  body += visuals;

  if (!send && !approved && !example && (doc.checks || []).length) {
    body += section('فحوص آلية', 'فحوص الاتساق بين الفصول', `<ul class="cp-check">${doc.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${esc(c.title)}${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</li>`).join('')}</ul>`,
      DOC_TEXT.checks.note);
  }

  if (doc.review) {
    const r = doc.review;
    const rows = (doc.rubric || []).map((x) => [
      raw(`${esc(x.title)}${x.dimension === r.priority ? ` <span class="tag gold">الوزن ×${PRIORITY_WEIGHT}</span>` : ''}`),
      `${r.scores?.[x.key] ?? '·'} من ${RUBRIC_MAX}`, r.notes?.[x.key] || '',
    ]);
    body += section('التقييم', 'تقييم المستشار', `
      <p class="cp-score"><b>${esc(r.score ?? '·')}</b><span>من 100</span></p>
      ${table([{ label: 'البعد' }, { label: 'الدرجة', width: '18mm' }, { label: 'الملاحظة' }], rows)}
      ${r.note ? callout('خلاصة المستشار', r.note) : ''}`, r.priority ? `معيار من ${RUBRIC.length} أبعاد، وأبعاد الإطار ذي الأولوية في مسار القائد وزنها ×${PRIORITY_WEIGHT}.` : `معيار من ${RUBRIC.length} أبعاد بوزن واحد، لتساوي مستويات القائد في الأطر الثلاثة.`);
  }

  const mark = example ? null : verifyMark(input, { qr, appUrl: m.app_url });
  if (approved) {
    const sp = doc.sponsor;
    body += section('الاعتماد', 'الاعتماد', `
      <p><span class="cp-stamp">معتمدة · ${esc(fmt(m.approved_at))}</span></p>
      ${points([
        raw(`<b>المستشار:</b> راجع الوثيقة وقبلها بمعيار التقييم.`),
        sp?.status === 'endorsed' ? raw(`<b>الراعي${sp.name ? `، ${esc(sp.name)}` : ''}:</b> أيّد المبادرة في ${esc(fmt(sp.at))}${sp.note ? `، وكتب: «${esc(sp.note)}»` : ''}.`)
          : raw('<b>الراعي:</b> اعتُمدت بقرار فريق البرنامج دون تأييد الراعي.'),
      ], '')}
      ${mark ? VERIFY_STYLE + mark.html : ''}`);
  }

  if (approved && doc.tracking?.summary) body += trackingBlock(doc.tracking);
  body += closureBlock(doc);
  // سجل البوابات أثر تدقيق داخلي: في ملف العمل والنسخة الكاملة، ولا يخرج في نسخة الإرسال
  if (!example && allow('decisions')) body += decisionsBlock(doc.decisions);
  body += glossaryBlock(doc);
  body += gapsHtml;
  if (annex) body += levelAnnex(doc) || levelAnnexEmpty();

  return {
    meta: {
      id: `${m.ref || 'MI-CP'}-V${m.version || 1}`, kind: 'CP', kindLabel: send ? 'وثيقة المبادرة' : 'Initiative Document',
      // نسخة الإرسال: تسمية الرقم المرجعي على الغلاف بالعربية، ولا وسم لاتيني فوق العنوان
      ...(send ? { refLabel: DOC_TEXT.send.docNo } : {}),
      footer: footerLine(`${m.ref || 'MI-CP'}-V${m.version || 1}`, mark?.fingerprint), pageAr: true, selfFonts: true,
      // ملف العمل بملحقه لمن يعمل عليها؛ وبلا ملحق (القارئ قبل الاعتماد) يُسمّى «وثيقة المبادرة»
      pdfName: pdfFileName(m, example ? 'institutional' : appendix ? 'working' : 'draft'),
      // شعار الجهة ولونها على الغلاف وترويسة الصفحات (doc.js)، كما في الوثيقة المؤسسية
      ...(example ? {} : { brand: { name: m.org?.name || null, logo: m.org?.logo || null, color: m.org?.color || null } }),
      eyebrow: example ? 'Leaders Program · Worked example' : send ? 'برنامج القادة' : 'Leaders Program · Capstone', title: m.initiative || 'وثيقة المبادرة',
      subtitle: example ? `مثال محلول لقطاع ${m.org?.name || ''}: هكذا تبدو وثيقة مبادرة مكتملة` : send ? DOC_TEXT.sendSubtitle(m.scope_title) : `وثيقة المبادرة${m.scope_title ? ` (${m.scope_title})` : ''}، أُعدّت في برنامج القادة${m.track?.title ? ` · ${m.track.title}` : ''}`,
      rows: [['قائد المبادرة', m.participant?.name || '·'], ...placeRow(m), ['الدفعة', m.cohort || '·'], ...(send ? [] : [['الحالة', m.status_title || '·']])].filter(([k, v]) => v !== '·' || k === 'قائد المبادرة'),
      // ختم «مسودة عمل» في الغلاف لكل ما لم يُعتمد (doc.js meta.stamp)
      stamp: approved || example ? null : send ? DOC_SEND_STAMP_AR : final ? DOC_LIVE_AR : !appendix ? null : DOC_WORKING_AR,
      confidential: example ? 'مثال تعليمي: مبادرة وجهة وأشخاص افتراضيون' : CONFIDENTIAL_AR, rights: example ? undefined : DOC_RIGHTS_AR,
      closing: example
        ? 'مثال محلول للتعلم منه لا للنقل: اكتب مبادرتك من واقع تعرفه، وقارن بنيتها بهذا المثال.'
        : approved
        ? 'وثيقة معتمدة. تُعرض من نسختها المحفوظة لحظة الاعتماد، فلا يغيّرها تعديل لاحق.'
        : send ? DOC_TEXT.sendClosing
        : 'نسخة عمل تُبنى آليًا من فصول المبادرة لحظة إصدارها.',
    },
    body,
  };
}

/** الوثيقة بلا نسبة الجاهزية: لكل نسخة تخرج من المنصة (تنزيل المشارك وطباعته، ورابط الراعي). قرار المالك 2026-11-24 */
export const withoutReadiness = (doc) => (doc?.meta ? { ...doc, meta: { ...doc.meta, readiness: null } } : doc);
