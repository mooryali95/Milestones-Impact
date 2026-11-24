// ════════════════════════════════════════════════════════════════
// ميثاق المبادرة وحالة العمل: عرضان مولّدان من فصول الوثيقة، لا نموذجان يُكتبان
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-14-تصور-بناء-المبادرة-وحالة-العمل-v1.md (اعتمده المالك، الخيار ج).
// لكل معلومة مصدر واحد: الموازنة من «الموارد والتكلفة»، والمنافع من «سجل المنافع»، والمخاطر من «سجل المخاطر».
// يعمل على الوثيقة كما يبنيها الخادم (docFor) وعلى لقطة الوثيقة المعتمدة معًا، فلا يمس الخادم ولا القاعدة.
import { dateAr, norm, parseDate, parseNumber, parseWhen, RISK_HIGH } from './capstone.js';
import { countAr } from './labels.js';

// التاريخ بصيغة 2026-03-15 داخل جملة عربية: يُعزل اتجاهه (LRI…PDI) فلا تنقلب أجزاؤه
const ltr = (v) => (v ? `\u2066${v}\u2069` : '·');

// الأبعاد الخمسة لحالة العمل، والفصول التي يُبنى منها كل بعد
// المرجع: Five Case Model (HM Treasury Green Book)
export const FIVE_CASES = Object.freeze([
  { key: 'strategic', title: 'البعد الاستراتيجي', question: 'لماذا هذه المبادرة، ولماذا الآن؟', chapters: ['initiative-charter', 'theory-of-change'] },
  { key: 'economic', title: 'البعد الاقتصادي', question: 'هل هذا أفضل حل مقابل قيمته؟', chapters: ['options-analysis', 'benefits-register'] },
  // fallback: فصل يجيب عن سؤال البعد حين لا يكون فصله الأصلي في وثيقة المستوى (مصفوفة الوثيقة بحسب المستوى، 2026-11-24):
  // الشراء والتعاقد من المتوسط، وسؤاله للتأسيسي مُجاب في «الموارد والتكلفة» (ما تحتاجه ومن يوفره)
  { key: 'commercial', title: 'البعد التجاري', question: 'هل يمكن شراء ما تحتاجه أو التعاقد عليه؟', chapters: ['procurement'], fallback: ['cost-plan'] },
  { key: 'financial', title: 'البعد المالي', question: 'هل هي في حدود الموازنة، ومن يموّلها؟', chapters: ['cost-plan'] },
  { key: 'management', title: 'البعد الإداري', question: 'هل يمكن تنفيذها وإدارتها وقياسها؟', chapters: ['governance', 'milestone-register', 'schedule', 'raid', 'evidence-plan'] },
]);

// حالة كل بعد من حالة فصوله في وثيقة المشارك. sections: [{ key, complete }]
// none: لا فصل من فصوله في وثيقته (مستواه أو نطاقه)، partial: بعضها مكتمل، done: كلها
export function caseStatus(sections) {
  const by = Object.fromEntries((sections || []).map((s) => [s.key, s]));
  return FIVE_CASES.map((c) => {
    const own = c.chapters.filter((k) => by[k]);
    const mine = own.length ? own : (c.fallback || []).filter((k) => by[k]);
    const done = mine.filter((k) => by[k].complete).length;
    const state = !mine.length ? 'none' : done === mine.length ? 'done' : done ? 'partial' : 'todo';
    return { key: c.key, title: c.title, question: c.question, state, done, total: mine.length };
  });
}

// ── قراءة الفصول ──
const filled = (r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim());
const sectionOf = (doc, key) => (doc?.sections || []).find((s) => s.key === key) || null;
const fieldOf = (doc, key, field) => (sectionOf(doc, key)?.fields || []).find((f) => f.key === field) || null;
export const valueOf = (doc, key, field) => fieldOf(doc, key, field)?.value ?? null;
const text = (doc, key, field) => { const v = valueOf(doc, key, field); return typeof v === 'string' && v.trim() ? v.trim() : null; };

// جدول فصل بأعمدته وصفوفه المملوءة، مع البحث عن عمود بجزء من اسمه
function tableOf(doc, key, field) {
  const f = fieldOf(doc, key, field);
  if (!f || f.type !== 'table') return null;
  const columns = f.columns || [];
  const rows = (Array.isArray(f.value) ? f.value : []).filter(filled);
  const cols = columns.map(norm);
  const col = (...words) => cols.findIndex((c) => words.some((w) => c.includes(norm(w))));
  return { columns, rows, col, cell: (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '') };
}

// المخاطر العالية: الاحتمال × الأثر من RISK_HIGH فأكثر، الحد نفسه في محرك الاتساق وخريطة المخاطر
export function highRisks(doc, limit = 5) {
  const t = tableOf(doc, 'raid', 'items');
  if (!t) return [];
  const p = t.col('الاحتمال'), i = t.col('الأثر'), d = t.col('الوصف'), o = t.col('المالك'), res = t.col('الاستجابة');
  return t.rows
    .map((r) => ({ title: t.cell(r, d) || t.cell(r, 0), owner: t.cell(r, o), response: t.cell(r, res), score: (parseNumber(t.cell(r, p)) || 0) * (parseNumber(t.cell(r, i)) || 0) }))
    .filter((x) => x.score >= RISK_HIGH)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// المنافع: المنفعة، وخط الأساس، والمستهدف، والمالك
export function benefitsOf(doc, limit = 5) {
  const t = tableOf(doc, 'benefits-register', 'benefits');
  if (!t) return [];
  const b = t.col('خط الأساس'), g = t.col('المستهدف'), o = t.col('المالك'), ind = t.col('المؤشر');
  return t.rows.slice(0, limit).map((r) => ({ title: t.cell(r, 0), indicator: t.cell(r, ind), baseline: t.cell(r, b), target: t.cell(r, g), owner: t.cell(r, o) }));
}

// ── ميثاق المبادرة في صفحة واحدة ──
// rows: [عنوان، قيمة نصية] ؛ deliverables: جدول المخرجات كما كُتب
// المدة كما تُقرأ: «من … إلى …»، أو «حتى الأسبوع 12» بلا تاريخ بدء (الزمن النسبي، تاريخ البدء اختياري)
export const durationAr = (start, end) => (start && end ? `${ltr(start)} إلى ${ltr(end)}` : end ? `حتى ${ltr(end)}` : start ? `من ${ltr(start)}` : null);

export function charterData(doc) {
  if (!sectionOf(doc, 'initiative-charter')) return null;
  const c = (f) => text(doc, 'initiative-charter', f);
  const cost = doc?.cost || null;
  const del = tableOf(doc, 'initiative-charter', 'deliverables');
  const benefits = benefitsOf(doc, 3);
  const risks = highRisks(doc, 3);
  const budget = cost && (cost.envelope != null || cost.withContingency)
    ? [cost.withContingency ? `التكلفة مع الاحتياطي ${Math.round(cost.withContingency).toLocaleString('en-US')} ريال` : null,
      cost.envelope != null ? `من موازنة متاحة ${Math.round(cost.envelope).toLocaleString('en-US')} ريال` : null].filter(Boolean).join('، ')
    : null;
  const rows = [
    ['المبادرة', c('title')],
    ['سياق التنفيذ', c('context')],
    ['الجهة المستضيفة', c('host')],
    ['الهدف الأعلى', c('objective')],
    ['المشكلة أو الفرصة', c('problem')],
    ['المستفيدون', c('beneficiaries')],
    ['الوصول إليهم واختيارهم', c('reach')],
    ['داخل النطاق', c('in_scope')],
    ['خارج النطاق', c('out_scope')],
    // تاريخ البدء اختياري (الزمن النسبي): بلاه تُقرأ المدة «حتى الأسبوع 12»
    ['المدة', durationAr(c('start'), c('end'))],
    ['الموازنة', budget],
    ['مصدر التمويل', text(doc, 'cost-plan', 'funding')],
    ['أهم المنافع', benefits.length ? benefits.map((x) => `${x.title}${x.baseline || x.target ? ` (من ${x.baseline || '·'} إلى ${x.target || '·'})` : ''}`).join('؛ ') : null],
    ['المخاطر الكبرى', risks.length ? risks.map((x) => x.title).join('؛ ') : null],
    ['القيود والافتراضات', c('constraints')],
    ['الخطوة الأولى خلال 30 يومًا', c('first_step')],
    ['من يشغّل بعد المبادرة', c('operator')],
    ['الراعي ودوره', c('sponsor')],
  ].filter(([, v]) => v);
  return { rows, deliverables: del && del.rows.length ? { columns: del.columns, rows: del.rows } : null };
}

// ── حالة العمل بأبعادها الخمسة ──
// لكل بعد: نقاط [عنوان، نص] وجدول اختياري، أو missing حين لا يكون فصله في الوثيقة أو لم يُملأ
export function businessCase(doc) {
  const out = [];
  const cost = doc?.cost || null;
  const has = (k) => !!sectionOf(doc, k);
  const add = (c, points, extra = {}) => {
    const pts = points.filter(([, v]) => v);
    out.push({ key: c.key, title: c.title, question: c.question, points: pts, ...extra,
      missing: !pts.length && !extra.table ? ([...c.chapters, ...(c.fallback || [])].some(has) ? 'لم تُملأ فصوله بعد' : 'ليس من فصول وثيقتك في مستواك') : null });
  };
  const [S, E, C, F, M] = FIVE_CASES;

  const evidence = tableOf(doc, 'options-analysis', 'evidence');
  add(S, [
    ['الهدف الأعلى', text(doc, 'initiative-charter', 'objective')],
    ['المشكلة أو الفرصة', text(doc, 'initiative-charter', 'problem')],
    ['الأثر المنشود', text(doc, 'theory-of-change', 'impact')],
  ], evidence && evidence.rows.length ? { table: { label: 'الدليل على المشكلة', columns: evidence.columns, rows: evidence.rows } } : {});

  const options = tableOf(doc, 'options-analysis', 'options');
  const benefits = benefitsOf(doc, 5);
  add(E, [
    ['التوصية ومبررها', text(doc, 'options-analysis', 'recommendation')],
    ['معايير المقارنة', text(doc, 'options-analysis', 'criteria')],
    ['المنافع المقيسة', benefits.length ? benefits.map((x) => `${x.title}${x.target ? ` (المستهدف ${x.target})` : ''}`).join('؛ ') : null],
    ['التكلفة مقابل المنفعة', text(doc, 'cost-plan', 'cba')],
  ], options && options.rows.length ? { table: { label: 'البدائل', columns: options.columns, rows: options.rows } } : {});

  const need = text(doc, 'procurement', 'need');
  const buys = tableOf(doc, 'procurement', 'items');
  const buying = !!need && need.startsWith('نعم');
  // بلا فصل الشراء (التأسيسي): ما تحتاجه المبادرة ومن يوفره من «الموارد والتكلفة»
  const items = has('procurement') ? null : tableOf(doc, 'cost-plan', 'items');
  const needs = items?.rows.length ? items.rows.map((r) => items.cell(r, items.col('البند')) || items.cell(r, 0)).filter(Boolean).slice(0, 5).join('؛ ') : null;
  add(C, [
    ['الحاجة إلى الشراء', need],
    ['ما تحتاجه المبادرة', needs],
    ['من يوفره', needs ? text(doc, 'cost-plan', 'funding') : null],
    ['مدة الطرح والترسية', buying ? text(doc, 'procurement', 'lead_time') : null],
    ['توزيع المخاطر في العقد', buying ? text(doc, 'procurement', 'contract') : null],
  ], buying && buys && buys.rows.length ? { table: { label: 'ما يُشترى أو يُتعاقد عليه', columns: buys.columns, rows: buys.rows } } : {});

  const money = (n) => `${Math.round(n).toLocaleString('en-US')} ريال`;
  add(F, [
    ['التكلفة التقديرية', cost?.total ? money(cost.total) : null],
    ['الاحتياطي', cost?.total ? `${cost.contingency || 0}%` : null],
    ['التكلفة مع الاحتياطي', cost?.withContingency ? money(cost.withContingency) : null],
    ['الموازنة المتاحة', cost?.envelope != null ? `${money(cost.envelope)}${cost.withContingency ? (cost.withContingency <= cost.envelope ? '، والتكلفة ضمنها' : '، والتكلفة تتجاوزها') : ''}` : null],
    ['مصدر التمويل', text(doc, 'cost-plan', 'funding')],
  ]);

  const risks = highRisks(doc, 5);
  const milestones = tableOf(doc, 'milestone-register', 'milestones');
  const activities = tableOf(doc, 'schedule', 'activities');
  const plan = tableOf(doc, 'evidence-plan', 'plan');
  add(M, [
    // بلا فصل الحوكمة (التأسيسي): صاحب القرار من البطاقة
    ['من يقرر', text(doc, 'governance', 'structure') || (has('governance') ? null : text(doc, 'initiative-charter', 'sponsor'))],
    ['المدة', durationAr(text(doc, 'initiative-charter', 'start'), text(doc, 'initiative-charter', 'end'))],
    ['الخطة', [milestones?.rows.length ? countAr(milestones.rows.length, 'معلم واحد', 'معلمان', 'معالم', 'معلمًا') : null, activities?.rows.length ? `${countAr(activities.rows.length, 'نشاط واحد', 'نشاطان', 'أنشطة', 'نشاطًا')} في الجدول` : null].filter(Boolean).join('، و') || null],
    ['المخاطر العالية', risks.length ? risks.map((x) => `${x.title}${x.owner ? ` (المالك: ${x.owner})` : ''}`).join('؛ ') : null],
    ['القياس', plan?.rows.length ? `${countAr(plan.rows.length, 'مؤشر واحد', 'مؤشران', 'مؤشرات', 'مؤشرًا')} بخطة قياس` : null],
  ]);
  return out;
}

// ── خطة الانطلاق: أول 90 يومًا ──
// عرض مولّد كالميثاق: يُقرأ من البطاقة (البداية والخطوة الأولى والمشغّل)، والجدول، وسجل المعالم، وخطة القياس، وسجل المخاطر.
// لا حقل له ولا جدول. ما لا تاريخ له لا يدخل نافذة، ويُذكر ما يلزم لإكماله بدل إخفائه.
const DAY = 864e5;
export const LAUNCH_WINDOWS = Object.freeze([
  { key: 'd30', title: 'أول 30 يومًا', from: 0, to: 30 },
  { key: 'd60', title: 'من اليوم 31 إلى 60', from: 31, to: 60 },
  { key: 'd90', title: 'من اليوم 61 إلى 90', from: 61, to: 90 },
]);

export function launchPlan(doc) {
  if (!sectionOf(doc, 'initiative-charter')) return null;
  const acts = tableOf(doc, 'schedule', 'activities');
  const ms = tableOf(doc, 'milestone-register', 'milestones');
  const dated = [];
  // الأسابيع تصير تواريخ بمرساة تاريخ البدء وحدها؛ بلاها لا يُختلق تاريخ
  const anchor = parseDate(text(doc, 'initiative-charter', 'start') || '');
  if (acts) {
    const s = acts.col('البداية'), n = acts.col('النشاط', 'الحزمة');
    for (const r of acts.rows) { const at = parseWhen(acts.cell(r, s), { anchor }); if (at != null) dated.push({ at, kind: 'activity', text: `يبدأ: ${acts.cell(r, n >= 0 ? n : 1)}` }); }
  }
  if (ms) {
    const d = ms.col('التاريخ'), q = ms.col('القرار'), who = ms.col('صاحب القرار');
    for (const r of ms.rows) {
      const at = parseWhen(ms.cell(r, d), { anchor, edge: 'end' });
      if (at == null) continue;
      const dec = ms.cell(r, q), by = ms.cell(r, who);
      dated.push({ at, kind: 'milestone', text: `معلم: ${ms.cell(r, 0)}${dec ? `، والقرار عنده ${dec}` : ''}${by ? ` (${by})` : ''}` });
    }
  }
  const start = parseDate(text(doc, 'initiative-charter', 'start') || '') ?? (dated.length ? Math.min(...dated.map((x) => x.at)) : null);
  const first = text(doc, 'initiative-charter', 'first_step');
  const windows = LAUNCH_WINDOWS.map((w) => ({ key: w.key, title: w.title,
    range: start == null ? null : `${dateAr(new Date(start + w.from * DAY).toISOString().slice(0, 10))} إلى ${dateAr(new Date(start + w.to * DAY).toISOString().slice(0, 10))}`,
    items: [] }));
  if (first) windows[0].items.push(`الخطوة الأولى: ${first}`);
  if (start != null) {
    for (const x of dated.sort((a, b) => a.at - b.at)) {
      const day = Math.round((x.at - start) / DAY);
      const w = LAUNCH_WINDOWS.findIndex((v) => day >= v.from && day <= v.to);
      if (w >= 0) windows[w].items.push(x.text);
    }
  }
  const plan = tableOf(doc, 'evidence-plan', 'plan');
  const measure = plan ? plan.rows.slice(0, 2).map((r) => {
    const src = plan.cell(r, plan.col('المصدر')), freq = plan.cell(r, plan.col('التكرار')), who = plan.cell(r, plan.col('المسؤول'));
    return `${plan.cell(r, 0)}${src ? ` من ${src}` : ''}${freq ? `، ${freq}` : ''}${who ? `، يقيسه ${who}` : ''}`;
  }) : [];
  const watch = highRisks(doc, 2).map((x) => `${x.title}${x.owner ? ` (المالك: ${x.owner})` : ''}${x.response ? `: ${x.response}` : ''}`);
  const operator = text(doc, 'initiative-charter', 'operator');
  const missing = [
    !first && 'اكتب الخطوة الأولى في بطاقة المبادرة',
    start == null && 'اكتب تاريخ البداية في بطاقة المبادرة',
    !dated.length && 'أضف تواريخ إلى الجدول الزمني أو سجل المعالم',
    !measure.length && 'املأ خطة القياس',
  ].filter(Boolean);
  if (!windows.some((w) => w.items.length) && !measure.length && !watch.length) return { windows, measure, watch, operator, missing, empty: true };
  return { windows, measure, watch, operator, missing, empty: false };
}
