// ════════════════════════════════════════════════════════════════
// مرافق بناء المبادرة: دليل الحقل والمثال المحلول، العون بقدر الحاجة يتلاشى بالمستوى
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md (المرحلتان 4أ و4ب، اعتمدهما المالك).
// أثر المثال المحلول وانعكاس الخبرة: ما يعين المبتدئ يثقل على الخبير، فالعون نفسه يُعرض بثلاث صور:
//   التأسيسي: المطلوب والخطأ الشائع ومثال من قطاعه، مفتوحة بجانب الحقل
//   المتوسط: «كيف أكتبه؟» مطويًا، وفيه المثال وسؤال يرفع الجودة
//   المتقدم: «سؤال الخبير» مطويًا: تحدٍّ لا شرح، والمثال الكامل عند الطلب فقط
// المحتوى في المستودع (supabase/content/initiative-guide)، غير مُقاس، يراجعه خبير المحتوى.
import FIELDS from '../../supabase/content/initiative-guide/v1/fields.json';
import { BEGINNER_EXAMPLE, EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import STARTERS from '../../supabase/content/initiative-guide/v1/starters.json';
import { ANATOMY } from '../../supabase/content/initiative-guide/v1/anatomy.js';
import { CARD_CRITERIA, costSummary } from '../../supabase/functions/leaders-api/capstone.js';
import { sectorFamily } from '../../supabase/functions/leaders-api/logic.js';
import { nearCopy } from '../../supabase/functions/leaders-api/example-check.js';

export const GUIDE_MODES = Object.freeze({ beginner: 'open', intermediate: 'collapsed', advanced: 'expert' });

// الأمثلة المحلولة بترتيب العرض. القطاع الأقرب أولًا، والخدمات الحكومية أقرب مثال لمن لم يُضف قطاعه بعد
export { EXAMPLES };
const BY_SECTOR = Object.fromEntries(EXAMPLES.map((x) => [x.sector, x]));

// ── سياق المبادرة: أين تُنفَّذ (anatomy.json contexts). المبادرة ملك قائدها في كل سياق، والسياق يكيّف المثال والتلميح ──
export const CONTEXTS = Object.freeze(ANATOMY.contexts.options.map((o) => Object.freeze({ ...o })));
/** خيار السياق من نصه كما حُفظ في البطاقة، أو null */
export const contextOf = (label) => CONTEXTS.find((o) => o.label === String(label || '').trim()) || null;
/** تلميح الحقل في سياق المبادرة: { label, note } أو null إن لم يختلف الجواب في هذا السياق */
export function contextNote(modelKey, fieldKey, label) {
  const c = contextOf(label);
  const note = c && ANATOMY.contexts.notes[`${modelKey}.${fieldKey}`]?.[c.key];
  return note ? { label: c.label, note } : null;
}

/** مفتاح قطاع المثال من قطاع المشارك المكتوب نصًا حرًا في ملفه، ومعه هل طابق قطاعه فعلًا (عائلات القطاع في logic.js) */
export function sectorOf(text, context = null) {
  // سياق المبادرة (حقل context في البطاقة) يسبق قطاع الملف: المبادرة الريادية مثالها الريادي أيًا كان قطاع صاحبها
  const own = contextOf(context)?.example;
  if (own && EXAMPLES.some((x) => x.sector === own)) return { key: own, matched: true };
  const f = sectorFamily(text);
  if (f === 'health') return { key: 'health', matched: true };
  return { key: 'gov', matched: f === 'gov' || f === 'municipal' };
}

// القطاعات المفتوحة للمشارك كما حسمها الخادم من مفاتيح الرؤية (examples.sectors). غيابها (خادم أقدم) يعني الكل
const openOf = (allowed) => (Array.isArray(allowed) ? EXAMPLES.filter((x) => allowed.includes(x.sector)) : [...EXAMPLES]);

/** الأمثلة المفتوحة مرتبة: مثال قطاع المشارك أولًا */
export const examplesFor = (sectorText, allowed = null, context = null) => {
  // مثال السياق إن كان مفتوحًا للمشارك، وإلا مثال قطاعه
  const open = openOf(allowed), own = contextOf(context)?.example;
  const k = own && open.some((x) => x.sector === own) ? own : sectorOf(sectorText).key;
  return [...open.filter((x) => x.sector === k), ...open.filter((x) => x.sector !== k)];
};

/** حقل المثال المحلول لقطاع المشارك، أو لأقرب مثال مفتوح إن حُجب مثال قطاعه: { value, type, columns, sector_title } أو null */
export function exampleFor(modelKey, fieldKey, sectorText, allowed = null, context = null) {
  const ex = examplesFor(sectorText, allowed, context)[0];
  const f = ex?.sections.find((s) => s.key === modelKey)?.fields.find((x) => x.key === fieldKey);
  if (!f || f.value == null || (Array.isArray(f.value) ? !f.value.length : !String(f.value).trim())) return null;
  return { value: f.value, type: f.type, columns: f.columns || null, sector_title: ex.sector_title };
}

/**
 * عون الحقل بمستوى المشارك في إطار الفصل، أو null إن لم يكن للحقل دليل
 * @param {string} modelKey @param {string} fieldKey @param {string | null | undefined} level @param {string | null} [sectorText]
 * @param {{ field?: boolean, sectors?: string[] } | null} [examples] ما حسمه الخادم من مفاتيح الرؤية
 */
export function guideFor(modelKey, fieldKey, level, sectorText = null, examples = null) {
  const g = FIELDS[modelKey]?.[fieldKey];
  if (!g || typeof g !== 'object') return null;
  const mode = GUIDE_MODES[level] || 'collapsed';
  // المتقدم لا يُعرض له المثال بجانب الحقل: يُثقل عليه (انعكاس الخبرة)، والوثيقة الكاملة متاحة له في صفحة المبادرة.
  // وما حجبه المالك (examples.field أو قطاع بعينه) لا يُعرض
  const example = mode === 'expert' || examples?.field === false ? null : exampleFor(modelKey, fieldKey, sectorText, examples?.sectors ?? null, examples?.context ?? null);
  // التأسيسي يرى المثال التطوعي المحلول بأعمدته (BEGINNER_EXAMPLE) خلف «أرني مثالًا»، وإلا مثال قطاعه
  const volunteer = mode === 'open' && examples?.field !== false ? beginnerExample(modelKey, fieldKey) : null;
  return { mode, meaning: g.meaning, mistake: g.mistake, challenge: g.challenge, example, volunteer, context: contextNote(modelKey, fieldKey, examples?.context) };
}

/** حقل المثال التطوعي للتأسيسي: { value, sector_title } أو null */
export function beginnerExample(modelKey, fieldKey) {
  const f = BEGINNER_EXAMPLE.sections.find((s) => s.key === modelKey)?.fields.find((x) => x.key === fieldKey);
  if (!f || f.value == null || (Array.isArray(f.value) ? !f.value.length : !String(f.value).trim())) return null;
  return { value: f.value, sector_title: BEGINNER_EXAMPLE.sector_title, initiative: BEGINNER_EXAMPLE.initiative };
}

/** هل الجواب قريب جدًا من جواب أي مثال محلول للحقل نفسه؟ يُقارن بكل الأمثلة ولو حُجب بعضها، كما يقارن المستشار */
export const nearExample = (modelKey, fieldKey, value) => [...EXAMPLES, BEGINNER_EXAMPLE].some((ex) => nearCopy(value, ex.sections.find((s) => s.key === modelKey)?.fields.find((x) => x.key === fieldKey)?.value));

// ── صفوف البداية (4ج): هيكل لا محتوى للجدول الفارغ ──
const blank = (rows) => !(Array.isArray(rows) ? rows : []).some((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim()));

/** صفوف هيكل البداية للجدول، نسخة جديدة، أو null إن لم يكن له هيكل أو لم تطابق أعمدته */
export function starterFor(modelKey, fieldKey, columns) {
  const rows = STARTERS[modelKey]?.[fieldKey];
  if (!Array.isArray(rows) || (Array.isArray(columns) && rows.some((r) => r.length !== columns.length))) return null;
  return rows.map((r) => [...r]);
}

/** يُعرض زر «ابدأ من هيكل»؟ الجدول فارغ وله هيكل */
export const canStart = (modelKey, fieldKey, columns, rows) => blank(rows) && !!starterFor(modelKey, fieldKey, columns);

/** صفوف الهيكل التي بقيت كما أُدرجت: تُعدّل أو تُحذف قبل التسليم */
export function untouchedStarters(modelKey, fieldKey, rows) {
  const base = (STARTERS[modelKey]?.[fieldKey] || []).map((r) => JSON.stringify(r.map((c) => String(c))));
  return (Array.isArray(rows) ? rows : []).filter((r) => Array.isArray(r) && base.includes(JSON.stringify(r.map((c) => String(c ?? ''))))).length;
}

export const hasGuide = (modelKey) => !!FIELDS[modelKey] && typeof FIELDS[modelKey] === 'object';

/** المثال المحلول وثيقةً كاملة بصيغة الخادم، يطبعها قالب الوثيقة نفسه (capstoneReport) */
export function exampleDoc(ex) {
  const sec = (k) => ex.sections.find((s) => s.key === k);
  const val = (k, f) => sec(k)?.fields.find((x) => x.key === f)?.value ?? null;
  const cp = sec('cost-plan');
  const cost = cp ? costSummary({ fields: cp.fields }, Object.fromEntries(cp.fields.map((f) => [f.key, f.value]))) : null;
  return {
    meta: {
      ref: `MI-EX-${ex.sector.toUpperCase()}`, version: 1, example: true, status: 'example', status_title: 'مثال محلول',
      initiative: ex.initiative, scope: 'project', scope_title: 'مشروع', readiness: 100,
      participant: { name: 'مثال محلول' }, org: { name: ex.sector_title },
      host: val('initiative-charter', 'host') || null, context: val('initiative-charter', 'context') || null,
      sponsor: val('initiative-charter', 'sponsor'), start: val('initiative-charter', 'start'), end: val('initiative-charter', 'end'),
    },
    summary: ex.about,
    sections: ex.sections.map((s) => ({ key: s.key, title: s.title, dimension: s.dimension, fields: s.fields })),
    cost, checks: [], review: null, sponsor: null, rubric: [],
  };
}

// ── اكتشاف المبادرة (4ج): قبل البطاقة، بأسئلة تختلف بالمستوى، وناتجه مسودة البطاقة نفسها ──
// أسلوب الميسّرين: أفكار متعددة، ثم مفاضلة بمعايير بوابة البطاقة نفسها، ثم صياغة المختارة. لا نسخة ثانية: ما يُكتب هنا
// يُحفظ مسودةً في «بطاقة المبادرة» ويعدّله المشارك هناك.
export const DISCOVERY_CRITERIA = Object.freeze(CARD_CRITERIA.map((c) => [c.key, c.self]));

/** أسئلة الصياغة بمستوى المشارك: التأسيسي بأمثلة، والمتوسط بلا أمثلة، والمتقدم أسئلة استراتيجية */
export function discoveryQuestions(level) {
  if (level === 'advanced') {
    return [
      { key: 'decision', label: 'ما القرار الذي تريد أن يتخذه صاحب القرار بعد قراءة وثيقتك؟' },
      { key: 'metric', label: 'أي مؤشر استراتيجي سيتحرك، ومن كم إلى كم؟' },
      { key: 'goal', label: 'أي هدف أعلى تخدمه، وما مصدره؟ (استراتيجية جهة، أو خطة قطاع، أو رؤية وطنية، أو حاجة سوق)' },
      { key: 'first', label: 'ما خطوتك الأولى خلال 30 يومًا، ومع من؟' },
    ];
  }
  const ex = level === 'beginner';
  return [
    { key: 'who', label: 'من المستفيد أو المتأثر، وكم عددهم تقريبًا؟', hint: ex ? 'مثال لمشكلة: 1,200 مراجع شهريًا ينتظرون أكثر من أسبوع. ومثال لفرصة: 300 أسرة في الحي بلا مركز تدريب قريب' : '' },
    { key: 'size', label: 'كيف تعرف حجمها؟ رقم ومن أين أخذته', hint: ex ? 'مثال: متوسط الإنجاز 9 أيام (نظام الطلبات، 2025)' : '' },
    { key: 'goal', label: 'أي هدف أعلى تخدمه مبادرتك؟', hint: ex ? 'من استراتيجية جهة، أو خطة قطاع، أو رؤية وطنية، أو حاجة سوق. انقله بنصه واذكر مصدره' : '' },
    { key: 'first', label: 'ما خطوتك الأولى خلال 30 يومًا، ومع من؟', hint: ex ? 'مثال: اجتماع مع مالك البيانات لاستخراج أرقام الربع الماضي' : '' },
  ];
}

/** درجة الفكرة: عدد المعايير المحققة من أربعة */
export const discoveryScore = (checks) => DISCOVERY_CRITERIA.filter(([k]) => checks?.[k]).length;

// حد قبول المستشار للبطاقة: ثلاثة معايير من أربعة. «الأنسب» حكم لا يُعطى إلا لفكرة واحدة تتفوق وتبلغ الحد
export const DISCOVERY_PASS = 3;
/**
 * مفاضلة الأفكار المكتوبة. best: فهرس فكرة واحدة تتفوق على البقية وتبلغ الحد، وإلا null.
 * state: 'best' أو 'tie' (أكثر من فكرة بالدرجة العليا البالغة الحد) أو 'below' (لا فكرة تبلغ الحد) أو null (فكرة واحدة)
 * @param {{ i: number }[]} filled @param {Record<string, boolean>[]} checks
 */
export function discoveryRank(filled, checks) {
  if (filled.length < 2) return { best: null, state: null };
  const scores = filled.map(({ i }) => ({ i, s: discoveryScore(checks[i]) }));
  const top = Math.max(...scores.map((x) => x.s));
  if (top < DISCOVERY_PASS) return { best: null, state: 'below' };
  const leaders = scores.filter((x) => x.s === top);
  return leaders.length === 1 ? { best: leaders[0].i, state: 'best' } : { best: null, state: 'tie' };
}

/**
 * مسودة البطاقة من الاكتشاف. لا تكتب فوق ما كتبه المشارك في بطاقته من قبل: تملأ الفارغ وحده
 * @param {string} level @param {{ idea: string, title?: string, answers: Record<string, string> }} input @param {Record<string, any>} [existing]
 */
export function charterFromDiscovery(level, { idea, title, answers }, existing = {}) {
  const a = Object.fromEntries(Object.entries(answers || {}).map(([k, v]) => [k, String(v || '').trim()]));
  const sentence = (t) => (t && !/[.؟!]$/.test(t) ? `${t}.` : t);
  const problem = level === 'advanced'
    ? [sentence(String(idea || '').trim()), a.metric && sentence(`المؤشر: ${a.metric}`), a.decision && sentence(`القرار المطلوب: ${a.decision}`)]
    : [sentence(String(idea || '').trim()), a.who && sentence(`المستفيدون أو المتأثرون: ${a.who}`), a.size && sentence(`حجمها: ${a.size}`)];
  const draft = {
    title: String(title || idea || '').trim().slice(0, 120),
    problem: problem.filter(Boolean).join(' '),
    objective: a.goal || '',
    first_step: a.first || '',
  };
  const out = { ...existing };
  for (const [k, v] of Object.entries(draft)) if (v && !String(existing?.[k] ?? '').trim()) out[k] = v;
  return out;
}
