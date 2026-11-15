// ════════════════════════════════════════════════════════════════
// وثيقة المبادرة (مشروع التخرج): قالب الطباعة الاحترافي
// ════════════════════════════════════════════════════════════════
// قالب واحد يفتحه المشارك والمستشار والراعي والجهة، من وثيقة يبنيها الخادم
// (capstone.doc / admin.capstone / sponsor.get / coord.capstone). يبني على
// محرك الوثائق doc.js فتخرج بالهوية نفسها، ويضيف رسوم الوثيقة: شجرة هيكل
// التجزئة، والمخطط الزمني، وخريطة المخاطر، وملخص التكلفة.
import { bars, callout, esc, kpis, points, raw, section, table } from './doc.js';
import { parseDate, parseNumber, PRIORITY_WEIGHT, RISK_HIGH, RISK_MID, RUBRIC, RUBRIC_MAX } from '../../../supabase/functions/leaders-api/capstone.js';
import { CHECKPOINT_STATUS_AR } from '../../../supabase/functions/leaders-api/tracking.js';

import { DIM_AR, LEVEL_AR as LVL } from '../../../supabase/functions/leaders-api/labels.js';
import { businessCase, charterData, launchPlan } from '../../../supabase/functions/leaders-api/business-case.js';
import { chapterInfo, groupByPhase, termsIn } from '../../../supabase/content/initiative-guide/v1/anatomy.js';
import { closureData } from '../../../supabase/functions/leaders-api/closure.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : '·');
const money = (n) => (n == null ? '·' : `${Math.round(n).toLocaleString('en-US')} ريال`);
const filled = (r) => Array.isArray(r) && r.some((c) => String(c || '').trim());
const paras = (t) => String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `<p class="cp-p">${esc(x)}</p>`).join('');

// ── رسوم الوثيقة ──
const STYLE = `<style>
.cp-p { margin: 0 0 2mm; font-size: 9.6pt; line-height: 1.9; color: #2C4148; }
.cp-f { margin: 0 0 4mm; break-inside: avoid; }
.cp-f > b { display: block; font-weight: 400; font-size: 8.4pt; color: #5F7176; margin-bottom: 1mm; }
.cp-toc { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 10mm; }
.cp-toc li { display: flex; gap: 3mm; padding: 1.6mm 0; border-bottom: 1px solid #EEF1F0; font-size: 9.4pt; break-inside: avoid; }
.cp-toc li span { font: 300 8pt "Noto Sans", sans-serif; color: #A97A2E; min-width: 7mm; }
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
.cp-heat { display: grid; grid-template-columns: 8mm repeat(5, 1fr); gap: 1px; width: 92mm; font: 300 7.5pt "Noto Sans", sans-serif; direction: ltr; }
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
.cp-draft { border: 1px dashed #5F7176; color: #5F7176; padding: 3mm 5mm; border-radius: 2px; font-size: 9pt; margin-top: 6mm; }
.cp-score b { font: 200 30pt/1 "Noto Sans", sans-serif; } .cp-score span { color: #5F7176; font-size: 9pt; margin-inline-start: 2mm; }
.cp-break { break-before: page; }
.cp-charter { width: 100%; border-collapse: collapse; font-size: 8.9pt; }
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
/* صفحات تبدأ من أعلى الورقة: الفهرس، والميثاق، وحالة العمل، وخطة الانطلاق، وأول الفصول، والملاحق. قاعدة واحدة تحكم الطباعة وملف PDF (pdf.js) */
.cp-np + .sec { break-before: page; }
.cp-why { break-after: avoid; }
.tbl thead { break-after: avoid; }
.kpis, .cp-case, .cp-launch > div, .cp-toc2 li, .cp-charter tr, .cp-gloss tr, .points li, .cp-check li, .cp-tree li { break-inside: avoid; }
/* رقم الصفحة في الفهرس: مكانه محجوز في الملف وحده، يكتبه pdf.js بعد تقسيم الصفحات */
.cp-pgno { display: none; }
html.pdf .cp-pgno { display: inline-block; min-width: 7mm; text-align: left; font: 300 8pt "Noto Sans", sans-serif; color: #5F7176; }
.cp-anchor { display: block; height: 0; }
.cp-toc2 { display: grid; gap: 3mm; }
.cp-toc2 .ph { break-inside: avoid; }
.cp-toc2 .ph > h3 { margin: 0 0 1mm; font-weight: 400; font-size: 10pt; display: flex; gap: 2mm; align-items: baseline; }
.cp-toc2 .ph > h3 small { color: #5F7176; font-size: 7.6pt; font-weight: 300; }
.cp-toc2 .ph > p { margin: 0 0 1.4mm; color: #5F7176; font-size: 7.8pt; }
.cp-toc2 ol { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 8mm; }
.cp-toc2 li { break-inside: avoid; border-bottom: 1px solid #EEF1F0; padding: 1.3mm 0; font-size: 9pt; display: flex; gap: 2.5mm; align-items: baseline; }
.cp-toc2 li a { color: inherit; text-decoration: none; flex: 1; }
.cp-toc2 li span.n { font: 300 8pt "Noto Sans", sans-serif; color: #A97A2E; min-width: 6mm; }
.cp-toc2 li i { font-style: normal; font-size: 7pt; color: #5F7176; white-space: nowrap; }
.cp-toc2 li i.no { color: #8A6424; }
.cp-toc2 .front { columns: 1; display: flex; flex-wrap: wrap; gap: 0 6mm; }
.cp-toc2 .front li { border: 0; padding: .6mm 0; }
.cp-ref { font-size: 8.4pt; color: #5F7176; margin: 1mm 0 0; }
.cp-ref b { font-weight: 400; color: #2C4148; }
.cp-why { margin: -2mm 0 4mm; color: #5F7176; font-size: 8.4pt; }
.cp-launch { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-top: 1px solid #A97A2E; margin-bottom: 4mm; }
.cp-launch > div { padding: 3mm 3mm 3mm 0; border-inline-start: 1px solid #DCE2E1; padding-inline-start: 3mm; break-inside: avoid; }
.cp-launch > div:first-child { border-inline-start: 0; padding-inline-start: 0; }
.cp-launch h3 { margin: 0; font-weight: 400; font-size: 10pt; }
.cp-launch small { display: block; color: #5F7176; font-size: 7.4pt; margin-bottom: 2mm; }
.cp-launch ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 1.6mm; }
.cp-launch li { font-size: 8.6pt; line-height: 1.7; color: #2C4148; padding-inline-start: 3.5mm; position: relative; }
.cp-launch li::before { content: ''; position: absolute; inset-inline-start: 0; top: 2.2mm; width: 1.4mm; height: 1.4mm; background: #A97A2E; transform: rotate(45deg); }
.cp-gloss { width: 100%; border-collapse: collapse; font-size: 8.6pt; }
.cp-gloss th { width: 34mm; text-align: start; vertical-align: top; font-weight: 400; padding: 1.6mm 0; border-bottom: 1px solid #EEF1F0; color: #0B272F; }
.cp-gloss td { padding: 1.6mm 0 1.6mm 2mm; border-bottom: 1px solid #EEF1F0; color: #2C4148; line-height: 1.7; }
.cp-gloss tr { break-inside: avoid; }
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

// خريطة المخاطر: الاحتمال × الأثر من 1 إلى 5
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
<div class="cp-legend"><span><i style="background:#E1BE85"></i>عالٍ (${RISK_HIGH} فأكثر)</span><span><i style="background:#F2E6D0"></i>متوسط</span><span><i style="background:#EEF1F0"></i>منخفض</span><span>المحور الرأسي: الاحتمال · الأفقي: الأثر</span></div>
<figcaption>خريطة المخاطر: عدد البنود في كل خانة</figcaption></figure>`;
}

function costBlock(cost) {
  if (!cost) return '';
  const rows = Object.entries(cost.by || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ label: k, value: Math.round(v) }));
  return `${kpis([
    { value: money(cost.total), label: 'التكلفة التقديرية' },
    { value: `${cost.contingency || 0}%`, label: 'الاحتياطي' },
    { value: money(cost.withContingency), label: 'مع الاحتياطي' },
    { value: money(cost.envelope), label: 'الميزانية المتاحة', hint: cost.envelope != null ? (cost.withContingency <= cost.envelope ? 'ضمن الميزانية' : 'تتجاوز الميزانية') : '' },
  ])}${rows.length > 1 ? `<div class="cp-fig">${bars(rows, Math.max(...rows.map((r) => r.value)), { ltr: true })}<p class="cp-legend">التكلفة بحسب رمز الحزمة</p></div>` : ''}`;
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
const tableOf = (columns, rows, empty) => { const ws = columnWidths(columns, rows); return table((columns || []).map((c, i) => ({ label: c, width: ws[i] })), rows, empty); };

function fieldHtml(f) {
  const v = f.value;
  if (f.type === 'table') {
    const rows = (Array.isArray(v) ? v : []).filter(filled);
    return `<div class="cp-f"><b>${esc(f.label)}</b>${tableOf(f.columns, rows, 'لم يُملأ')}</div>`;
  }
  if (!String(v ?? '').trim()) return `<div class="cp-f"><b>${esc(f.label)}</b><p class="cp-p muted">لم يُملأ</p></div>`;
  if (f.type === 'select') return `<div class="cp-f"><b>${esc(f.label)}</b><span class="tag gold">${esc(v)}</span></div>`;
  return `<div class="cp-f"><b>${esc(f.label)}</b>${paras(v)}</div>`;
}

// أبواب الوثيقة: عنوان صغير عربي برقم الفصل وإطاره، ومرساة يقفز إليها الفهرس
// np: القسم يبدأ صفحة جديدة
const anchor = (key, np = false) => `<span class="cp-anchor${np ? ' cp-np' : ''}" id="ch-${esc(key)}"></span>`;
const eyebrow = (s, n) => `الفصل ${n}${DIM_AR[s.dimension] ? ` · إطار ${DIM_AR[s.dimension]}` : ''}`;

// skip: حقول عُرضت في الميثاق فلا تُكرر في فصل البطاقة
function chapter(s, i, skip = null) {
  const info = chapterInfo(s.key);
  let body = info?.why ? `<p class="cp-why">${esc(info.why)}</p>` : '';
  const shown = s.fields.filter((f) => !NEVER_PRINTED.has(f.key) && !skip?.has(f.key));
  if (skip) body += `<p class="cp-ref"><b>الهدف والمشكلة والنطاق والمدة والراعي والمخرجات</b> في ميثاق المبادرة أعلاه. وهنا ما بقي من البطاقة.</p>`;
  for (const f of shown) {
    body += fieldHtml(f);
    const rows = Array.isArray(f.value) ? f.value : [];
    if (s.key === 'wbs' && f.key === 'packages') body += wbsTree(f.columns, rows);
    if (s.key === 'schedule' && f.key === 'activities') body += gantt(f.columns, rows);
    if ((s.key === 'raid' && f.key === 'items') || (s.key === 'stage-gate' && f.key === 'risks')) body += heatmap(f.columns, rows);
  }
  return anchor(s.key, i === 0) + section(eyebrow(s, i + 1), `${i + 1}. ${s.title}`, body);
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
      { value: pct(s.benefits.realization), label: 'تحقق المنافع', hint: `${s.benefits.measured} من ${s.benefits.total} مقيسة` },
      { value: s.updates, label: 'تحديث شهري' },
    ])}
    <h3>المعالم</h3>
    ${table([{ label: 'المعلم' }, { label: 'المستهدف', width: '22mm' }, { label: 'الحالة', width: '24mm' }, { label: 'تحقق في', width: '22mm' }, { label: 'ملاحظة' }], ms)}
    <h3>المنافع</h3>
    ${table([{ label: 'المنفعة' }, { label: 'خط الأساس', width: '20mm' }, { label: 'المستهدف', width: '20mm' }, { label: 'الفعلي', width: '20mm' }, { label: 'التحقق', width: '16mm' }], bs)}
    ${points(cps, '')}
    ${last?.narrative ? callout(`آخر ما كتبه القائد (${last.period})`, last.narrative) : ''}`,
    'الخطة من الوثيقة المعتمدة، والفعلي من تحديثات القائد الشهرية. نسبة التحقق هي ما تحرك من خط الأساس نحو المستهدف، ويؤكد الراعي أرقام نقطتي المراجعة.');
}

// ── ميثاق المبادرة وحالة العمل: عرضان مولّدان من الفصول (business-case.js) ──
// الحقول التي يعرضها الميثاق من البطاقة (business-case.js charterData): لا تُكرر في فصل البطاقة
// والبريد لا يُطبع في الوثيقة أصلًا: تُقرأ وتُتداول، والراعي يُعرف بمنصبه ودوره
const NEVER_PRINTED = new Set(['sponsor_email']);
const CHARTER_FIELDS = new Set(['sponsor_email', 'title', 'objective', 'problem', 'in_scope', 'out_scope', 'start', 'end', 'constraints', 'first_step', 'operator', 'sponsor', 'deliverables']);

function charterBlock(doc) {
  const c = charterData(doc);
  if (!c || !c.rows.length) return '';
  return anchor('charter', true) + section('للقرار · صفحة واحدة', 'ميثاق المبادرة', `
    <table class="cp-charter"><tbody>${c.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    ${c.deliverables ? `<div class="cp-f" style="margin-top:4mm"><b>المخرجات الرئيسة</b>${tableOf(c.deliverables.columns, c.deliverables.rows)}</div>` : ''}`,
  'يُولَّد من البطاقة والتكلفة والمنافع والمخاطر، فلا يُكتب مرتين. به يُؤذن بالبدء.');
}

// حالة العمل: النقاط هنا، والجداول في فصولها بإحالة إليها، فلا يقرأ صاحب القرار الجدول نفسه مرتين
const TABLE_HOME = { 'الدليل على المشكلة': 'options-analysis', البدائل: 'options-analysis', 'ما يُشترى أو يُتعاقد عليه': 'procurement' };
function caseBlock(doc) {
  const cases = businessCase(doc);
  if (!cases.length) return '';
  const secs = doc.sections || [];
  const ref = (t) => {
    const i = secs.findIndex((x) => x.key === TABLE_HOME[t.label]);
    const n = t.rows.length;
    return `<p class="cp-ref"><b>${esc(t.label)}</b> (${n} ${n === 1 ? 'صف' : n === 2 ? 'صفان' : n <= 10 ? 'صفوف' : 'صفًا'}): ${i >= 0 ? `<a href="#ch-${esc(secs[i].key)}">الفصل ${i + 1} «${esc(secs[i].title)}»</a>` : 'في فصله'}.</p>`;
  };
  return anchor('case', true) + section('للقرار · خمسة أسئلة', 'حالة العمل', cases.map((c) => `<div class="cp-case"><h3>${esc(c.title)}</h3><small>${esc(c.question)}</small>
    ${c.missing ? `<p class="cp-miss">${esc(c.missing)}</p>` : `${points(c.points.map(([k, v]) => raw(`<b>${esc(k)}:</b> ${esc(v)}`)), '')}${c.table ? ref(c.table) : ''}`}</div>`).join(''),
  'خمسة أسئلة يطرحها صاحب القرار قبل التمويل، يجاب عنها من فصول الوثيقة نفسها.');
}

// خطة الانطلاق: أول 90 يومًا، مولّدة من البطاقة والجدول والمعالم والقياس والمخاطر (business-case.js launchPlan)
function launchBlock(doc) {
  const l = launchPlan(doc);
  if (!l) return '';
  const list = (items, empty) => (items.length ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p class="cp-ref">${esc(empty)}</p>`);
  return anchor('launch', true) + section('للتنفيذ', 'خطة الانطلاق: أول 90 يومًا', l.empty ? `<p class="cp-miss">${esc(l.missing.join('، و'))}، فتظهر هنا خطة أول 90 يومًا.</p>` : `
    <div class="cp-launch">${l.windows.map((w) => `<div><h3>${esc(w.title)}</h3><small>${esc(w.range || 'من تاريخ البداية')}</small>${list(w.items, 'لا شيء مؤرخ في هذه المدة.')}</div>`).join('')}</div>
    ${points([
      ...l.measure.map((t) => raw(`<b>أول قياس:</b> ${esc(t)}`)),
      ...l.watch.map((t) => raw(`<b>راقب من اليوم الأول:</b> ${esc(t)}`)),
      l.operator && raw(`<b>يتسلم بعدك:</b> ${esc(l.operator)}`),
    ].filter(Boolean), '')}
    ${l.missing.length ? `<p class="cp-ref">لتكتمل الخطة: ${esc(l.missing.join('، و'))}.</p>` : ''}`,
  'ما تفعله غدًا: تُولَّد من البطاقة والجدول وسجل المعالم وخطة القياس وسجل المخاطر، فلا تُكتب مرتين.');
}

// الفهرس: الأقسام الأمامية، ثم الفصول مجمّعة بمراحل بناء المبادرة، بروابط تقفز إليها، وحالة كل فصل في المسودة
function tocBlock(doc, front, { draft }) {
  const secs = doc.sections || [];
  const groups = groupByPhase(secs);
  const state = (s) => {
    if (!draft) return '';
    const missing = (s.fields || []).filter((f) => (f.type === 'table' ? !(Array.isArray(f.value) && f.value.some(filled)) : !String(f.value ?? '').trim())).length;
    return missing ? `<i class="no">${missing} ${missing === 1 ? 'حقل فارغ' : missing === 2 ? 'حقلان فارغان' : missing <= 10 ? 'حقول فارغة' : 'حقلًا فارغًا'}</i>` : '<i>مكتمل</i>';
  };
  return anchor('toc', true) + section('الفهرس', 'فهرس الوثيقة', `<div class="cp-toc2">
    <div class="ph"><h3>للقرار والتنفيذ</h3><ol class="front">${front.map(([k, t]) => `<li><a href="#ch-${k}">${esc(t)}</a><span class="cp-pgno"></span></li>`).join('')}</ol></div>
    ${groups.map((g, gi) => `<div class="ph"><h3>${gi + 1}. ${esc(g.title)} <small>${g.items.length} ${g.items.length === 1 ? 'فصل' : g.items.length === 2 ? 'فصلان' : 'فصول'}</small></h3>${g.lead ? `<p>${esc(g.lead)}</p>` : ''}
      <ol>${g.items.map((s) => `<li><span class="n">${String(s.n).padStart(2, '0')}</span><a href="#ch-${esc(s.key)}">${esc(s.title)}</a>${state(s)}<span class="cp-pgno"></span></li>`).join('')}</ol></div>`).join('')}
  </div>`, draft ? 'الفصول مجمّعة بالأسئلة التي تجيب عنها، وأمام كل فصل حالته. انقر عنوانًا لتنتقل إليه.' : 'الفصول مجمّعة بالأسئلة التي تجيب عنها. انقر عنوانًا لتنتقل إليه.');
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
    list.map((x) => [fmt(x.at), x.gate, x.decision, x.by])), 'من سجل التدقيق كما وقع، لا يُعدَّل ولا يُحذف. الأدوار لا الأسماء.');
}

function closureBlock(doc) {
  const c = closureData(doc);
  if (!c) return '';
  const pct = (v) => (v == null ? '·' : `${v}%`);
  return section('الإغلاق', `تقرير إغلاق المبادرة (${c.status})`, `
    ${kpis([
      { value: `${c.delivered.done} من ${c.delivered.total}`, label: 'معالم تحققت', hint: c.delivered.on_time != null ? `${c.delivered.on_time}% في موعدها` : '' },
      { value: pct(c.realization), label: 'تحقق المنافع' },
      { value: c.sponsor || '·', label: 'مراجعة اليوم 180' },
    ])}
    ${c.benefits.length ? `<h3>ما تحقق من المنافع</h3>${table([{ label: 'المنفعة' }, { label: 'خط الأساس', width: '22mm' }, { label: 'المستهدف', width: '22mm' }, { label: 'الفعلي', width: '22mm' }, { label: 'التحقق', width: '18mm' }],
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
export function capstoneReport(doc) {
  const m = doc.meta || {};
  const secs = doc.sections || [];
  const approved = m.status === 'approved';
  // مثال محلول (guide.js): وثيقة تعليمية كاملة، بلا تنبيه المسودة ولا فحوص ولا اعتماد
  const example = !!m.example;
  const count = (key, field) => ((secs.find((s) => s.key === key)?.fields || []).find((f) => f.key === field)?.value || []).filter(filled).length;
  const funding = ((secs.find((s) => s.key === 'cost-plan')?.fields || []).find((f) => f.key === 'funding')?.value || '').trim();

  let body = STYLE;
  body += section('نظرة أولى', 'المبادرة في سطور', kpis([
    { value: m.scope_title || '·', label: 'النوع', hint: LVL[m.level] ? `مستوى ${LVL[m.level]}` : '' },
    { value: count('wbs', 'packages'), label: 'حزمة عمل' },
    { value: doc.cost ? money(doc.cost.withContingency) : '·', label: 'التكلفة مع الاحتياطي' },
    { value: count('benefits-register', 'benefits'), label: 'منفعة مقيسة' },
    { value: `${m.readiness ?? 0}%`, label: 'الجاهزية' },
  ]));

  // الملخص لصاحب القرار: رسالة القائد، ثم ما يُطلب منه. الهدف والمشكلة في الميثاق فلا يتكرران هنا
  body += section('لصاحب القرار', 'الملخص التنفيذي', `
    ${doc.summary ? callout(example ? 'عن المثال' : 'رسالة القائد', doc.summary) : ''}
    ${points([
      doc.cost && raw(`<b>المطلوب:</b> ${esc(money(doc.cost.withContingency))} مع احتياطي ${esc(doc.cost.contingency || 0)}%${funding ? `، من ${esc(funding)}` : ''}`),
      (m.start || m.end) && raw(`<b>المدة:</b> <bdi dir="ltr">${esc(m.start || '·')}</bdi> إلى <bdi dir="ltr">${esc(m.end || '·')}</bdi>`),
      m.sponsor && raw(`<b>الراعي:</b> ${esc(m.sponsor)}`),
    ].filter(Boolean), '')}
    ${approved || example ? '' : `<p class="cp-draft">مسودة عمل: لم تُعتمد هذه الوثيقة بعد (${esc(m.status_title || '')}). تُعتمد بعد مراجعة المستشار وتأييد الراعي.</p>`}`);

  const charter = charterBlock(doc), bcase = caseBlock(doc), launch = launchBlock(doc);
  const front = [charter && ['charter', 'ميثاق المبادرة'], bcase && ['case', 'حالة العمل'], launch && ['launch', 'خطة الانطلاق'], ['glossary', 'مسرد المصطلحات']].filter(Boolean);
  body += tocBlock(doc, front, { draft: !approved && !example });
  body += charter + bcase + launch;

  secs.forEach((s, i) => {
    body += chapter(s, i, s.key === 'initiative-charter' && charter ? CHARTER_FIELDS : null);
    if (s.key === 'cost-plan') body += section('ملخص', 'ملخص التكلفة', costBlock(doc.cost));
  });

  if (!approved && !example && (doc.checks || []).length) {
    body += section('فحوص آلية', 'فحوص الاتساق بين الفصول', `<ul class="cp-check">${doc.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${esc(c.title)}${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</li>`).join('')}</ul>`,
      'يفحصها النظام آليًا: كل حزمة لها مالك وتكلفة، وكل منفعة لها خط أساس وخطة قياس، والجدول داخل مدة المبادرة.');
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
      ${r.note ? callout('خلاصة المستشار', r.note) : ''}`, r.priority ? `معيار من ${RUBRIC.length} أبعاد، وأبعاد الإطار الأولوي في مسار القائد وزنها ×${PRIORITY_WEIGHT}.` : `معيار من ${RUBRIC.length} أبعاد بوزن واحد، لتساوي مستويات القائد في الأطر الثلاثة.`);
  }

  if (approved) {
    const sp = doc.sponsor;
    body += section('الاعتماد', 'الاعتماد', `
      <p><span class="cp-stamp">معتمدة · ${esc(fmt(m.approved_at))}</span></p>
      ${points([
        raw(`<b>المستشار:</b> راجع الوثيقة وقبلها بمعيار التقييم.`),
        sp?.status === 'endorsed' ? raw(`<b>الراعي${sp.name ? `، ${esc(sp.name)}` : ''}:</b> أيّد المبادرة في ${esc(fmt(sp.at))}${sp.note ? `، وكتب: «${esc(sp.note)}»` : ''}.`)
          : raw('<b>الراعي:</b> اعتُمدت بقرار الإدارة دون تأييد الراعي.'),
      ], '')}`);
  }

  if (approved && doc.tracking?.summary) body += trackingBlock(doc.tracking);
  body += closureBlock(doc);
  if (!example) body += decisionsBlock(doc.decisions);
  body += glossaryBlock(doc);

  return {
    meta: {
      id: `${m.ref || 'MI-CP'}-V${m.version || 1}`, kind: 'CP', kindLabel: 'Initiative Document', pageAr: true, selfFonts: true,
      // اسم الملف لاتيني ثابت (رقم الوثيقة وإصدارها): بعض المتصفحات وأنظمة البريد تُسقط الاسم العربي فيصير «download». العنوان العربي في خصائص الملف
      pdfName: `Milestone-Impact-Initiative-${m.ref || 'MI-CP'}-V${m.version || 1}`,
      eyebrow: example ? 'Leaders Program · Worked example' : 'Leaders Program · Capstone', title: m.initiative || 'وثيقة المبادرة',
      subtitle: example ? `مثال محلول لقطاع ${m.org?.name || ''}: هكذا تبدو وثيقة مبادرة مكتملة` : `وثيقة المبادرة${m.scope_title ? ` (${m.scope_title})` : ''}، مشروع التخرج في برنامج القادة${m.track?.title ? ` · ${m.track.title}` : ''}`,
      rows: [['القائد', m.participant?.name || '·'], ['الجهة', m.org?.name || '·'], ['الدفعة', m.cohort || '·'], ['الحالة', m.status_title || '·']],
      confidential: example ? 'مثال تعليمي: مبادرة وجهة وأشخاص افتراضيون' : 'سري: مخصص للقائد وجهته ومستشاره',
      closing: example
        ? 'مثال محلول للتعلم منه لا للنقل: اكتب مبادرتك من واقع جهتك، وقارن بنيتها بهذا المثال.'
        : approved
        ? 'وثيقة معتمدة. تُعرض من نسختها المحفوظة لحظة الاعتماد، فلا يغيّرها تعديل لاحق.'
        : 'نسخة عمل تُبنى آليًا من فصول المبادرة لحظة إصدارها.',
    },
    body,
  };
}
