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
import QR from 'qrcode';
import { esc, kpis, section, SEAL, structuralAccent } from './doc.js';
import { cleanDoc, fingerprint, institutionalGate } from '../../../supabase/functions/leaders-api/doc-quality.js';
import { benefitsOf, charterData, durationAr, launchPlan } from '../../../supabase/functions/leaders-api/business-case.js';
import { DOC_LIVE_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { formOfDoc } from '../../../supabase/functions/leaders-api/doc-form.js';
import { SLICES, termsAt, trackManifest } from '../../../supabase/functions/leaders-api/track-manifest.js';
import { capstoneReport, heatmap, levelAnnex, pdfFileName, paras, STYLE, tableOf } from './capstone.js';
import { costLabel, dateAr, parseNumber, RISK_HIGH, RISK_MID } from '../../../supabase/functions/leaders-api/capstone.js';
import { costBarsSvg, ganttLegend, ganttSvg, scheduleModel } from './visuals.js';
import { SITES } from '../../../supabase/functions/_shared/sites.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : null);
const fmtAt = (d) => (d ? new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);
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
.in-open .n { font: 400 32pt/0.9 "Noto Sans", sans-serif; color: var(--acc); letter-spacing: -.02em; }
.in-open .eyebrow { margin-bottom: 1mm; letter-spacing: .18em; }
.in-open h2 { margin: 0; font-weight: 500; font-size: 18pt; line-height: 1.3; color: #0B272F; }
.in-open p { margin: 1.5mm 0 0; font-size: 9pt; color: #5F7176; line-height: 1.7; }
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
.in-grid > div span { display: block; font-size: 9pt; font-weight: 500; color: #8A6424; }
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
.in-dec h3 { font-size: 10.5pt; font-weight: 500; margin: 6mm 0 2.5mm; color: #0B272F; }
.in-lean { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 0 0 6mm; }
.in-lean > div { border: 1px solid #DCE2E1; padding: 3mm 3.5mm; break-inside: avoid; min-height: 30mm; }
.in-lean > div.w2 { grid-column: span 2; }
.in-lean span { display: block; font-size: 9pt; font-weight: 500; color: var(--acc); margin-bottom: 1mm; }
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
.in-verify .seal { width: 26mm; height: 26mm; margin-inline-start: auto; }
.in-chart text { font-family: "Noto Kufi Arabic", "Noto Sans", sans-serif; }
</style>`;

export { fingerprint };

const sec = (doc, k) => (doc.sections || []).find((s) => s.key === k) || null;
const fld = (doc, k, f) => (sec(doc, k)?.fields || []).find((x) => x.key === f) || null;
const val = (doc, k, f) => fld(doc, k, f)?.value ?? null;
const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

// حقل صالح بعنوانه، أو لا شيء
function field(doc, k, f, label) {
  const x = fld(doc, k, f);
  if (!x || !has(x.value)) return '';
  const title = esc(label || x.label);
  if (x.type === 'table') return `<div class="cp-f"><b>${title}</b>${tableOf(x.columns, x.value)}</div>`;
  if (x.type === 'select') return `<div class="cp-f"><b>${title}</b><span class="tag gold">${esc(x.value)}</span></div>`;
  return `<div class="cp-f"><b>${title}</b>${paras(x.value)}</div>`;
}
const grid = (pairs) => {
  const ok = pairs.filter(([, v]) => has(v));
  return ok.length ? `<div class="in-grid">${ok.map(([k, v]) => `<div><span>${esc(k)}</span><p>${v && typeof v === 'object' && 'html' in v ? v.html : esc(v)}</p></div>`).join('')}</div>` : '';
};

// ── المخاطر مرتبة بالدرجة (الاحتمال × الأثر)، أعلاها أولًا، من سجل المخاطر كما كُتب ──
function risksOf(doc, limit = 3) {
  const f = fld(doc, 'raid', 'items');
  if (!f || !Array.isArray(f.value)) return [];
  const col = (...w) => (f.columns || []).findIndex((c) => w.some((x) => String(c).includes(x)));
  const p = col('الاحتمال'), i = col('الأثر'), d = col('الوصف'), o = col('المالك'), r = col('الاستجابة');
  const cell = (row, k) => (k >= 0 ? String(row[k] ?? '').trim() : '');
  return f.value.filter((row) => Array.isArray(row) && row.some((c) => String(c ?? '').trim()))
    .map((row) => ({ title: cell(row, d) || cell(row, 0), owner: cell(row, o), response: cell(row, r), score: (parseNumber(cell(row, p)) || 0) * (parseNumber(cell(row, i)) || 0) }))
    .filter((x) => x.title)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
const riskCards = (list) => (list.length ? `<div class="in-cards">${list.map((x) => `<div class="in-card">${x.score ? `<span class="sc ${x.score >= RISK_HIGH ? 'hi' : x.score >= RISK_MID ? 'md' : ''}">${x.score}</span>` : ''}<b>${esc(x.title)}</b>${x.response ? `<p>${esc(x.response)}</p>` : ''}${x.owner ? `<small>المالك: ${esc(x.owner)}</small>` : ''}</div>`).join('')}</div>` : '');
const benefitCards = (list) => (list.length ? `<div class="in-cards">${list.map((x) => `<div class="in-card"><b>${esc(x.title)}</b>${x.indicator ? `<p>${esc(x.indicator)}</p>` : ''}${x.baseline || x.target ? `<p>${x.baseline ? `من <bdi>${esc(x.baseline)}</bdi> ` : ''}${x.target ? `إلى <bdi>${esc(x.target)}</bdi>` : ''}</p>` : ''}${x.owner ? `<small>المالك: ${esc(x.owner)}</small>` : ''}</div>`).join('')}</div>` : '');

// ── رسم المنافع: خط الأساس مقابل المستهدف لكل منفعة رقمية الطرفين، بمقياس كل منفعة (لا محور مشترك بين وحدات مختلفة) ──
export function benefitsChart(doc) {
  const rows = benefitsOf(doc, 6).map((b) => ({ ...b, a: parseNumber(b.baseline), z: parseNumber(b.target) }))
    .filter((b) => Number.isFinite(b.a) && Number.isFinite(b.z) && (b.a || b.z));
  if (rows.length < 1) return '';
  const W = 1000, rowH = 58, label = 330, H = rows.length * rowH + 12;
  let g = '';
  rows.forEach((b, i) => {
    const y = 10 + i * rowH, max = Math.max(Math.abs(b.a), Math.abs(b.z)) || 1, span = W - label - 120;
    const wa = (Math.abs(b.a) / max) * span, wz = (Math.abs(b.z) / max) * span;
    const t = b.title.length > 34 ? `${b.title.slice(0, 33)}…` : b.title;
    g += `<text x="${W}" y="${y + 24}" text-anchor="end" font-size="20" fill="#0B272F">${esc(t)}</text>
<rect x="${W - label - wa}" y="${y + 4}" width="${wa.toFixed(1)}" height="16" fill="#DCE2E1"/><text x="${W - label - wa - 8}" y="${y + 18}" text-anchor="end" font-size="16" fill="#5F7176">${esc(b.baseline)}</text>
<rect x="${W - label - wz}" y="${y + 26}" width="${wz.toFixed(1)}" height="16" fill="var(--acc)"/><text x="${W - label - wz - 8}" y="${y + 40}" text-anchor="end" font-size="16" fill="#0B272F">${esc(b.target)}</text>`;
  });
  return `<figure class="cp-fig in-chart"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="المنافع: خط الأساس مقابل المستهدف">${g}</svg>
<figcaption>المنافع: الرمادي خط الأساس واللون المستهدف، كلٌ بمقياس منفعته</figcaption></figure>`;
}

// ── رمز QR متجهي (SVG) لرابط التحقق، من حزمة qrcode نفسها التي تبني رمز الشهادة، بلا شبكة ──
export function qrSvg(text) {
  const q = QR.create(text, { errorCorrectionLevel: 'M' });
  const n = q.modules.size, d = q.modules.data;
  let path = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) path += `M${x + 2} ${y + 2}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges" aria-label="رمز التحقق"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#0B272F"/></svg>`;
}
/** رابط التحقق العام بالبصمة: صفحة /v/doc/<البصمة> في تطبيق القادة (Verify.jsx، doc.verify) */
export const verifyUrl = (fp, base = SITES.leaders) => `${String(base || SITES.leaders).replace(/\/$/, '')}/v/doc/${encodeURIComponent(fp)}`;

/** هوية الوثيقة: الجهة في الصدارة، والدفعة (اسم برنامجها وشعاره ولونها) توقيعًا، ولون البنية بعد فحص التباين */
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
export function institutionalReport(input) {
  // المعتمدة: محتواها النظيف وبصمتها وشكلها مجمّدة في اللقطة لحظة الاعتماد (capstone.ts approve: snapshot.issued)،
  // فلا يغيّر تعديل لاحق ولا تحسين في قواعد الجودة ولا تغيّر مسار المشارك وثيقةً صدرت. غير المعتمدة تُبنى لحظة العرض
  const frozen = input?.meta?.status === 'approved' && input?.issued?.sections ? input.issued : null;
  const doc = frozen ? { ...input, sections: frozen.sections, cost: frozen.cost ?? input.cost, summary: frozen.summary ?? input.summary, meta: { ...input.meta, ...(frozen.meta || {}) } } : cleanDoc(input, { strict: true }).doc;
  const gate = institutionalGate(doc);
  if (!gate.ok) return { blocked: true, missing: gate.missing };
  const m = doc.meta || {};
  const form = formOfDoc(frozen ? input : doc);
  const approved = m.status === 'approved';
  const fp = frozen?.fingerprint || fingerprint(input);
  const cost = doc.cost?.withContingency > 0 ? doc.cost : null;
  const c = charterData(doc);
  const duration = durationAr(m.start, m.end);
  const durationHtml = duration && { html: [m.start && `من ${esc(dateAr(m.start))}`, m.end && `${m.start ? 'إلى' : 'حتى'} ${esc(dateAr(m.end))}`].filter(Boolean).join(' ') };
  const funding = val(doc, 'cost-plan', 'funding');
  const parts = [];
  const add = (en, ar, body, note) => { if (body && body.replace(/<[^>]+>/g, '').trim()) parts.push([en, ar, body, note]); };
  const lean = form.key === 'card', full = form.key === 'case';
  const benefits = benefitsOf(doc, full ? 8 : lean ? 3 : 5);
  // حالة العمل تُبنى على أسئلة صاحب القرار (slices.json، بمستوى المشارك في الأثر): كل باب يفتح بسؤاله، فيقرأ صاحب القرار
  // الحالات الخمس (الاستراتيجية والاقتصادية والتجارية والمالية والإدارية) في أبوابها. بلا مسار معروف: أسئلة الاحترافي
  const man = full ? trackManifest(m.track_key || null, m.priority || null) : null;
  const ask5 = full ? (man.card?.support.case.questions || SLICES.frameworks.impact.case.advanced.questions) : {};
  const viz = scheduleModel(doc);
  const g = viz ? ganttSvg(viz, { today: null }) : null;
  const ganttFig = g?.svg ? `<figure class="cp-fig">${g.svg}${ganttLegend()}<figcaption>المخطط الزمني؛ الذهبي على المسار الحرج</figcaption></figure>` : '';
  const costKpis = cost ? kpis(cost.contingency ? [{ value: Math.round(cost.total).toLocaleString('en-US'), label: 'التكلفة التقديرية (ريال)' }, { value: `${cost.contingency}%`, label: 'الاحتياطي' }, { value: Math.round(cost.withContingency).toLocaleString('en-US'), label: `${costLabel(cost)} (ريال)` }] : [{ value: Math.round(cost.total).toLocaleString('en-US'), label: `${costLabel(cost)} (ريال)` }]) : '';
  const cb = costBarsSvg(doc);
  const costFig = cb?.svg ? `<figure class="cp-fig in-chart">${cb.svg}<figcaption>التكلفة بحسب الحزمة</figcaption></figure>` : '';

  // ── صفحة القرار التنفيذية: من الحقول القائمة وحدها (لا مصدر جديد) ──
  const ask = cost ? `${money(cost.withContingency)}${duration ? `، على مدة ${duration}` : ''}${funding ? `، من ${funding}` : ''}` : duration ? `مدة ${duration}` : null;
  const recommendation = val(doc, 'options-analysis', 'recommendation') || val(doc, 'initiative-charter', 'objective');
  const decision = [
    `<div class="q"><span>القرار المطلوب</span><p>${esc(`اعتماد ${m.initiative ? `مبادرة «${m.initiative}»` : 'المبادرة'}${cost ? ` بتكلفة ${money(cost.withContingency)}` : ''}${duration ? ` على مدة ${duration}` : ''}${m.sponsor ? `، برعاية ${m.sponsor}` : ''}.`)}</p></div>`,
    grid([['المشكلة', val(doc, 'initiative-charter', 'problem')], ['التوصية', recommendation], ['المطلوب', ask]]),
    benefits.length ? `<h3>ثلاث منافع</h3>${benefitCards(benefits.slice(0, 3).map((b) => ({ ...b, indicator: null })))}` : '',
    (() => { const r = risksOf(doc, 3); return r.length ? `<h3>أعلى ثلاث مخاطر</h3>${riskCards(r.map((x) => ({ ...x, response: null })))}` : ''; })(),
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
      ms.length ? `<div class="cp-f"><b>المعالم</b>${tableOf(fld(doc, 'milestone-register', 'milestones').columns, ms.slice(0, 5))}</div>` : '',
      // البطاقة مختصرة: المعالم تكفي، والمخطط الزمني لمن لم يكتب معالم
      ms.length ? '' : ganttFig,
    ].join(''));
  } else {
    // ── الميثاق وحالة العمل: نظرة عامة، ولماذا، والقيمة، والخطة، والحوكمة والمخاطر، والأثر (حالة العمل) ──
    const packages = (val(doc, 'wbs', 'packages') || []).length;
    const tiles = [
      cost && { value: Math.round(cost.withContingency).toLocaleString('en-US'), label: `${costLabel(cost)} (ريال)` },
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
        ['المطلوب', cost ? `${money(cost.withContingency)}${funding ? `، من ${funding}` : ''}` : null],
      ])}`);
    add('Why', 'لماذا هذه المبادرة', [
      full ? field(doc, 'options-analysis', 'evidence', 'الدليل على المشكلة') : '',
      field(doc, 'options-analysis', 'options', 'البدائل'),
      field(doc, 'options-analysis', 'recommendation', 'التوصية ومبررها'),
      field(doc, 'theory-of-change', 'chain', 'كيف يحدث التغيير'),
      full ? field(doc, 'theory-of-change', 'impact', 'الأثر المنشود') : '',
      full ? field(doc, 'options-analysis', 'criteria', 'معايير المفاضلة') : '',
      full ? grid([['أضعف حلقة في السلسلة', val(doc, 'theory-of-change', 'weakest')], ['كيف نختبرها مبكرًا', val(doc, 'theory-of-change', 'test')], ['ما خارج سيطرتنا', val(doc, 'theory-of-change', 'external')], ['القيود', val(doc, 'initiative-charter', 'constraints')]]) : '',
    ].join(''), ask5.strategic);
    add('Value', 'القيمة والقياس', [
      benefits.length ? `<div class="cp-f"><b>المنافع</b>${benefitCards(benefits)}</div>` : '',
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
    ].join(''), ask5.economic);
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
    ].join(''), ask5.financial);
    if (full) {
      add('Commercial', 'الشراء والتعاقد', [
        grid([['ما نحتاج شراءه', val(doc, 'procurement', 'need')], ['مدة التوريد', val(doc, 'procurement', 'lead_time')]]),
        field(doc, 'procurement', 'items', 'بنود الشراء'),
        field(doc, 'procurement', 'contract', 'شكل التعاقد وتوزيع المخاطر'),
      ].join(''), ask5.commercial);
    }
    const risks = val(doc, 'raid', 'items') || [];
    const raidF = fld(doc, 'raid', 'items');
    add('Governance & risks', 'الحوكمة والمخاطر', [
      grid([['الراعي ودوره', m.sponsor], ['من يقرر', val(doc, 'governance', 'structure')], ['إيقاع المتابعة', val(doc, 'governance', 'cadence')]]),
      field(doc, 'stakeholder-map', 'stakeholders', 'أصحاب المصلحة'),
      full ? field(doc, 'stakeholder-map', 'coalitions', 'التحالفات وتحريك المعارضين') : '',
      (() => { const r = risksOf(doc, full ? 10 : 5); return r.length ? `<div class="cp-f"><b>سجل المخاطر</b>${riskCards(r)}</div>` : ''; })(),
      risks.length && raidF ? heatmap(raidF.columns, risks) : '',
      full ? field(doc, 'governance', 'raci', 'مصفوفة المسؤوليات') : '',
      full ? grid([['التصعيد', val(doc, 'governance', 'escalation')], ['شهية المخاطر', val(doc, 'raid', 'appetite')], ['أصحاب المصلحة الصامتون', val(doc, 'stakeholder-map', 'silent')], ['قرار البوابة', [val(doc, 'stage-gate', 'decision'), val(doc, 'stage-gate', 'justification')].filter(has).join(': ')]]) : '',
    ].join(''), ask5.management);
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
      ].join(''));
    }
  }

  // ── مصطلحات حالة العمل: مسرد الأطر الثلاثة من slices.json بعمق مستوى المشارك في كل إطار (المصدر نفسه لتلميح الكتاب)،
  // فيقرأ صاحب القرار المصطلح بالمعنى الذي كُتبت به الوثيقة. بلا مسار معروف: بعمق الاحترافي ──
  if (full) {
    const terms = ['milestone', 'impact', 'leadership'].flatMap((d) => man.card?.handbook.frameworks[d]?.terms || termsAt(d, 'advanced'));
    add('Glossary', 'مصطلحات الوثيقة', terms.length ? `<table class="cp-gloss"><tbody>${terms.map((t) => `<tr><th>${esc(t.term)}${t.en ? `<br><small>${esc(t.en)}</small>` : ''}</th><td>${esc(t.def)}</td></tr>`).join('')}</tbody></table>` : '',
      'بالمعنى الذي كُتبت به هذه الوثيقة.');
  }

  // ── الاعتماد: المعتمدة بتاريخها وبصمتها المجمّدة ورمز تحقق عام؛ الحية بتاريخ بنائها، وبصمتها تتغير بأي تعديل ──
  const sp = doc.sponsor;
  const signs = [
    ['المستشار', approved || doc.review ? 'راجع الوثيقة وقبلها بمعيار التقييم' : 'قيد المراجعة', null],
    ['الراعي', sp?.status === 'endorsed' ? (sp.name || m.sponsor || 'الراعي') : sp?.waived ? 'اعتُمدت بقرار فريق البرنامج' : 'لم يؤيد بعد', sp?.status === 'endorsed' ? fmt(sp.at) : null],
    ['تاريخ الاعتماد', approved ? fmt(m.approved_at) : 'لم تُعتمد بعد', null],
  ];
  const built = fmtAt(m.generated_at) || fmtAt(new Date());
  const url = approved ? verifyUrl(fp, m.app_url) : null;
  add('Approval', 'الاعتماد', `<div class="in-approve">${approved ? `<span class="st">معتمدة · ${esc(fmt(m.approved_at) || '')}</span>` : `<span class="st live">${esc(DOC_LIVE_AR)} · بُنيت ${esc(built)}</span>`}
    <div class="in-sign">${signs.map(([k, v, d]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b>${d ? `<small>${esc(d)}</small>` : ''}</div>`).join('')}</div>
    <p class="in-fp"><span>DOCUMENT <b>${esc(`${m.ref || 'MI-CP'}-V${m.version || 1}`)}</b></span><span>FINGERPRINT <b>${esc(fp)}</b></span></p>
    ${url ? `<div class="in-verify">${qrSvg(url)}<p>امسح الرمز أو افتح الرابط لتتحقق أن هذه النسخة المعتمدة كما صدرت: يعرض رقمها وتاريخ اعتمادها وبصمتها.<br><a href="${esc(url)}">${esc(url)}</a></p>${SEAL()}</div>` : '<div class="in-verify"><p>نسخة حية تُبنى من بيانات المبادرة لحظة طلبها، فتعكس آخر ما كُتب. لا تصلح للتحقق قبل الاعتماد.</p></div>'}</div>`,
  approved ? 'بصمة النسخة تتغير بأي تعديل في محتواها: تطابقها مع صفحة التحقق يثبت أن ما بين يديك هو النسخة المعتمدة.' : null);

  const opener = ([en, ar, b, note], i) => `<section class="in-sec${i && en === 'Approval' ? ' np' : ''}"><header class="in-open"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><span class="eyebrow">${esc(en)}</span><h2>${esc(ar)}</h2>${note ? `<p>${esc(note)}</p>` : ''}</div></header>${b}</section>`;
  const { brand, accent } = identityOf(m);
  const decisionPage = decision.replace(/<[^>]+>/g, '').trim() ? `<section class="in-dec"><header class="in-open"><span class="n">◆</span><div><span class="eyebrow">Decision</span><h2>ما المطلوب منك</h2><p>صفحة واحدة لصاحب القرار، والتفصيل في الأبواب بعدها.</p></div></header>${decision}</section>` : '';
  const body = STYLE + IN_STYLE + `<style>:root { --acc: ${accent}; }</style>` + decisionPage + parts.map(opener).join('');
  // بلا اسم للمبادرة: العنوان اسم الوثيقة وحده، فلا يتكرر في العنوان الفرعي
  const title = m.initiative || form.name;
  const subtitle = [m.initiative ? form.name : null, m.scope_title].filter(Boolean).join(' · ') || null;
  const org = m.org || null;
  return {
    fingerprint: fp,
    form,
    meta: {
      id: `${m.ref || 'MI-CP'}-V${m.version || 1}`, kind: 'CP', kindLabel: form.en, pageAr: true, selfFonts: true,
      pdfName: pdfFileName({ ...m, initiative: m.initiative }, 'institutional').replace(/^وثيقة-المبادرة/, form.name.replace(/\s+/g, '-')),
      brand,
      eyebrow: brand.program || 'برنامج القادة', title, subtitle,
      rows: [['الجهة', org?.name || m.host], ['الراعي', m.sponsor], ['قائد المبادرة', m.participant?.name],
        ['التاريخ', approved ? fmt(m.approved_at) : fmt(m.generated_at || new Date())], ['الحالة', approved ? 'معتمدة' : DOC_LIVE_AR], ['الإصدار', `V${m.version || 1}`]].filter(([, v]) => v),
      stamp: approved ? null : DOC_LIVE_AR,
      confidential: 'ملك قائد المبادرة: تُتداول بإذنه',
      closing: approved ? `وثيقة معتمدة تُعرض من نسختها المحفوظة لحظة الاعتماد (البصمة ${fp})، فلا يغيّرها تعديل لاحق.` : `نسخة حية بُنيت ${built} من فصول المبادرة، فتتغير بتغيّرها.`,
    },
    body,
  };
}

/** الوثيقتان من مصدر واحد: 'institutional' (النسخة المؤسسية) أو 'working' (ملف العمل الكامل). يعيد { meta, body } أو { blocked, message } */
// 'external': لمن هو خارج العمل (الراعي، الجهة، رابط المشاركة، الخبير): المؤسسية إن اكتملت، وإلا صفحة «قيد الإعداد» مهذبة، ولا ملحق ولا ختم مسودة
export function renderInitiative(doc, kind = 'working') {
  // 'reader': من يراجع قبل الاعتماد (الراعي ليؤيد، والخبير): المؤسسية إن اكتملت، وإلا ملف العمل بلا ملحق ولا ختم
  if (kind === 'external' || kind === 'reader') {
    const r = institutionalReport(doc);
    if (!r.blocked) return kind === 'reader' && doc?.review_levels ? { ...r, body: r.body + levelAnnex(doc) } : r;
    return kind === 'reader' ? capstoneReport(doc, { appendix: false }) : pendingReport(doc);
  }
  if (kind !== 'institutional') return capstoneReport(doc);
  const r = institutionalReport(doc);
  return r.blocked ? { blocked: true, missing: r.missing, message: missingMessage(r.missing, formOfDoc(doc).name) } : r;
}

/** رسالة ما ينقص لإصدار النسخة المؤسسية، بلغة المشارك */
export const missingMessage = (missing, name = 'الوثيقة المؤسسية') => `لا تُصدر ${name} قبل أن تجيب عن: ${missing.map((x) => (x.add ? `${x.title} (${x.add})` : x.title)).join('، ')}. اعرض «ملف العمل الكامل» لترى ما ينقص في ملحقه.`;

/** صفحة مهذبة لقارئ خارجي حين لم تكتمل النسخة المؤسسية بعد */
export function pendingReport(doc) {
  const m = doc?.meta || {};
  const form = formOfDoc(doc);
  return {
    meta: { id: `${m.ref || 'MI-CP'}-V${m.version || 1}`, kind: 'CP', kindLabel: form.en, pageAr: true, selfFonts: true,
      brand: identityOf(m).brand,
      eyebrow: identityOf(m).brand.program || 'برنامج القادة', title: m.initiative || form.name, rows: [['قائد المبادرة', m.participant?.name]].filter(([, v]) => v),
      confidential: 'ملك قائد المبادرة: تُتداول بإذنه', closing: `تصدر ${form.name} حين يكتمل إعدادها.` },
    body: STYLE + section('In preparation', 'الوثيقة قيد الإعداد', `<p class="cp-p">يعمل قائد المبادرة على استكمال ${esc(form.name)} مع مستشاره. ستجدها هنا كاملة حين يكتمل إعدادها.</p>`),
  };
}
