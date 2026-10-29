// ════════════════════════════════════════════════════════════════
// وثيقة المبادرة (مشروع التخرج): قالب الطباعة الاحترافي
// ════════════════════════════════════════════════════════════════
// قالب واحد يفتحه المشارك والمستشار والراعي والجهة، من وثيقة يبنيها الخادم
// (capstone.doc / admin.capstone / sponsor.get / coord.capstone). يبني على
// محرك الوثائق doc.js فتخرج بالهوية نفسها، ويضيف رسوم الوثيقة: شجرة هيكل
// التجزئة، والمخطط الزمني، وخريطة المخاطر، وملخص التكلفة.
import { bars, callout, esc, kpis, points, raw, section, table } from './doc.js';
import { parseDate, parseNumber, RUBRIC_MAX } from '../../../supabase/functions/leaders-api/capstone.js';

const LVL = { beginner: 'تأسيسي', intermediate: 'متوسط', advanced: 'احترافي' };
const DIM_EN = { milestone: 'Milestone · Execution', impact: 'Impact · Value', leadership: 'Leadership · People' };
const DIM_AR = { milestone: 'المعلم', impact: 'الأثر', leadership: 'القيادة' };
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
  const W = 1000, label = 300, chart = W - label - 20, rowH = 26, top = 28, H = top + list.length * rowH + 8;
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
${ticks.filter((_, i) => i % step === 0).map((t) => `<line x1="${x(t).toFixed(1)}" y1="${top - 6}" x2="${x(t).toFixed(1)}" y2="${H - 4}" stroke="#DCE2E1" stroke-width="1"/><text x="${x(t).toFixed(1)}" y="${top - 12}" font-size="12" fill="#5F7176" text-anchor="middle">${new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</text>`).join('')}
${list.map((r, i) => {
    const y = top + i * rowH;
    const x1 = x(r.b), x2 = x(r.a);
    const w = Math.max(4, x2 - x1);
    return `<text x="${W - 4}" y="${y + 17}" font-size="13" fill="#0B272F" text-anchor="end" direction="rtl">${esc(`${r.c ? `${r.c}  ` : ''}${r.n}`.slice(0, 34))}</text>
<rect x="${x1.toFixed(1)}" y="${y + 6}" width="${w.toFixed(1)}" height="14" rx="2" fill="${r.a === r.b ? '#A97A2E' : '#0B272F'}" opacity="${r.a === r.b ? 1 : 0.85}"/>`;
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
      const k = a * b >= 12 ? 'hi' : a * b >= 6 ? 'md' : 'lo';
      cells += `<div class="${k}">${grid[`${a}:${b}`] ? `<b>${grid[`${a}:${b}`]}</b>` : ''}</div>`;
    }
  }
  cells += `<div class="ax"></div>${[1, 2, 3, 4, 5].map((b) => `<div class="ax">${b}</div>`).join('')}`;
  return `<figure class="cp-fig"><div class="cp-heat">${cells}</div>
<div class="cp-legend"><span><i style="background:#E1BE85"></i>عالٍ (12 فأكثر)</span><span><i style="background:#F2E6D0"></i>متوسط</span><span><i style="background:#EEF1F0"></i>منخفض</span><span>المحور الرأسي: الاحتمال · الأفقي: الأثر</span></div>
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

function fieldHtml(f) {
  const v = f.value;
  if (f.type === 'table') {
    const rows = (Array.isArray(v) ? v : []).filter(filled);
    return `<div class="cp-f"><b>${esc(f.label)}</b>${table((f.columns || []).map((c) => ({ label: c })), rows, 'لم يُملأ')}</div>`;
  }
  if (!String(v ?? '').trim()) return `<div class="cp-f"><b>${esc(f.label)}</b><p class="cp-p muted">لم يُملأ</p></div>`;
  if (f.type === 'select') return `<div class="cp-f"><b>${esc(f.label)}</b><span class="tag gold">${esc(v)}</span></div>`;
  return `<div class="cp-f"><b>${esc(f.label)}</b>${paras(v)}</div>`;
}

function chapter(s, i) {
  let body = '';
  for (const f of s.fields) {
    body += fieldHtml(f);
    const rows = Array.isArray(f.value) ? f.value : [];
    if (s.key === 'wbs' && f.key === 'packages') body += wbsTree(f.columns, rows);
    if (s.key === 'schedule' && f.key === 'activities') body += gantt(f.columns, rows);
    if ((s.key === 'raid' && f.key === 'items') || (s.key === 'stage-gate' && f.key === 'risks')) body += heatmap(f.columns, rows);
  }
  return section(DIM_EN[s.dimension] || 'Chapter', `${i + 1}. ${s.title}`, body, DIM_AR[s.dimension] ? `إطار ${DIM_AR[s.dimension]}` : null);
}

// ── الوثيقة ──
// doc: { meta, summary, sections, cost, checks, review, sponsor, rubric }
export function capstoneReport(doc) {
  const m = doc.meta || {};
  const secs = doc.sections || [];
  const approved = m.status === 'approved';
  const count = (key, field) => ((secs.find((s) => s.key === key)?.fields || []).find((f) => f.key === field)?.value || []).filter(filled).length;
  const charter = Object.fromEntries((secs.find((s) => s.key === 'initiative-charter')?.fields || []).map((f) => [f.key, f.value]));

  let body = STYLE;
  body += section('At a glance', 'المبادرة في سطور', kpis([
    { value: m.scope_title || '·', label: 'النوع', hint: LVL[m.level] ? `مستوى ${LVL[m.level]}` : '' },
    { value: count('wbs', 'packages'), label: 'حزمة عمل' },
    { value: doc.cost ? money(doc.cost.withContingency) : '·', label: 'التكلفة مع الاحتياطي' },
    { value: count('benefits-register', 'benefits'), label: 'منفعة مقيسة' },
    { value: `${m.readiness ?? 0}%`, label: 'الجاهزية' },
  ]));

  body += section('Executive summary', 'الملخص التنفيذي', `
    ${doc.summary ? callout('رسالة القائد', doc.summary) : ''}
    ${points([
      charter.objective && raw(`<b>الهدف الاستراتيجي:</b> ${esc(charter.objective)}`),
      charter.problem && raw(`<b>المشكلة أو الفرصة:</b> ${esc(charter.problem)}`),
      (m.start || m.end) && raw(`<b>المدة:</b> ${esc(m.start || '·')} إلى ${esc(m.end || '·')}`),
      m.sponsor && raw(`<b>الراعي:</b> ${esc(m.sponsor)}`),
      doc.cost && raw(`<b>التكلفة:</b> ${esc(money(doc.cost.withContingency))} مع احتياطي ${esc(doc.cost.contingency || 0)}%`),
    ].filter(Boolean), '')}
    ${approved ? '' : `<p class="cp-draft">مسودة عمل: لم تُعتمد هذه الوثيقة بعد (${esc(m.status_title || '')}). تُعتمد بعد مراجعة المستشار وتأييد الراعي.</p>`}`);

  body += section('Contents', 'فهرس الوثيقة', `<ol class="cp-toc">${secs.map((s, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span>${esc(s.title)}<small>${esc(DIM_AR[s.dimension] || '')}</small></li>`).join('')}</ol>`);

  secs.forEach((s, i) => {
    body += chapter(s, i);
    if (s.key === 'cost-plan') body += section('Cost summary', 'ملخص التكلفة', costBlock(doc.cost));
  });

  if (!approved && (doc.checks || []).length) {
    body += section('Coherence', 'فحوص الاتساق بين الفصول', `<ul class="cp-check">${doc.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${esc(c.title)}${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</li>`).join('')}</ul>`,
      'يفحصها النظام آليًا: كل حزمة لها مالك وتكلفة، وكل منفعة لها خط أساس وخطة قياس، والجدول داخل مدة المبادرة.');
  }

  if (doc.review) {
    const r = doc.review;
    const rows = (doc.rubric || []).map((x) => [
      raw(`${esc(x.title)}${x.dimension === r.priority ? ' <span class="tag gold">وزن مضاعف</span>' : ''}`),
      `${r.scores?.[x.key] ?? '·'} من ${RUBRIC_MAX}`, r.notes?.[x.key] || '',
    ]);
    body += section('Advisor review', 'تقييم المستشار', `
      <p class="cp-score"><b>${esc(r.score ?? '·')}</b><span>من 100</span></p>
      ${table([{ label: 'البعد' }, { label: 'الدرجة', width: '18mm' }, { label: 'الملاحظة' }], rows)}
      ${r.note ? callout('خلاصة المستشار', r.note) : ''}`, 'معيار من ستة أبعاد، وأبعاد الإطار الأولوي في مسار القائد وزنها مضاعف.');
  }

  if (approved) {
    const sp = doc.sponsor;
    body += section('Approval', 'الاعتماد', `
      <p><span class="cp-stamp">معتمدة · ${esc(fmt(m.approved_at))}</span></p>
      ${points([
        raw(`<b>المستشار:</b> راجع الوثيقة وقبلها بمعيار التقييم.`),
        sp?.status === 'endorsed' ? raw(`<b>الراعي${sp.name ? `، ${esc(sp.name)}` : ''}:</b> أيّد المبادرة في ${esc(fmt(sp.at))}${sp.note ? `، وكتب: «${esc(sp.note)}»` : ''}.`)
          : raw('<b>الراعي:</b> اعتُمدت بقرار الإدارة دون تأييد الراعي.'),
      ], '')}`);
  }

  return {
    meta: {
      id: `${m.ref || 'MI-CP'}-V${m.version || 1}`, kind: 'CP', kindLabel: 'Initiative Document',
      eyebrow: 'Leaders Program · Capstone', title: m.initiative || 'وثيقة المبادرة',
      subtitle: `وثيقة ${m.scope_title ? `${m.scope_title} ` : ''}مشروع التخرج في برنامج القادة${m.track?.title ? ` · ${m.track.title}` : ''}`,
      rows: [['القائد', m.participant?.name || '·'], ['الجهة', m.org?.name || '·'], ['الدفعة', m.cohort || '·'], ['الحالة', m.status_title || '·']],
      confidential: 'سري: مخصص للقائد وجهته ومستشاره',
      closing: approved
        ? 'وثيقة معتمدة. تُعرض من نسختها المحفوظة لحظة الاعتماد، فلا يغيّرها تعديل لاحق.'
        : 'نسخة عمل تُبنى آليًا من فصول المبادرة لحظة إصدارها.',
    },
    body,
  };
}
