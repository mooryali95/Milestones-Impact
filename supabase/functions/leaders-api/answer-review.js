// ════════════════════════════════════════════════════════════════
// مراجعة إجابات القياس: ترتيب العرض، وتصنيف كل إجابة، والزمن التقديري من وقت الحفظ
// ════════════════════════════════════════════════════════════════
// دالة نقية بلا قاعدة ولا Deno، يستعملها الخادم في admin.assessment-answers وxp.assessment-answers
// وتُختبر في vitest. (تصور بطاقة المستوى وإجابات القياس، المرحلة 2، قرار المالك 2026-11-11)
//
// الزمن هنا **مؤشر مراجعة بصري لا يدخل أي قرار آلي**: لا يستورد هذه الوحدة evaluatePlacement
// ولا placementFromAnswers ولا إرسال القياس (يحرسه اختبار المصدر في answer-review.test.js).
//
// من أين يأتي الزمن: answered_at يُكتب عند كل حفظ للإجابة (upsert)، فهو وقت آخر حفظ لا مدة النظر.
// الفاصل بين حفظ سؤال وحفظ الذي قبله في ترتيب العرض يقارب زمن الإجابة في المسار الطبيعي (تقدم
// تلقائي بلا عودة)، ويُترك بلا رقم حيث لا يصح: أول القياس (المقدمة)، وأول كل قسم (الاستراحة)،
// والانقطاع الأطول من حده، والإجابة المعدّلة لاحقًا، وما يليها مباشرة.

import { DIMENSIONS, scoreFor, tierPercents } from './logic.js';
import { TIER_AR } from './labels.js';

// ── ترتيب العرض: مصدر واحد لشاشة القياس (assessmentGet) وللمراجعة ──
// الأبعاد بترتيبها، وفي كل بُعد الممارسة ثم المواقف ثم المعرفة: يقدّر المشارك ممارسته قبل أن
// تلمّح أسئلة المعرفة والمواقف إلى ما يُنتظر منه، وتأتي المعرفة بعد المواقف فلا تدله على إجاباتها.
// بنود انتقال التعلم في القياس البعدي آخرًا، بعد الأطر الثلاثة.
export const SERVED_TIER_ORDER = ['behavior', 'skill', 'knowledge'];
const lastly = (q) => (q.tier === 'transfer' ? 1 : 0);
export function servedOrder(questions) {
  return [...(questions || [])].sort((x, y) => lastly(x) - lastly(y)
    || DIMENSIONS.indexOf(x.dimension) - DIMENSIONS.indexOf(y.dimension)
    || SERVED_TIER_ORDER.indexOf(x.tier) - SERVED_TIER_ORDER.indexOf(y.tier)
    || (Number(x.sort) || 0) - (Number(y.sort) || 0));
}
// شاشة الاستراحة في القياس بين الأبعاد (وقبل بنود الانتقال)، لا بين جوانب البُعد الواحد
export const breakSection = (q) => (q?.tier === 'transfer' ? 'transfer' : q?.dimension);
export const sectionKey = (q) => (q?.tier === 'transfer' ? 'transfer' : `${q?.dimension}:${q?.tier}`);

// ── قرارات المالك (2026-11-11) ──
export const IDLE_SECONDS = 300;                         // حد الانقطاع: 5 دقائق
export const FAST_RATIO = 0.3;                           // «سريع»: أقل من 30٪ من وسيط القسم نفسه
export const FAST_MIN_SAMPLE = 3;                        // ولا وسيط لقسم فيه أقل من 3 أزمنة صالحة
export const FAST_FLOOR_SECONDS = { choice: 3, likert: 1.5 };   // أو أقل من حد أدنى معقول للقراءة

export const REVIEW_TIER_AR = { ...TIER_AR, transfer: 'انتقال التعلم' };
export const ANSWER_CLASS_AR = { full: 'كاملة', partial: 'جزئية', wrong: 'خاطئة', na: 'لا ينطبق', likert: 'تقدير ذاتي' };
export const TIMING_NOTE_AR = {
  first: 'أول سؤال في القياس: يشمل قراءة المقدمة',
  break: 'أول سؤال في القسم: يشمل الاستراحة بين الأقسام',
  gap: 'انقطاع أطول من 5 دقائق',
  edited: 'عُدّلت الإجابة بعد ما يليها، فوقت حفظها لا يدل على زمن النظر فيها',
  after_edit: 'السؤال الذي قبله عُدّل لاحقًا، فلا يُعرف متى بدأ هذا',
};
export const TIMING_DISCLAIMER_AR = 'الأزمنة تقديرية من وقت حفظ كل إجابة، ولا تدخل في احتساب المستوى.';

const maxOf = (q) => Math.max(0, ...(q.options || []).map((o) => Number(o.score) || 0));
const round1 = (n) => Math.round(n * 10) / 10;
export function median(list) {
  const s = [...list].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// تصنيف الإجابة من درجة الخيار في بنك الأسئلة (scoreFor نفسها): في الاختيار كاملة (أعلى درجة) أو جزئية أو خاطئة،
// وفي مقياس التكرار «لا ينطبق» (درجة سالبة) أو تقدير ذاتي بلا صواب وخطأ
export function answerClass(q, k) {
  const s = k == null ? null : scoreFor(q, k);
  if (s == null) return null;
  if (q.kind === 'likert') return s < 0 ? 'na' : 'likert';
  const max = maxOf(q);
  return max > 0 && s >= max ? 'full' : s > 0 ? 'partial' : 'wrong';
}

// الزمن التقديري لكل سؤال بترتيب العرض. ordered: الأسئلة بترتيب servedOrder ومع كل منها at (مللي ثانية) أو null.
// يعيد لكل سؤال { seconds, note, edited }.
export function estimateTimes(ordered, startedAt = null) {
  const n = ordered.length;
  const at = ordered.map((x) => (x.at == null || Number.isNaN(x.at) ? null : x.at));
  // معدّلة: حُفظت بعد سؤال يليها في العرض، أي عاد إليها المشارك بعده
  const edited = new Array(n).fill(false);
  let later = Infinity;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (at[i] == null) continue;
    if (at[i] > later) edited[i] = true;
    else later = at[i];
  }
  return ordered.map((q, i) => {
    if (at[i] == null) return { seconds: null, note: null, edited: false };
    if (edited[i]) return { seconds: null, note: 'edited', edited: true };
    if (i === 0) return { seconds: null, note: 'first', edited: false };
    if (breakSection(q) !== breakSection(ordered[i - 1])) return { seconds: null, note: 'break', edited: false };
    if (edited[i - 1]) return { seconds: null, note: 'after_edit', edited: false };
    const prev = at[i - 1] ?? startedAt;
    if (prev == null) return { seconds: null, note: 'first', edited: false };
    const sec = (at[i] - prev) / 1000;
    if (sec > IDLE_SECONDS) return { seconds: null, note: 'gap', edited: false };
    return { seconds: round1(Math.max(0, sec)), note: null, edited: false };
  });
}

// المراجعة كاملة لقياس واحد.
// questions: أسئلة الأداة (بخياراتها ودرجاتها) · rows: assessment_answers { question_id, value, score, answered_at }
// results: نسب الجوانب المخزّنة لكل بُعد { [dimension]: { knowledge, skill, behavior } } إن وُجدت، فتطابق assessment_results
export function reviewAnswers({ questions, rows, startedAt = null, submittedAt = null, results = null }) {
  const byId = new Map((questions || []).map((q) => [q.id, q]));
  const answered = (rows || []).filter((r) => byId.has(r.question_id));
  const rowOf = new Map(answered.map((r) => [r.question_id, r]));
  // المعروض هو المجاب: الإرسال يشترط اكتمال ما عُرض (صيغته وفقرات البعدي)، فلا حاجة لإعادة اشتقاقه
  const ordered = servedOrder(answered.map((r) => byId.get(r.question_id)));
  const ms = (v) => (v ? Date.parse(v) : null);
  const times = estimateTimes(ordered.map((q) => ({ ...q, at: ms(rowOf.get(q.id).answered_at) })), ms(startedAt));
  const ks = Object.fromEntries(answered.map((r) => [r.question_id, r.value?.k]));
  const pcts = results || tierPercents(ordered, ks);

  const items = ordered.map((q, i) => {
    const r = rowOf.get(q.id);
    const k = r.value?.k ?? null;
    const before = r.value?.before ?? null;
    const max = maxOf(q);
    return {
      id: q.id, order: i + 1, code: q.code || '', text: q.text_ar || '', dimension: q.dimension, tier: q.tier, kind: q.kind, retro: !!q.retro,
      section: sectionKey(q),
      // الخيارات بترتيبها الأصلي في البنك (قرار المالك)، مع درجة كل خيار وعلامة أعلاها
      options: (q.options || []).map((o, j) => ({ k: j, label: o.label, score: Number(o.score) || 0, best: q.kind !== 'likert' && max > 0 && Number(o.score) >= max, na: q.kind === 'likert' && Number(o.score) < 0 })),
      k, before, score: scoreFor(q, k), max_score: max, class: answerClass(q, k),
      seconds: times[i].seconds, timing_note: times[i].note, edited: times[i].edited, fast: false, answered_at: r.answered_at || null,
    };
  });

  // «سريع» داخل كل قسم (بُعد × جانب) نسبةً إلى وسيطه، أو دون الحد الأدنى للقراءة
  const sections = [];
  for (const it of items) {
    let s = sections.find((x) => x.key === it.section);
    if (!s) {
      s = { key: it.section, dimension: it.tier === 'transfer' ? null : it.dimension, tier: it.tier, count: 0, full: 0, partial: 0, wrong: 0, na: 0, fast: 0, edited: 0, seconds: 0, timed: 0, median: null, pct: null };
      sections.push(s);
    }
    s.count += 1;
    if (it.class && it.class in s) s[it.class] += 1;
    if (it.edited) s.edited += 1;
    if (it.seconds != null) { s.seconds += it.seconds; s.timed += 1; }
  }
  for (const s of sections) {
    const own = items.filter((x) => x.section === s.key);
    const valid = own.map((x) => x.seconds).filter((x) => x != null);
    s.median = valid.length >= FAST_MIN_SAMPLE ? round1(median(valid)) : null;
    s.seconds = round1(s.seconds);
    for (const it of own) {
      if (it.seconds == null) continue;
      const floor = FAST_FLOOR_SECONDS[it.kind === 'likert' ? 'likert' : 'choice'];
      it.fast = it.seconds < floor || (s.median != null && it.seconds < FAST_RATIO * s.median);
      if (it.fast) s.fast += 1;
    }
    s.pct = s.tier !== 'transfer' && s.dimension ? pcts?.[s.dimension]?.[s.tier] ?? null : null;
  }

  const startMs = ms(startedAt), endMs = ms(submittedAt);
  const sum = (key) => sections.reduce((a, s) => a + s[key], 0);
  const totals = {
    count: items.length, wrong: sum('wrong'), partial: sum('partial'), na: sum('na'), fast: sum('fast'), edited: sum('edited'),
    active_seconds: round1(sum('seconds')), timed: sum('timed'),
    gaps: items.filter((x) => x.timing_note === 'gap').length,
    wall_seconds: startMs != null && endMs != null && endMs >= startMs ? Math.round((endMs - startMs) / 1000) : null,
  };
  return { items, sections, totals };
}

// ── تصدير CSV (للمدير وحده بقرار المالك) ──
export function secondsAr(s) {
  if (s == null) return '—';
  const n = Math.round(Number(s));
  if (n < 60) return `${n}ث`;
  const m = Math.floor(n / 60), r = n % 60;
  return m < 60 ? (r ? `${m}د ${r}ث` : `${m}د`) : `${Math.floor(m / 60)}س ${m % 60}د`;
}
export const sectionTitle = (s, dimName = (d) => d) => (s.tier === 'transfer' ? REVIEW_TIER_AR.transfer : `${dimName(s.dimension)} · ${REVIEW_TIER_AR[s.tier] || s.tier}`);
export function reviewCsvRows(review, dimName = (d) => d) {
  const head = ['الترتيب', 'القسم', 'الرمز', 'السؤال', 'الإجابة', 'قبل البرنامج', 'الدرجة', 'الأعلى', 'التصنيف', 'الزمن بالثواني', 'علامات'];
  const label = (it, k) => (k == null ? '' : it.options[k]?.label ?? '');
  const rows = review.items.map((it) => [
    it.order, sectionTitle(review.sections.find((s) => s.key === it.section) || it, dimName), it.code, it.text, label(it, it.k), it.retro ? label(it, it.before) : '',
    it.score ?? '', it.max_score, ANSWER_CLASS_AR[it.class] || '', it.seconds ?? '',
    [it.fast ? 'سريع' : '', it.edited ? 'عُدّلت' : '', it.timing_note && !it.edited ? TIMING_NOTE_AR[it.timing_note] : ''].filter(Boolean).join('؛ '),
  ]);
  return { head, rows };
}
