// ════════════════════════════════════════════════════════════════
// منطق تطبيق القادة الصافي: احتساب المستوى وبناء الرحلة
// ════════════════════════════════════════════════════════════════
// بلا اعتماد على قاعدة البيانات ولا على Deno، حتى يُختبر في vitest
// (leaders-app/src/logic.test.js) ويُستورد كما هو في دالة الحافة.

import { DIM_AR, LEVEL_AR, TIER_AR } from './labels.js';

export const DIMENSIONS = ['milestone', 'impact', 'leadership'];
export const LEVELS = ['beginner', 'intermediate', 'advanced'];
export const TIERS = ['knowledge', 'skill', 'behavior'];

const maxScore = (q) => Math.max(0, ...(q.options || []).map((o) => Number(o.score) || 0));

// درجة سؤال من فهرس الخيار الأصلي (k). الدرجة تُحسب هنا دائمًا،
// ولا يُقبل أي رقم من المتصفح.
export function scoreFor(question, k) {
  const opt = (question.options || [])[k];
  return opt ? Number(opt.score) || 0 : null;
}

// نسبة كل مستوى إتقان في كل بُعد، من 0 إلى 100.
// مستوى بلا أسئلة يُعدّ null، ولا يكون شرطًا في القاعدة.
// خيار بدرجة سالبة يعني "لا ينطبق على عملي": يُستبعد سؤاله من الحساب.
// minBehavior: أقل عدد من عبارات الممارسة المجابة فعلًا، وما دونه لا نسبة له،
// حتى لا تُبنى الممارسة على عبارة واحدة بعد "لا ينطبق" في البقية.
export function tierPercents(questions, answers, { minBehavior = 0 } = {}) {
  const acc = {};
  for (const q of questions) {
    if (q.active === false) continue;
    if (answers[q.id] != null && (scoreFor(q, answers[q.id]) ?? 0) < 0) continue;
    const d = (acc[q.dimension] ||= {});
    const t = (d[q.tier] ||= { got: 0, max: 0, n: 0 });
    const w = Number(q.weight ?? 1);
    t.max += maxScore(q) * w;
    const a = answers[q.id];
    if (a != null) { t.got += (scoreFor(q, a) || 0) * w; t.n += 1; }
  }
  const out = {};
  for (const dim of DIMENSIONS) {
    out[dim] = {};
    for (const tier of TIERS) {
      const t = acc[dim]?.[tier];
      const few = tier === 'behavior' && t && t.n < minBehavior;
      out[dim][tier] = t && t.max > 0 && !few ? Math.round((t.got / t.max) * 10000) / 100 : null;
    }
  }
  return out;
}

// ── الصيغتان المتوازيتان A وB ──
// سؤال بلا form مشترك بين الصيغتين. صيغة المبدئي ثابتة لكل مشارك (نصف
// الدفعة تقريبًا لكل صيغة)، والبعدي الصيغة الأخرى (توزيع متقاطع).
export const FORMS = ['A', 'B'];
export function formFor(seed, previous = null) {
  if (previous === 'A') return 'B';
  if (previous === 'B') return 'A';
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 2 ? 'B' : 'A';
}
export const usesForms = (questions) => (questions || []).some((q) => q.form);
export const forForm = (questions, form) => (questions || []).filter((q) => !q.form || q.form === form);

// ── القياس البعدي: تدرّج المستوى وتوائم المواقف المشتركة ──
// فقرة لها min_level لا تُقدَّم إلا لمن اعتُمد مستواه في بُعدها عندها أو فوقها،
// وتُحسب منفصلة («مكتسبات المستوى») فلا تدخل في فرق القبلي والبعدي.
// التوأم (anchor_code لا يساوي code) فقرة موازية لمشتركة يراها المشارك في
// المبدئي: يُقدَّم التوأم بدل الأصل لغالبية المشاركين حتى لا يقيس البعدي تذكّر
// السؤال، ويُبقى الأصل لربعهم (anchorRepeat) فيبقى تقدير أثر التكرار قائمًا.
export const isTwin = (q) => !!q.anchor_code && q.anchor_code !== q.code;
export const levelGated = (q) => !!q.min_level;
export function anchorRepeat(seed) {
  let h = 7;
  for (const c of `anchor:${seed}`) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return h % 4 === 0;
}
export function servedPost(questions, { levels = {}, repeat = false } = {}) {
  const qs = questions || [];
  const twinned = new Set(qs.filter(isTwin).map((q) => q.anchor_code));
  return qs.filter((q) => {
    if (q.min_level && (LEVEL_RANK[q.min_level] ?? 9) > (LEVEL_RANK[levels[q.dimension]] ?? LEVEL_RANK.beginner)) return false;
    if (isTwin(q)) return !repeat;
    if (twinned.has(q.code)) return repeat;
    return true;
  });
}
// مكتسبات المستوى لكل بُعد: نسبة الدرجة على فقرات المستوى المقدَّمة (معرفة ومواقف معًا)
export function levelGains(questions, answers) {
  const acc = {};
  for (const q of (questions || []).filter(levelGated)) {
    if (q.active === false || !['knowledge', 'skill'].includes(q.tier)) continue;
    const t = (acc[q.dimension] ||= { got: 0, max: 0, n: 0, level: q.min_level });
    const w = Number(q.weight ?? 1);
    t.max += maxScore(q) * w;
    if (answers[q.id] != null) { t.got += Math.max(0, scoreFor(q, answers[q.id]) || 0) * w; t.n += 1; }
    if ((LEVEL_RANK[q.min_level] ?? 0) > (LEVEL_RANK[t.level] ?? 0)) t.level = q.min_level;
  }
  return Object.fromEntries(DIMENSIONS.map((d) => {
    const t = acc[d];
    return [d, t && t.max > 0 ? { pct: Math.round((t.got / t.max) * 10000) / 100, n: t.n, level: t.level } : null];
  }));
}

// تقرير «مكتسبات المستوى» من نتائج البعدي المحفوظة: لكل بُعد نسبته وعدد فقراته
// ومستواه، أو null إن لم تُقدَّم له فقرات مستوى. لا يمس pre/post ولا الفرق.
export const LEVEL_GAIN_AR = 'مكتسبات المستوى';
export function levelGainReport(post) {
  return Object.fromEntries(DIMENSIONS.map((d) => {
    const r = post?.[d];
    return [d, r && r.level_gain != null ? { label_ar: LEVEL_GAIN_AR, pct: r.level_gain, n: r.level_gain_n ?? null, level: r.level_gain_level ?? null } : null];
  }));
}

// المواقف المشتركة والخاصة بالصيغة كلٌّ على حدة، لتقدير أثر تكرار الأسئلة.
// التوأم جديد على المشارك فيُحسب مع الموازية لا مع المشتركة.
export function skillSplit(questions, answers) {
  const skill = questions.filter((q) => q.tier === 'skill' && !levelGated(q));
  const anchor = tierPercents(skill.filter((q) => !q.form && !isTwin(q)), answers);
  const own = tierPercents(skill.filter((q) => q.form || isTwin(q)), answers);
  return Object.fromEntries(DIMENSIONS.map((d) => [d, { anchor: anchor[d].skill, form: own[d].skill }]));
}

// الممارسة على العبارات المجابة (دون "لا ينطبق") في القياسين معًا، بمطابقة
// الرمز، فلا يقارن الفرق بين مجموعتين مختلفتين من العبارات.
export function commonBehavior(preQs, preAnswers, postQs, postAnswers, { minBehavior = 0 } = {}) {
  const valid = (q, k) => k != null && (scoreFor(q, k) ?? -1) >= 0;
  const pre = new Map(preQs.filter((q) => q.tier === 'behavior' && valid(q, preAnswers[q.id])).map((q) => [q.code, q]));
  const pairs = postQs.filter((q) => q.tier === 'behavior' && valid(q, postAnswers[q.id]) && pre.has(q.anchor_code || q.code));
  const preSet = pairs.map((q) => pre.get(q.anchor_code || q.code));
  const a = tierPercents(preSet, preAnswers, { minBehavior });
  const b = tierPercents(pairs, postAnswers, { minBehavior });
  return Object.fromEntries(DIMENSIONS.map((d) => [d, { pre: a[d].behavior, post: b[d].behavior }]));
}

// المستوى في بُعد واحد: أعلى مستوى تتحقق كل شروطه.
export function levelFor(pcts, rules) {
  const passes = (r) =>
    (pcts.knowledge == null || pcts.knowledge >= Number(r.min_knowledge)) &&
    (pcts.skill == null || pcts.skill >= Number(r.min_skill)) &&
    (pcts.behavior == null || pcts.behavior >= Number(r.min_behavior));
  for (const level of [...LEVELS].reverse()) {
    const r = rules.find((x) => x.level === level);
    if (r && passes(r)) return level;
  }
  return 'beginner';
}

// ── نموذج التسكين المركّب ──
// المؤشر المركّب = متوسط موزون لجوانب الإطار الثلاثة. الأوزان تعطي
// المواقف (اختبار الحكم الموقفي) الثقل الأكبر لأنها أصدق تنبؤًا بالأداء،
// وتعطي الممارسة (تقدير ذاتي) الأقل لأنها تميل إلى التضخم.
// المستوى يُمنح بالمؤشر المركّب، بشرط ألا تقل المعرفة ولا المواقف عن حدّ
// أدنى، فلا تُخفي قوة جانب فجوة حقيقية في آخر. وتُعلَّم الحالة الحدّية للمستشار.
// الممارسة (تقدير ذاتي غير متحقَّق منه) تبقى في المؤشر بوزنها لكنها ليست
// بوابة: لا يملك التقرير الذاتي حق النقض على اختبار موضوعي (سياسة المرحلة ب،
// ملحق التدقيق 1). إن قلّت عن الأرضية والاختبار ناجح تُعلَّم للمستشار.
// حد المتوسط الأدنى 40 فوق نسبة التخمين في أسئلة الأربعة بدائل (25%)،
// والهامش الحدّي 8 قريب من خطأ القياس المتوقع لستة أسئلة في الجانب.
export const DEFAULT_MODEL = {
  w_knowledge: 35, w_skill: 50, w_behavior: 15,
  min_intermediate: 55, min_advanced: 80,
  floor_intermediate: 40, floor_advanced: 60,
  borderline: 8,
  min_behavior_items: 3,
};

// الجوانب التي تنطبق عليها الأرضيات: الاختبار الموضوعي وحده
export const FLOOR_TIERS = ['knowledge', 'skill'];

// أعلام معلوماتية للمستشار: لا تغيّر المستوى ولا المؤشر
export const PLACEMENT_FLAGS_AR = {
  low_practice: 'اختبار مرتفع وممارسة ذاتية منخفضة',
  acquiescence: 'ممارسة بأعلى درجة في كل العبارات',
};

// الموافقة المطلقة: كل عبارات الممارسة في البُعد بأعلى درجة (دون «لا ينطبق»).
// يُعاد لكل بُعد true/false، وfalse لبُعد بلا عبارات مجابة.
// موضع تسمية «أعلى تكرار» في عبارة الممارسة: أعلى درجة في العبارة المباشرة،
// وأدنى درجة غير سالبة في المعكوسة (تسميات بالترتيب نفسه ودرجات مقلوبة)
export function topLabelIndex(q) {
  const opts = (q?.options || []).map((o, i) => ({ i, s: Number(o.score) })).filter((o) => o.s >= 0);
  if (!opts.length) return -1;
  const reverse = opts[0].s > opts[opts.length - 1].s;
  return opts.reduce((a, o) => (reverse ? o.s < a.s : o.s > a.s) ? o : a, opts[0]).i;
}
export function acquiescenceFor(questions, answers) {
  const by = {};
  for (const q of questions || []) {
    if (q.active === false || q.tier !== 'behavior') continue;
    const k = answers?.[q.id];
    const s = k == null ? null : scoreFor(q, k);
    if (s != null && s < 0) continue;
    const d = (by[q.dimension] ||= { n: 0, top: 0 });
    d.n += 1;
    // الإذعان يُقرأ من التسمية لا من الدرجة: العبارة المعكوسة تحمل التسميات نفسها
    // بدرجات مقلوبة، فمن يختار «أعلى تكرار» في كل العبارات يُكشف بها أيضًا.
    if (s != null && Number(k) === topLabelIndex(q)) d.top += 1;
  }
  return Object.fromEntries(DIMENSIONS.map((d) => [d, !!by[d] && by[d].n > 0 && by[d].top === by[d].n]));
}

// «لا ينطبق» في الممارسة: كم عبارة في كل بُعد أُجيبت بدرجة سالبة
export function behaviorNaCounts(questions, answers) {
  const out = Object.fromEntries(DIMENSIONS.map((d) => [d, 0]));
  for (const q of questions || []) {
    if (q.active === false || q.tier !== 'behavior' || answers?.[q.id] == null) continue;
    if ((scoreFor(q, answers[q.id]) ?? 0) < 0) out[q.dimension] = (out[q.dimension] || 0) + 1;
  }
  return out;
}
export const MAX_BEHAVIOR_NA = 1;
export const BEHAVIOR_NA_MESSAGE = 'اختر «لا ينطبق» لعبارة واحدة على الأكثر في كل قسم';

// opts.acquiescence: من acquiescenceFor لبُعد التقييم (يحتاج الإجابات نفسها)
export function evaluatePlacement(pcts, model = DEFAULT_MODEL, opts = {}) {
  const m = { ...DEFAULT_MODEL, ...(model || {}) };
  const w = { knowledge: Number(m.w_knowledge), skill: Number(m.w_skill), behavior: Number(m.w_behavior) };
  const tiers = TIERS.filter((t) => pcts?.[t] != null && w[t] > 0);
  const wsum = tiers.reduce((a, t) => a + w[t], 0);
  const flagsOf = (lowPractice) => {
    const acquiescence = !!opts?.acquiescence;
    const flags = [
      ...(lowPractice ? [{ key: 'low_practice', reason_ar: PLACEMENT_FLAGS_AR.low_practice }] : []),
      ...(acquiescence ? [{ key: 'acquiescence', reason_ar: PLACEMENT_FLAGS_AR.acquiescence }] : []),
    ];
    return { low_practice: lowPractice, acquiescence, flags };
  };
  if (!wsum) return { level: 'beginner', composite: null, borderline: false, reason: 'لا إجابات كافية للاحتساب', ...flagsOf(false) };
  const composite = Math.round(tiers.reduce((a, t) => a + w[t] * Number(pcts[t]), 0) / wsum * 10) / 10;
  // الأرضيات على المعرفة والمواقف فقط؛ بلا أيٍّ منهما لا مستوى فوق التأسيسي
  const gated = tiers.filter((t) => FLOOR_TIERS.includes(t));
  if (!gated.length) {
    return { level: 'beginner', composite, borderline: false, reason: `المؤشر ${composite} من الممارسة وحدها، دون اختبار معرفة أو مواقف`, ...flagsOf(false) };
  }
  const weakest = gated.reduce((a, t) => (Number(pcts[t]) < Number(pcts[a]) ? t : a), gated[0]);
  const low = Number(pcts[weakest]);
  const gate = (min, floor) => composite >= Number(min) && low >= Number(floor);
  const level = gate(m.min_advanced, m.floor_advanced) ? 'advanced' : gate(m.min_intermediate, m.floor_intermediate) ? 'intermediate' : 'beginner';
  // ممارسة ذاتية دون أرضية المستوى الذي بلغه الاختبار: معلومة للمستشار
  const levelFloor = level === 'advanced' ? m.floor_advanced : level === 'intermediate' ? m.floor_intermediate : null;
  const lowPractice = levelFloor != null && pcts?.behavior != null && Number(pcts.behavior) < Number(levelFloor);

  let reason, borderline = false;
  const next = level === 'beginner' ? ['intermediate', m.min_intermediate, m.floor_intermediate]
    : level === 'intermediate' ? ['advanced', m.min_advanced, m.floor_advanced] : null;
  if (!next) reason = `المؤشر ${composite} بلغ حد مستوى احترافي (${m.min_advanced}) ولا المعرفة ولا المواقف دون ${m.floor_advanced}`;
  else {
    const [nl, nmin, nfloor] = next;
    const gap = Math.round((Number(nmin) - composite) * 10) / 10;
    // الحدّية تعني أن المستوى التالي في متناول هامش صغير: فجوة المؤشر عن حده
    // وفجوة أضعف جانب مُقيَّد عن أرضيته معًا داخل الهامش. من بلغ المؤشر لكن
    // أرضيته بعيدة، أو العكس، ليس حدّيًا لأن هامشًا واحدًا لا يرفعه.
    const floorGap = Math.round((Number(nfloor) - low) * 10) / 10;
    borderline = gap <= Number(m.borderline) && floorGap <= Number(m.borderline);
    if (composite >= Number(nmin)) {
      reason = `المؤشر ${composite} يكفي لمستوى ${LEVEL_AR[nl]}، لكن ${TIER_AR[weakest]} ${low}% دون الحد الأدنى ${nfloor}%`;
    } else {
      reason = `المؤشر ${composite} من 100، ويبعد ${gap} عن حد مستوى ${LEVEL_AR[nl]} (${nmin})`;
    }
  }
  return { level, composite, borderline, reason, ...flagsOf(lowPractice) };
}

// السبب المخزَّن: سبب المستوى ثم الأعلام، حتى يراها من يقرأ reason_ar وحده
export const reasonWithFlags = (e) => [e.reason, ...(e.flags || []).map((f) => f.reason_ar)].filter(Boolean).join(' · ');

// ── مسافة الأسئلة عن المستوى التالي ──
// كم سؤالًا يفصل المشارك عن المستوى التالي؟ رقم للمستشار يكمل رقاقة «حدّية».
// الحساب: كل سؤال معرفة أو موقف درجته القصوى 4 من 24 في الجانب (6 أسئلة)،
// وكل عبارة ممارسة 4 من 16 (4 عبارات)؛ فالنقطة الواحدة في الجانب تساوي
// 100/24 أو 100/16 من مئته، وفي المؤشر المركّب 0.35·(100/24) = 1.46 للمعرفة
// و0.50·(100/24) = 2.08 للمواقف و0.15·(100/16) = 0.94 للممارسة (بالأوزان
// الافتراضية). السؤال الكامل (0 ← 4) أربع نقاط: 5.83 و8.33 و3.75 في المؤشر.
// نبحث عن أقل عدد من الأسئلة الكاملة (موزعة على الجوانب الحاضرة) يرفع
// المؤشر فوق حد المستوى التالي ويرفع المعرفة والمواقف فوق أرضيتهما معًا (الممارسة
// تدخل المؤشر بوزنها ولا أرضية لها)، بإعادة تقييم
// evaluatePlacement نفسها حتى لا يختلف الرقم عن قرار المستوى. null حين لا
// مستوى تالٍ (احترافي) أو لا جوانب أو لا يُبلغ بكل الأسئلة.
// evaluation: ناتج evaluatePlacement مع نسب الجوانب { knowledge, skill, behavior }.
export const ITEM_POINTS = 4;
export const TIER_MAX_POINTS = { knowledge: 24, skill: 24, behavior: 16 };
export function itemsToFlip(evaluation, model = DEFAULT_MODEL) {
  if (!evaluation || evaluation.level === 'advanced') return null;
  const m = { ...DEFAULT_MODEL, ...(model || {}) };
  const w = { knowledge: Number(m.w_knowledge), skill: Number(m.w_skill), behavior: Number(m.w_behavior) };
  const tiers = TIERS.filter((t) => evaluation[t] != null && w[t] > 0);
  if (!tiers.length) return null;
  const rank = (l) => LEVELS.indexOf(l);
  const current = rank(evaluatePlacement(Object.fromEntries(tiers.map((t) => [t, evaluation[t]])), m).level);
  const step = (t) => ITEM_POINTS * 100 / TIER_MAX_POINTS[t];
  const room = (t) => Math.ceil(Math.max(0, 100 - Number(evaluation[t])) / step(t) - 1e-9);
  const lifted = (counts) => {
    const pcts = {};
    for (const t of tiers) pcts[t] = Math.min(100, Number(evaluation[t]) + (counts[t] || 0) * step(t));
    return rank(evaluatePlacement(pcts, m).level) > current;
  };
  const limit = tiers.reduce((a, t) => a + room(t), 0);
  // أقل مجموع أولًا: كل توزيع لعدد n على الجوانب الحاضرة
  for (let n = 1; n <= limit; n += 1) {
    const found = (i, left, counts) => {
      if (i === tiers.length) return left === 0 && lifted(counts);
      const t = tiers[i];
      for (let k = Math.min(left, room(t)); k >= 0; k -= 1) if (found(i + 1, left - k, { ...counts, [t]: k })) return true;
      return false;
    };
    if (found(0, n, {})) return n;
  }
  return null;
}

export function placementFromAnswers(questions, answers, rules, model = null) {
  const minBehavior = model ? Number(model.min_behavior_items ?? DEFAULT_MODEL.min_behavior_items) : 0;
  const pcts = tierPercents(questions, answers, { minBehavior });
  const acq = model ? acquiescenceFor(questions, answers) : {};
  return DIMENSIONS.map((dimension) => {
    if (model) return { dimension, ...pcts[dimension], ...evaluatePlacement(pcts[dimension], model, { acquiescence: acq[dimension] }) };
    return { dimension, ...pcts[dimension], level: levelFor(pcts[dimension], rules.filter((r) => r.dimension === dimension)) };
  });
}

// هل يخص المتطلب هذا المشارك؟ عام، أو لبُعد، أو لبُعد ومستوى محددين.
export function requirementApplies(req, levels) {
  if (req.active === false) return false;
  if (!req.dimension) return true;
  if (!req.level) return true;
  return levels[req.dimension] === req.level;
}

// المتطلبات التي يحسمها النظام من حالة المشارك لا من نقرة، أيًا كان نوعها
// (P-INFO نموذج وP-CV رفع، لكن إنجازهما يُقرأ من الملف الشخصي).
export const AUTO_CHECKS = {
  'P-INFO':  (s) => !!s.profileCompleted,
  'P-CV':    (s) => !!s.hasCv,
  'A-DONE':  (s) => !!s.baselineSubmitted,
  'AP-OK':   (s) => !!s.placementApproved,
  'E-POST':  (s) => !!s.postSubmitted,
  'R-ISSUE': (s) => !!s.reportIssued,
};

// يبني الرحلة كما يراها المشارك: كل مرحلة بحالتها ومتطلباتها.
// المرحلة تكتمل حين تكتمل متطلباتها الإلزامية، والمرحلة الأولى غير
// المكتملة هي الحالية، وما بعدها مقفل. لا قفز فوق مرحلة.
export function buildJourney({ stages, requirements, progress, levels, state, activity = {} }) {
  const sorted = [...stages].filter((s) => s.active !== false).sort((a, b) => a.sort - b.sort);
  let reachedCurrent = false;
  return sorted.map((stage) => {
    const items = requirements
      .filter((r) => r.stage_key === stage.key && requirementApplies(r, levels))
      .sort((a, b) => a.sort - b.sort)
      .map((r) => {
        const auto = AUTO_CHECKS[r.code] || null;
        const p = progress[r.id] || {};
        // النشاط الموثق يكتمل بدليله، أو باعتماد يدوي من المستشار
        const act = activity[r.id] || null;
        const status = auto ? (auto(state) ? 'done' : 'pending')
          : act ? (act.done || p.status === 'done' ? 'done' : 'pending')
          : p.status || 'pending';
        return { ...r, auto: !!auto, status, note: p.note || null, evidence_path: p.evidence_path || null, ...(act ? { activity: act } : {}) };
      });
    const required = items.filter((i) => i.required);
    const complete = required.length > 0 && required.every((i) => i.status === 'done');
    let status;
    if (reachedCurrent) status = 'locked';
    else if (complete) status = 'done';
    else { status = 'active'; reachedCurrent = true; }
    const doneCount = items.filter((i) => i.status === 'done').length;
    return { ...stage, status, items, done: doneCount, total: items.length };
  });
}

// نسبة التقدم الكلية: المراحل المكتملة مع جزء المرحلة الحالية.
export function journeyProgress(journey) {
  if (!journey.length) return 0;
  let score = 0;
  for (const s of journey) {
    if (s.status === 'done') score += 1;
    else if (s.status === 'active' && s.total) score += s.done / s.total;
  }
  return Math.round((score / journey.length) * 100);
}

// خلط ثابت لكل مشارك: نفس الترتيب كلما عاد، ومختلف بين المشاركين.
export function seededShuffle(list, seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

// جوال سعودي أو دولي، يُحفظ بصيغة موحدة تبدأ بـ +
export function normalizePhone(p) {
  const d = String(p || '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (/^05\d{8}$/.test(d)) return '+966' + d.slice(1);
  if (/^5\d{8}$/.test(d)) return '+966' + d;
  if (/^9665\d{8}$/.test(d)) return '+' + d;
  if (/^\+\d{8,15}$/.test(d)) return d;
  return null;
}

// ── الكتيب ──
const RANK = { beginner: 0, intermediate: 1, advanced: 2 };

// أبواب الكتيب التي تخص المشارك: مستواه في البُعد ≥ أدنى مستوى للباب
// المستوى الملخص الذي يراه المشارك: وسيط مستوياته في الأبعاد الثلاثة.
// التفصيل لكل بُعد للإدارة فقط، ويبقى يوجّه الرحلة والكتيب داخليًا.
export function overallLevel(levels) {
  const ranks = Object.values(levels || {}).filter((l) => l in RANK).map((l) => RANK[l]).sort((a, b) => a - b);
  if (!ranks.length) return null;
  return LEVELS[ranks[Math.floor((ranks.length - 1) / 2)]];
}

// رمز المسار من مستويات الأطر الثلاثة: M{1..3}I{1..3}L{1..3}، أي 27 مسارًا.
// لا مسار قبل أن تتحدد المستويات الثلاثة كلها.
export function trackKey(levels) {
  const n = (d) => (levels?.[d] in RANK ? RANK[levels[d]] + 1 : null);
  const [m, i, l] = DIMENSIONS.map(n);
  return m && i && l ? `M${m}I${i}L${l}` : null;
}

// العكس: مفتاح المسار إلى مستوياته (M1I2L3 ← تأسيسي، متوسط، احترافي)
export function trackLevels(key) {
  const m = String(key || '').match(/^M([1-3])I([1-3])L([1-3])$/);
  return m ? Object.fromEntries(DIMENSIONS.map((d, i) => [d, LEVELS[Number(m[i + 1]) - 1]])) : null;
}

// ── محور الأولوية للمشارك ──
// الأضعف مستوى بين الأبعاد الثلاثة. عند التعادل: الأدنى مؤشرًا مركّبًا من
// نتائج قياسه (assessment_results)، ثم ترتيب الأبعاد. بلا مؤشرات للمتعادلين
// يبقى افتراض المسار (tracks.priority_dimension) إن كان بينهم.
// composites: { milestone: 52.3, ... } أو null.
/** @param {Record<string, string>} levels @param {Record<string, number> | null} [composites] @param {string | null} [fallback] @returns {string | null} */
export function priorityFor(levels, composites = null, fallback = null) {
  const rank = (d) => LEVELS.indexOf(levels?.[d]);
  if (DIMENSIONS.some((d) => rank(d) < 0)) return fallback || null;
  const min = Math.min(...DIMENSIONS.map(rank));
  const tied = DIMENSIONS.filter((d) => rank(d) === min);
  if (tied.length === 1) return tied[0];
  const c = (d) => (composites?.[d] == null || composites[d] === '' ? null : Number(composites[d]));
  if (tied.every((d) => c(d) != null && Number.isFinite(c(d)))) {
    return tied.reduce((a, d) => (c(d) < c(a) ? d : a), tied[0]);
  }
  return fallback && tied.includes(fallback) ? fallback : tied[0];
}
// مضاعفة وزن محور الأولوية في معيار الوثيقة: لا مضاعفة إذا تساوت المستويات
// الثلاثة، فلا أولوية حقيقية يُكافأ عليها محور دون غيره.
/** @param {Record<string, string>} levels @param {string | null} priority @returns {string | null} */
export function rubricPriority(levels, priority) {
  const ls = DIMENSIONS.map((d) => levels?.[d]);
  if (ls.every((l) => l) && ls.every((l) => l === ls[0])) return null;
  return priority || null;
}

// ملف التعريف المعروض للمشارك: المسارات الـ27 تبقى مفتاحًا داخليًا للاشتقاق،
// وما يُعرض هو محور الأولوية بمستواه فيه (9 ملفات في track_profiles: الأولوية عند التعادل بمؤشرات المشارك).
export const profileKey = (levels, priority) => (priority && levels?.[priority] in RANK ? `${priority}-${levels[priority]}` : null);

// سطر مولَّد يسمّي أقوى أطر المشارك بأسماء القاموس، ولا يكشف مستوى أي إطار
/** @param {Record<string, string>} levels @param {string | null} [priority] */
export function strengthsLine(levels, priority = null) {
  const r = DIMENSIONS.map((d) => RANK[levels?.[d]]);
  if (r.some((x) => x === undefined)) return null;
  const top = Math.max(...r);
  const strong = DIMENSIONS.filter((d, i) => r[i] === top);
  const name = (d) => DIM_AR[d];
  const deep = priority ? name(priority) : null;
  if (strong.length === DIMENSIONS.length) return `مستوياتك متقاربة في الأطر الثلاثة${deep ? `، ويبدأ تعمقك من ${deep}` : ''}.`;
  const list = strong.map(name).join(' و');
  return `أقوى أطرك: ${list}.${deep ? ` ${strong.length === 1 ? 'تبني عليه' : 'تبني عليهما'} وأنت تعمّق ${deep}.` : ''}`;
}

export function handbookModulesFor(modules, levels) {
  return modules
    .filter((m) => levels[m.dimension] && RANK[levels[m.dimension]] >= RANK[m.min_level] && (m.body_md || '').trim())
    .sort((a, b) => DIMENSIONS.indexOf(a.dimension) - DIMENSIONS.indexOf(b.dimension) || a.sort - b.sort);
}

// نطاق العمل: المستوى يقيس الإتقان، والنطاق يحدد أين يمارسه المشارك.
export const SCOPES = ['project', 'program', 'portfolio'];
const SCOPE_RANK = { project: 0, program: 1, portfolio: 2 };

// كتل المستوى والنطاق داخل الباب:
//   :::min=intermediate … :::  لمن مستواه متوسط فأعلى
//   :::only=beginner   … :::  لمستوى واحد فقط
//   :::scope=program   … :::  لمن يقود برامج فأعلى (ومن لم يحدد نطاقه)
//   :::min=advanced scope=portfolio … :::  الشرطان معًا
// تُحذف على الخادم قبل الإرسال، فلا يصل للمشارك ما لا يخص مستواه ونطاقه.
const BLOCK_RE = /^:::((?:\s*(?:min|only)=(?:beginner|intermediate|advanced)|\s*scope=(?:project|program|portfolio))+)\s*$/;
/** @param {string} md @param {string} [level] @param {string|null} [scope] */
/** @param {string|null} [scope] */
export function filterHandbookMd(md, level, scope = null) {
  const out = [];
  let keep = true;
  for (const line of String(md || '').split('\n')) {
    const open = line.trim().match(BLOCK_RE);
    if (open) {
      keep = open[1].trim().split(/\s+/).every((t) => {
        const [k, v] = t.split('=');
        if (k === 'min') return RANK[level] >= RANK[v];
        if (k === 'only') return level === v;
        return !(scope in SCOPE_RANK) || SCOPE_RANK[scope] >= SCOPE_RANK[v];
      });
      continue;
    }
    if (line.trim() === ':::') { keep = true; continue; }
    if (keep) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// فحص كتل الباب قبل الحفظ: الخطأ يغيّر ما يصل المشارك فيُمنع الحفظ،
// والتنبيه لا يغيّره لكنه يدل على سهو. level مستوى الباب نفسه (min_level).
export function lintHandbookMd(md, level = 'beginner') {
  const out = [];
  let open = null;
  let body = 0;
  const lines = String(md || '').split('\n');
  const close = (n) => {
    if (open && !body) out.push({ line: open.line, level: 'warn', msg: 'كتلة فارغة لا محتوى فيها' });
    open = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const n = i + 1;
    if (!line.startsWith(':::')) { if (open && line) body++; return; }
    if (line === ':::') {
      if (!open) out.push({ line: n, level: 'warn', msg: 'إغلاق ::: بلا كتلة مفتوحة قبله' });
      close(n);
      return;
    }
    const m = line.match(BLOCK_RE);
    if (!m) { out.push({ line: n, level: 'error', msg: `وسم غير معروف "${line}": الصيغ المعتمدة min= و only= و scope=` }); return; }
    if (open) out.push({ line: n, level: 'error', msg: `كتلة تبدأ قبل إغلاق كتلة السطر ${open.line}: أضف ::: قبلها، فالكتل لا تتداخل` });
    const tags = m[1].trim().split(/\s+/);
    const min = tags.find((t) => t.startsWith('min='))?.slice(4);
    const only = tags.find((t) => t.startsWith('only='))?.slice(5);
    if (min && only) out.push({ line: n, level: 'error', msg: 'لا يجتمع min= و only= في وسم واحد' });
    if (min && RANK[min] <= RANK[level] && !tags.some((t) => t.startsWith('scope=')))
      out.push({ line: n, level: 'warn', msg: `الوسم min=${min} لا يحجب شيئًا: الباب نفسه لا يظهر إلا من هذا المستوى` });
    if (only && RANK[only] < RANK[level]) out.push({ line: n, level: 'error', msg: `الوسم only=${only} لا يصل أحدًا: الباب يبدأ من مستوى أعلى` });
    if (tags.includes('scope=project')) out.push({ line: n, level: 'warn', msg: 'scope=project يصل كل النطاقات، فلا حاجة إليه' });
    open = { line: n };
    body = 0;
  });
  if (open) {
    out.push({ line: open.line, level: 'error', msg: 'كتلة لم تُغلق بـ ::: فيختفي كل ما بعدها حتى آخر الباب عمن لا تخصه' });
  }
  return out;
}

// فحص جودة الاختبار: ما يمنع ظهور السؤال خطأ، وما يجعله سهل التخمين تنبيه
export function lintQuiz(md) {
  const out = [];
  let cur = null;
  const done = () => {
    if (!cur) return;
    const { n, opts, stars, why } = cur;
    if (opts.length < 2 || !stars) out.push({ q: n, level: 'error', msg: 'لن يظهر للمشارك: يحتاج خيارين على الأقل وخيارًا صحيحًا يبدأ بـ *' });
    else {
      if (stars > 1) out.push({ q: n, level: 'error', msg: 'أكثر من خيار موسوم بـ *، والمعتمد آخرها فقط' });
      if (new Set(opts.map((o) => o.t)).size < opts.length) out.push({ q: n, level: 'error', msg: 'خياران بالنص نفسه' });
      if (opts.length < 3) out.push({ q: n, level: 'warn', msg: 'خياران فقط: نصف المشاركين يصيبون بالتخمين' });
      const right = opts.filter((o) => o.ok).pop().t.length;
      const other = Math.max(...opts.filter((o) => !o.ok).map((o) => o.t.length));
      if (opts.length >= 3 && right > other * 1.3) out.push({ q: n, level: 'warn', msg: 'الخيار الصحيح أطول الخيارات بوضوح، فيُعرف بطوله لا بفهمه' });
      if (!why) out.push({ q: n, level: 'warn', msg: 'بلا "لماذا:"، فلا يتعلم المشارك من خطئه' });
    }
    cur = null;
  };
  let n = 0;
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trim();
    let m;
    if (/^س\s*[:：]/.test(line)) { done(); cur = { n: ++n, opts: [], stars: 0, why: '' }; }
    else if (cur && (m = line.match(/^([-*])\s+(.+)$/))) { cur.opts.push({ t: m[2].trim(), ok: m[1] === '*' }); if (m[1] === '*') cur.stars++; }
    else if (cur && /^لماذا\s*[:：]\s*\S/.test(line)) cur.why = line;
  }
  done();
  return out;
}

// خلط خيارات الاختبار بترتيب ثابت لكل مشارك وباب، فلا يدل موضع الخيار
// على صحته. الخادم يعرض ويصحح بالترتيب نفسه، فالإجابة رقم في القائمة المعروضة.
export function shuffleQuiz(quiz, seed) {
  return quiz.map((q, i) => {
    const order = seededShuffle(q.options.map((_, k) => k), `${seed}:${i}`);
    return { ...q, options: order.map((k) => q.options[k]), answer: order.indexOf(q.answer) };
  });
}

// ── الكتاب التفاعلي: الاختبارات والنقاط ──
// صيغة الاختبار في quiz_md:
//   س: نص السؤال
//   - خيار
//   * الخيار الصحيح
//   لماذا: شرح يظهر بعد الإجابة
// أسئلة الباب كما تخص المشارك: كتل المستوى والنطاق نفسها التي تصفّي المتن
/** @param {any} md @param {any} level @param {string|null} [scope] */
export const quizFor = (md, level, scope = null) => parseQuiz(filterHandbookMd(md, level, scope));

export function parseQuiz(md) {
  const qs = [];
  let cur = null;
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^س\s*[:：]\s*(.+)$/))) { cur = { q: m[1].trim(), options: [], answer: -1, why: '' }; qs.push(cur); }
    else if (cur && (m = line.match(/^([-*])\s+(.+)$/))) {
      if (m[1] === '*') cur.answer = cur.options.length;
      cur.options.push(m[2].trim());
    } else if (cur && (m = line.match(/^لماذا\s*[:：]\s*(.+)$/))) cur.why = m[1].trim();
  }
  return qs.filter((q) => q.options.length >= 2 && q.answer >= 0);
}

export const POINTS = { chapter: 10, perCorrect: 5, reflection: 5 };

// يصحح إجابات المشارك ويعيد النتيجة بلا كشف الإجابات قبل الإرسال
export function gradeQuiz(quiz, answers) {
  const list = Array.isArray(answers) ? answers : [];
  const results = quiz.map((q, i) => ({ correct: Number(list[i]) === q.answer, answer: q.answer, why: q.why }));
  return { score: results.filter((r) => r.correct).length, total: quiz.length, results };
}

export function chapterPoints(score, reflection) {
  return POINTS.chapter + score * POINTS.perCorrect + (String(reflection || '').trim().length >= 20 ? POINTS.reflection : 0);
}

// ألقاب التقدم بحسب مجموع النقاط
export const RANKS = [
  { min: 0, title: 'مستكشف' },
  { min: 75, title: 'ممارس' },
  { min: 200, title: 'متمكّن' },
  { min: 400, title: 'قائد أثر' },
  { min: 650, title: 'سفير الأثر' },
];
export function rankFor(points) {
  const i = RANKS.reduce((a, r, j) => (points >= r.min ? j : a), 0);
  const next = RANKS[i + 1] || null;
  return { title: RANKS[i].title, index: i, next: next ? { title: next.title, at: next.min, left: next.min - points } : null };
}

// النماذج التعليمية المتاحة بمستوى المشارك في كل بُعد
// scope: نطاق عمل المشارك (participants.work_scope). النموذج المخصص لنطاقات
// بعينها (scopes) لا يظهر لغيرها، ومن لم يحدد نطاقه يُعامل معاملة المشروع.
const scopeOk = (scopes, scope) => !(scopes || []).length || scopes.includes(scope || 'project');
/** @param {any[]} models @param {Record<string, string>} levels @param {string|null} [scope] */
export function modelsFor(models, levels, scope = null) {
  return models
    .filter((m) => m.active !== false && levels[m.dimension] && RANK[levels[m.dimension]] >= RANK[m.min_level] && scopeOk(m.scopes, scope))
    .sort((a, b) => DIMENSIONS.indexOf(a.dimension) - DIMENSIONS.indexOf(b.dimension) || a.sort - b.sort);
}

// حقول النموذج كما تخص المشارك: الحقل قد يُطلب من مستوى أعلى (min_level)
// أو لنطاقات بعينها (scopes)، فيتعمق النموذج نفسه مع المستوى والنطاق دون
// نسخ نموذج لكل حالة. level: مستوى المشارك في بُعد النموذج.
// primary: بُعد النموذج هو محور الأولوية في مسار المشارك، فتظهر حقول التعمق (track).
// min_rows_beginner: أقل صفوف الجدول للتأسيسي حين يكون أخف من غيره.
export function fieldsFor(fields, level, scope = null, primary = false) {
  return (fields || [])
    .filter((f) => (!f.min_level || RANK[level] >= RANK[f.min_level]) && scopeOk(f.scopes, scope) && (!f.track || primary))
    .map((f) => (f.min_rows_beginner && level === 'beginner' ? { ...f, min_rows: f.min_rows_beginner } : f));
}

// يتحقق من اكتمال النموذج قبل التسليم؛ يعيد قائمة بالحقول الناقصة
// اكتمال الحقل: قاعدة واحدة يقرؤها الخادم عند التسليم والواجهة في شريط التقدم
export const tableRows = (v) => (Array.isArray(v) ? v : []).filter((r) => Array.isArray(r) && String(r[0] || '').trim());
export function fieldFilled(f, v) {
  return f.type === 'table' ? tableRows(v).length >= (f.min_rows || 1) : !!String(v ?? '').trim();
}
export function missingFields(fields, answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const missing = [];
  for (const f of fields || []) {
    if (f.required === false || fieldFilled(f, a[f.key])) continue;
    missing.push(f.type === 'table' ? `${f.label}: ${f.min_rows || 1} صفوف على الأقل` : f.label);
  }
  return missing;
}

// يقلّم إجابات النموذج إلى حقوله فقط وبأطوال معقولة
export function cleanAnswers(fields, answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const out = {};
  for (const f of fields || []) {
    const v = a[f.key];
    if (f.type === 'table') {
      const cols = (f.columns || []).length || 1;
      out[f.key] = (Array.isArray(v) ? v : []).slice(0, 40)
        .map((r) => Array.from({ length: cols }, (_, i) => String((Array.isArray(r) ? r[i] : '') ?? '').slice(0, 600)));
    } else if (f.type === 'select') out[f.key] = (f.options || []).includes(v) ? v : '';
    else out[f.key] = String(v ?? '').slice(0, f.type === 'textarea' ? 4000 : 300);
  }
  return out;
}

// ── منسق الجهة ──
// صلاحيات العرض الافتراضية: بلا درجات ولا وسائل تواصل، والتصدير مسموح
export const COORD_DEFAULTS = { list: true, scores: false, contact: false, activity: false, export: true };
export function coordPermissions(p) {
  const x = p && typeof p === 'object' ? p : {};
  return { list: x.list !== false, scores: x.scores === true, contact: x.contact === true, activity: x.activity === true, export: x.export !== false };
}
// قوالب المطّلعين: نقطة بداية تُضبط بعدها كل صلاحية وحدها (القالب «مخصّص» حين تختلف عنه)
export const COORD_TEMPLATES = {
  executive: { list: false, scores: false, contact: false, activity: false, export: false },
  program: { list: true, scores: false, contact: false, activity: true, export: true },
  hr: { list: true, scores: false, contact: true, activity: false, export: true },
};
export function templateOf(perms) {
  const p = coordPermissions(perms);
  return Object.keys(COORD_TEMPLATES).find((k) => Object.entries(COORD_TEMPLATES[k]).every(([x, v]) => p[x] === v)) || 'custom';
}
// المطّلع نافذ ما لم يُوقف أو تنتهِ مدته أو تتوقف جهته
export const viewerActive = (c, now = Date.now()) => !!c && c.status !== 'suspended' && (!c.expires_at || Date.parse(c.expires_at) > now)
  && c.organizations?.status !== 'inactive';
// ما يعرفه المشارك عن اطلاع جهته: اتحاد صلاحيات المطّلعين النافذين، وعددهم
export function orgVisibility(viewers, now = Date.now()) {
  const live = (viewers || []).filter((c) => viewerActive(c, now));
  const any = (k) => live.some((c) => coordPermissions(c.permissions)[k]);
  return { viewers: live.length, list: any('list'), activity: any('activity'), contact: any('contact'), scores: any('scores'), export: any('export') };
}
// أقل عدد تُعرض له أرقام مجمّعة عن مشاركين: دونه يكشف المتوسط درجة الفرد
export const MIN_COHORT = 5;

// ما يراه المنسق من المشارك: الاسم والمسمى والمسار والمرحلة ونسبة الإنجاز دائمًا،
// والنشاط (آخر دخول) والتواصل والدرجات فقط إن سمح المدير. لا شيء غيرها يخرج من الخادم.
export function coordParticipant(p, perms) {
  if (!perms.list) return null;   // راعٍ تنفيذي: أرقام مجمّعة فقط، بلا أسماء
  const out = {
    id: p.id, full_name: p.full_name, job_title: p.job_title || null, status: p.status,
    track: p.track || null, track_title: p.track_title || null, approved: !!p.approved,
    progress: Number.isFinite(p.progress) ? p.progress : 0, created_at: p.created_at,
  };
  if (perms.activity) out.last_login_at = p.last_login_at || null;
  if (perms.contact) { out.email = p.email || null; out.phone = p.phone || null; }
  if (perms.scores) out.levels = p.levels || null;
  return out;
}

// مفتاح أسبوع ISO لمنع إرسال التقرير الأسبوعي مرتين
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}

// ════════════════════════════════════════════════════════════════
// الأنشطة الموثقة: قراءة، فيديو، ورشة حضورية، جلسات توجيه
// ════════════════════════════════════════════════════════════════
// المتطلب من هذه الأنواع لا يكتمل بنقرة؛ يحسمه دليل يجمعه النظام.
// تجاوز يدوي من المستشار (participant_requirements.status = done) يبقى ممكنًا.
export const VERIFIED_KINDS = ['reading', 'video', 'workshop', 'coaching', 'curriculum', 'model', 'capstone'];

// ── القراءة ──
// الباب يُقسم إلى READ_SLICES شريحة متساوية الارتفاع. القراءة الفعلية:
// وقت نشط لا يقل عن نصف الوقت المتوقع (200 كلمة في الدقيقة)، وأغلب
// الشرائح بقي أمامها القارئ وقتًا معقولًا. المرور السريع على الشرائح
// كلها دون وقت كافٍ يُعد تصفحًا لا قراءة.
export const READ_WPM = 200;
export const READ_SLICES = 20;
export const READ_TIME_RATIO = 0.5;
export const READ_COVERAGE = 0.8;

export const wordCount = (md) => String(md || '').replace(/[#*>`_:|-]+/g, ' ').split(/\s+/).filter(Boolean).length;
export const expectedSeconds = (words) => Math.max(60, Math.round((Number(words) || 0) / READ_WPM * 60));

export function readingVerdict(row) {
  if (!row || !row.active_seconds) return { state: 'unread', pct: 0, seconds: 0, expected: row ? expectedSeconds(row.words) : null };
  const expected = expectedSeconds(row.words);
  const slices = Array.from({ length: READ_SLICES }, (_, i) => Number(row.slices?.[i]) || 0);
  const perSlice = Math.max(2, (expected / READ_SLICES) * 0.25);
  const covered = slices.filter((s) => s >= perSlice).length / READ_SLICES;
  const seen = slices.filter((s) => s > 0).length / READ_SLICES;
  const timeRatio = row.active_seconds / expected;
  const pct = Math.round(Math.min(timeRatio / READ_TIME_RATIO, 1) * 50 + Math.min(covered / READ_COVERAGE, 1) * 50);
  const state = timeRatio >= READ_TIME_RATIO && covered >= READ_COVERAGE ? 'read'
    : seen >= READ_COVERAGE ? 'skimmed' : 'partial';
  return { state, pct: state === 'read' ? 100 : Math.min(pct, 99), seconds: row.active_seconds, expected };
}
export const READING_STATE_AR = { read: 'قرأ', skimmed: 'تصفّح سريعًا', partial: 'قراءة جزئية', unread: 'لم يقرأ' };

// يضيف نبضة قراءة إلى السجل. الثواني المرسلة لا تتجاوز الزمن الفعلي
// منذ النبضة السابقة، فلا يمكن تضخيم الوقت بإرسال أرقام كبيرة.
export const READ_PING_MAX = 35;
export function applyReadingPing(row, ping, now = Date.now()) {
  const last = row?.last_ping_at ? new Date(row.last_ping_at).getTime() : 0;
  const elapsed = last ? Math.max(0, (now - last) / 1000) + 2 : READ_PING_MAX;
  const budget = Math.min(READ_PING_MAX, elapsed);
  const raw = (Array.isArray(ping?.slices) ? ping.slices : []).slice(0, READ_SLICES).map((s) => Math.max(0, Number(s) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scale = sum > budget ? budget / sum : 1;
  const slices = Array.from({ length: READ_SLICES }, (_, i) => Math.min(32000, Math.round((Number(row?.slices?.[i]) || 0) + (raw[i] || 0) * scale)));
  const added = Math.round(Math.min(sum, budget));
  return { slices, active_seconds: (Number(row?.active_seconds) || 0) + added, added };
}

// أبواب متطلب القراءة: كل أبواب المشارك، أو الباب الأول من كل إطار،
// أو أبواب إطار واحد، أو قائمة محددة.
export function readingChapters(config, chapters) {
  const c = config || {};
  if (c.scope === 'first') return DIMENSIONS.map((d) => chapters.find((m) => m.dimension === d)).filter(Boolean);
  if (c.scope === 'dimension') return chapters.filter((m) => m.dimension === c.dimension);
  if (c.scope === 'list') return chapters.filter((m) => (c.module_ids || []).includes(m.id));
  return chapters;
}

export function readingStatus(config, chapters, reading, quizzes) {
  const list = readingChapters(config, chapters).map((m) => {
    const v = readingVerdict(reading[m.id]);
    const quiz = !!quizzes[m.id];
    return { id: m.id, title: m.title_ar, dimension: m.dimension, state: v.state, pct: v.pct, seconds: v.seconds, expected: v.expected, quiz };
  });
  const needQuiz = config?.quiz !== false;
  const ok = (x) => x.state === 'read' && (!needQuiz || x.quiz);
  const done = list.length > 0 && list.every(ok);
  return { type: 'reading', done, count: list.filter(ok).length, total: list.length, quiz: needQuiz, chapters: list };
}

// ── الفيديو ──
// المقاطع المشاهدة تُدمج، ولا يُقبل في النبضة الواحدة أكثر من ضعف الزمن
// الفعلي منذ السابقة (سرعة تشغيل حتى 2x).
export function mergeRanges(ranges, duration) {
  const max = Number(duration) > 0 ? Number(duration) : Infinity;
  const list = (ranges || [])
    .map(([a, b]) => [Math.max(0, Number(a) || 0), Math.min(max, Number(b) || 0)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of list) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]);
}
export const coveredSeconds = (ranges) => (ranges || []).reduce((s, [a, b]) => s + (b - a), 0);

export const VIDEO_PING_MAX = 30;
export function applyVideoPing(row, ping, now = Date.now()) {
  const duration = Math.max(Number(row?.duration) || 0, Math.min(6 * 3600, Number(ping?.duration) || 0));
  const before = mergeRanges(row?.ranges || [], duration);
  const last = row?.last_ping_at ? new Date(row.last_ping_at).getTime() : 0;
  const budget = Math.min(VIDEO_PING_MAX * 2, last ? ((now - last) / 1000 + 2) * 2 : VIDEO_PING_MAX * 2);
  const fresh = mergeRanges((Array.isArray(ping?.ranges) ? ping.ranges : []).slice(0, 50), duration);
  // ما يضيفه هذا الإرسال فوق ما سبق، مقصوصًا بالميزانية
  let left = budget;
  const accepted = [];
  for (const [a, b] of fresh) {
    if (left <= 0) break;
    const gain = coveredSeconds(mergeRanges([...before, [a, b]], duration)) - coveredSeconds(before);
    if (gain <= 0) continue;
    const take = Math.min(gain, left);
    accepted.push([a, a + (b - a) * (take / gain)]);
    left -= take;
  }
  const ranges = mergeRanges([...before, ...accepted], duration);
  return { duration, ranges, watched_seconds: Math.round(coveredSeconds(ranges)) };
}

export function videoStatus(config, row) {
  const min = Math.min(100, Math.max(10, Number(config?.min_pct) || 90));
  const pct = row?.duration > 0 ? Math.min(100, Math.round((Number(row.watched_seconds) / Number(row.duration)) * 100)) : 0;
  return { type: 'video', done: pct >= min, pct, min_pct: min, watched: Math.round(Number(row?.watched_seconds) || 0), duration: Math.round(Number(row?.duration) || 0) };
}

// يتعرف على مصدر الفيديو: يوتيوب أو ملف مباشر
export function videoSource(url) {
  const u = String(url || '').trim();
  const yt = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { type: 'youtube', id: yt[1] };
  if (/^https:\/\/\S+$/.test(u)) return { type: 'file', url: u };
  return null;
}

// ── الورشة الحضورية ──
// طرق توثيق حضور الجلسات الجماعية، يختارها المشرف لكل متطلب
export const VERIFY_METHODS = ['qr', 'join', 'manual'];
export const SESSION_MODES = ['in_person', 'online'];

export function workshopStatus(config, sessions, attended, now = Date.now()) {
  const verify = VERIFY_METHODS.includes(config?.verify) ? config.verify : 'qr';
  const list = (sessions || []).filter((s) => s.active !== false)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
    .map((s) => {
      const mode = s.mode === 'online' ? 'online' : 'in_person';
      const open = checkinOpen(s, now);
      // رابط الاجتماع لا يظهر إلا في نافذة الجلسة
      return {
        id: s.id, title: s.title_ar, mode, location: s.location_ar || null, starts_at: s.starts_at, ends_at: s.ends_at,
        attended: attended.has(s.id), open, can_join: mode === 'online' && open && !!s.join_url,
      };
    });
  const need = Math.max(1, Number(config?.sessions_required) || list.length || 1);
  const count = list.filter((s) => s.attended).length;
  return { type: 'workshop', done: count >= need, count, total: need, verify, sessions: list };
}

// نافذة الحضور: من ساعة قبل البدء إلى نصف ساعة بعد الانتهاء
export function checkinOpen(session, now = Date.now()) {
  return session.active !== false && now >= new Date(session.starts_at).getTime() - 3600e3 && now <= new Date(session.ends_at).getTime() + 1800e3;
}

// رمز QR يتغير كل QR_WINDOW ثانية: معرّف الجلسة.النافذة.توقيع مختصر.
// يُقبل رمز النافذة الحالية والسابقة فقط، فصورة الرمز لا تصلح بعد دقيقة.
export const QR_WINDOW = 30;
const te = new TextEncoder();
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, te.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const qrWindow = (now = Date.now()) => Math.floor(now / 1000 / QR_WINDOW);
export async function qrToken(sessionId, secret, w = qrWindow()) {
  return `${sessionId}.${w}.${(await hmacHex(secret, `${sessionId}.${w}`)).slice(0, 20)}`;
}
export function parseQrToken(t) {
  const m = String(t || '').match(/^([0-9a-f-]{36})\.(\d{1,12})\.([0-9a-f]{20})$/);
  return m ? { sessionId: m[1], window: Number(m[2]), sig: m[3] } : null;
}
export async function verifyQrToken(t, secret, now = Date.now()) {
  const p = parseQrToken(t);
  if (!p) return false;
  const w = qrWindow(now);
  if (p.window !== w && p.window !== w - 1) return false;
  return (await qrToken(p.sessionId, secret, p.window)) === t;
}

// ── جلسات التوجيه ──
export function coachingStatus(config, sessions, now = Date.now()) {
  const list = (sessions || []).filter((s) => s.status !== 'cancelled')
    .sort((a, b) => String(a.starts_at || a.created_at).localeCompare(String(b.starts_at || b.created_at)))
    .map((s) => ({
      id: s.id, kind: s.kind, status: s.status, starts_at: s.starts_at, ends_at: s.ends_at,
      join_url: s.status === 'cancelled' || s.status === 'no_show' ? null : s.join_url,
      awaiting: s.status !== 'attended' && s.status !== 'no_show' && (!s.ends_at || new Date(s.ends_at).getTime() < now),
    }));
  const need = Math.max(1, Number(config?.sessions_required) || 1);
  const count = list.filter((s) => s.status === 'attended').length;
  const open = list.filter((s) => s.status === 'booked' || s.status === 'requested').length;
  return { type: 'coaching', done: count >= need, count, total: need, can_book: count + open < need, sessions: list };
}

// الاتصال الفوري عن بعد فقط
export const instantAvailable = (config, now = Date.now()) =>
  config?.mode !== 'in_person' && !!(config?.instant_url && config?.instant_until && new Date(config.instant_until).getTime() > now);

// منصة الحجز من الرابط: Calendly أو Cal.com (أو نطاق Cal.com خاص)
export const bookingProvider = (url, explicit) =>
  explicit === 'calendly' || explicit === 'calcom' ? explicit : /calendly\.com/i.test(String(url || '')) ? 'calendly' : 'calcom';

// رابط الحجز بعد تعبئة الاسم والبريد ومرجع المشارك والمتطلب، ليعود في webhook
export function bookingUrl(config, { name, email, ref }) {
  let u;
  try { u = new URL(config?.booking_url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (name) u.searchParams.set('name', name);
  if (email) u.searchParams.set('email', email);
  if (bookingProvider(config.booking_url, config.provider) === 'calendly') {
    u.searchParams.set('utm_source', 'leaders');
    u.searchParams.set('utm_content', ref);
  } else {
    u.searchParams.set('metadata[ref]', ref);
  }
  return u.toString();
}

// يحوّل حدث webhook من Cal.com أو Calendly إلى صيغة واحدة
export function parseBooking(provider, body) {
  if (provider === 'calcom') {
    const p = body?.payload || {};
    const ev = { BOOKING_CREATED: 'created', BOOKING_RESCHEDULED: 'rescheduled', BOOKING_CANCELLED: 'cancelled', BOOKING_REJECTED: 'cancelled' }[body?.triggerEvent];
    if (!ev || !p.uid) return null;
    const join = p.videoCallData?.url || p.metadata?.videoCallUrl || (/^https:\/\//.test(p.location || '') ? p.location : null);
    return {
      event: ev, external_id: `calcom:${p.uid}`, previous_id: p.rescheduleUid ? `calcom:${p.rescheduleUid}` : null,
      ref: p.metadata?.ref || p.responses?.ref?.value || null,
      email: normalizeEmail(p.attendees?.[0]?.email), starts_at: p.startTime || null, ends_at: p.endTime || null,
      join_url: join || null, coach: p.organizer?.email || null,
    };
  }
  if (provider === 'calendly') {
    const p = body?.payload || {};
    const ev = { 'invitee.created': 'created', 'invitee.canceled': 'cancelled' }[body?.event];
    if (!ev || !p.uri) return null;
    const se = p.scheduled_event || {};
    return {
      event: ev, external_id: `calendly:${p.uri}`, previous_id: null,
      ref: p.tracking?.utm_content || null, email: normalizeEmail(p.email),
      starts_at: se.start_time || null, ends_at: se.end_time || null,
      join_url: se.location?.join_url || null, coach: se.event_memberships?.[0]?.user_email || null,
    };
  }
  return null;
}

// مرجع الحجز: معرّف المشارك.معرّف المتطلب
export function parseRef(ref) {
  const m = String(ref || '').match(/^([0-9a-f-]{36})\.([0-9a-f-]{36})$/);
  return m ? { participant_id: m[1], requirement_id: m[2] } : null;
}

// توقيع webhook: Cal.com يوقع الجسم كما هو، وCalendly يوقع "t.الجسم"
export async function verifyWebhook(provider, secret, raw, headers) {
  if (!secret) return false;
  const get = (k) => headers.get ? headers.get(k) : headers[k];
  if (provider === 'calcom') {
    const sig = String(get('x-cal-signature-256') || '');
    return !!sig && sig === (await hmacHex(secret, raw));
  }
  if (provider === 'calendly') {
    const h = String(get('calendly-webhook-signature') || '');
    const t = h.match(/t=(\d+)/)?.[1];
    const v1 = h.match(/v1=([0-9a-f]+)/)?.[1];
    if (!t || !v1) return false;
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
    return v1 === (await hmacHex(secret, `${t}.${raw}`));
  }
  return false;
}

// حالة نشاط موثق لمتطلب واحد من الأدلة المجمعة
export function activityFor(req, ev, now = Date.now()) {
  const c = req.config || {};
  if (req.kind === 'reading') return readingStatus(c, ev.chapters || [], ev.reading || {}, ev.quizzes || {});
  if (req.kind === 'video') return videoStatus(c, ev.video?.[req.id]);
  if (req.kind === 'workshop') return workshopStatus(c, (ev.workshops || []).filter((s) => s.requirement_id === req.id), ev.attended || new Set(), now);
  if (req.kind === 'coaching') return coachingStatus(c, (ev.coaching || []).filter((s) => s.requirement_id === req.id), now);
  if (req.kind === 'curriculum') {
    // يُفتح المنهج مع الكتيب بعد اعتماد المستويات
    if (ev.curriculumLocked) return { type: 'curriculum', done: false, locked: true, count: 0, total: 0, items: [] };
    return curriculumStatus(c, ev.content || [], ev.levels || {}, ev.contentProgress || {});
  }
  if (req.kind === 'model') return ev.modelsLocked ? { type: 'model', done: false, locked: true, model_key: c.model_key || null } : modelStatus(c, ev.models || {});
  if (req.kind === 'capstone') return { type: 'capstone', done: ev.capstone?.status === 'approved', status: ev.capstone?.status || null, readiness: ev.capstone?.readiness ?? null };
  return null;
}

// متطلب «نموذج» في الرحلة: لا رفع ملفات ولا نسخة ثانية من العمل. يكتمل من
// تسليم المشارك للنموذج نفسه في مكتبة النماذج، أو من تقييم المستشار له.
// models: نماذج المشارك المتاحة له بمفاتيحها؛ الغائب عنها لا يخص مستواه أو
// نطاقه، فلا يحبس مرحلته.
export function modelStatus(c, models) {
  if (!(c.model_key in models)) return { type: 'model', done: true, na: true, model_key: c.model_key || null };
  const s = models[c.model_key] || null;
  const st = s?.status || null;
  const done = c.accept === 'submitted' ? st === 'submitted' || st === 'reviewed' : st === 'reviewed';
  return { type: 'model', done, model_key: c.model_key || null, model_id: s?.model_id || null, title: s?.title || null, status: st, accept: c.accept === 'submitted' ? 'submitted' : 'reviewed' };
}

// إعداد النشاط كما يحفظه المستشار: حقول معروفة بقيم مضبوطة فقط.
// prev: الإعداد السابق، لحفظ ما لا يُحرَّر من النموذج (توفر الاتصال الفوري).
const httpsUrl = (u) => { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' ? x.toString() : null; } catch { return null; } };
// القيم الافتراضية لإعداد الجلسات: يعرضها كل من يقرأ إعدادًا ناقصًا
export const SESSION_DEFAULTS = { sessions_required: 1, minutes: 60 };
const intIn = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
export function cleanConfig(kind, cfg, prev = {}) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  if (kind === 'reading') {
    const scope = ['all', 'first', 'dimension', 'list'].includes(c.scope) ? c.scope : 'all';
    const out = { scope, quiz: c.quiz !== false };
    if (scope === 'dimension') {
      if (!DIMENSIONS.includes(c.dimension)) throw new Error('اختر الإطار لأبواب القراءة');
      out.dimension = c.dimension;
    }
    if (scope === 'list') {
      out.module_ids = (Array.isArray(c.module_ids) ? c.module_ids : []).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 60);
      if (!out.module_ids.length) throw new Error('اختر بابًا واحدًا على الأقل');
    }
    return out;
  }
  if (kind === 'video') {
    const url = String(c.url || '').trim();
    if (!videoSource(url)) throw new Error('رابط الفيديو: رابط يوتيوب أو ملف فيديو يبدأ بـ https');
    return { url, min_pct: intIn(c.min_pct, 10, 100, 90), ...(c.title ? { title: String(c.title).slice(0, 200) } : {}) };
  }
  if (kind === 'workshop') {
    return {
      sessions_required: intIn(c.sessions_required, 1, 30, SESSION_DEFAULTS.sessions_required), verify: VERIFY_METHODS.includes(c.verify) ? c.verify : 'qr',
      // مدة اليوم أو الجلسة التدريبية: مصدر ساعات الشهادة، ولا تُفترض إن لم تُكتب
      ...(c.minutes ? { minutes: intIn(c.minutes, 30, 600, 360) } : {}),
    };
  }
  if (kind === 'curriculum') {
    // منهج المسار كله، أو مواد بُعد واحد (لتوزيعه على مراحل)
    return DIMENSIONS.includes(c.dimension) ? { dimension: c.dimension } : {};
  }
  if (kind === 'model') {
    const key = String(c.model_key || '').trim();
    if (!/^[a-z0-9-]{2,60}$/.test(key)) throw new Error('اختر النموذج التعليمي الذي يكتمل به المتطلب');
    return { model_key: key, accept: c.accept === 'submitted' ? 'submitted' : 'reviewed' };
  }
  if (kind === 'capstone') return {};
  if (kind === 'coaching') {
    const out = {
      sessions_required: intIn(c.sessions_required, 1, 30, SESSION_DEFAULTS.sessions_required), minutes: intIn(c.minutes, 5, 480, SESSION_DEFAULTS.minutes),
      mode: ['online', 'in_person', 'any'].includes(c.mode) ? c.mode : 'online',
    };
    if (out.mode !== 'online' && String(c.location_ar || '').trim()) out.location_ar = String(c.location_ar).trim().slice(0, 300);
    if (String(c.booking_url || '').trim()) {
      out.booking_url = httpsUrl(c.booking_url);
      if (!out.booking_url) throw new Error('رابط الحجز يجب أن يبدأ بـ https');
      out.provider = bookingProvider(out.booking_url, c.provider);
    }
    if (String(c.instant_url || '').trim()) {
      out.instant_url = httpsUrl(c.instant_url);
      if (!out.instant_url) throw new Error('رابط الاتصال الفوري يجب أن يبدأ بـ https');
    }
    if (String(c.coach_email || '').trim()) {
      out.coach_email = normalizeEmail(c.coach_email);
      if (!isEmail(out.coach_email)) throw new Error('بريد الموجّه غير صحيح');
    }
    if (prev?.instant_until) out.instant_until = prev.instant_until;
    return out;
  }
  // لقاء بمدة معلنة (عرض أمام لجنة): المدة هنا مصدر ما يقوله وصف المرحلة
  if (kind === 'meeting') return c.minutes ? { minutes: intIn(c.minutes, 5, 480, SESSION_DEFAULTS.minutes) } : {};
  return {};
}

// ── منهج المسار: بنك المحتوى ──
// المادة تخص المشارك بوسمها: للجميع، أو لبُعد من مستوى فأعلى، أو لمستوى
// واحد. الاستثناء بالمسار يتقدم على الوسم: مسارات بعينها فقط، أو استبعاد.
export const CONTENT_KINDS = ['video', 'file', 'link'];
export function contentApplies(item, levels, track = trackKey(levels)) {
  if (!item || item.active === false) return false;
  if (track && (item.exclude_tracks || []).includes(track)) return false;
  if ((item.track_keys || []).length) return !!track && item.track_keys.includes(track);
  if (!item.dimension) return true;
  const lv = levels?.[item.dimension];
  if (!(lv in RANK)) return false;
  if (item.only_level) return lv === item.only_level;
  if (item.min_level) return RANK[lv] >= RANK[item.min_level];
  return true;
}

// مادة البنك كما يحفظها المشرف: رابط https، ووسم جمهور متسق، ومسارات صحيحة
const TRACK_RE = /^M[1-3]I[1-3]L[1-3]$/;
export function cleanContentItem(row, isNew = false) {
  const out = { ...row };
  if (isNew || 'kind' in row) { if (!CONTENT_KINDS.includes(row.kind)) throw new Error('نوع المادة: فيديو أو ملف أو رابط'); }
  if (isNew || 'title_ar' in row) { out.title_ar = String(row.title_ar || '').trim().slice(0, 200); if (!out.title_ar) throw new Error('عنوان المادة مطلوب'); }
  if (isNew || 'url' in row) {
    out.url = String(row.url || '').trim();
    if (!/^https:\/\/\S+$/.test(out.url)) throw new Error('الرابط يجب أن يبدأ بـ https');
    if (row.kind === 'video' && !videoSource(out.url)) throw new Error('رابط الفيديو: يوتيوب أو ملف فيديو مباشر');
  }
  if ('dimension' in row) out.dimension = DIMENSIONS.includes(row.dimension) ? row.dimension : null;
  for (const k of ['min_level', 'only_level']) if (k in row) out[k] = LEVELS.includes(row[k]) ? row[k] : null;
  if (!out.dimension && ('dimension' in row)) { out.min_level = null; out.only_level = null; }
  // الحقلان متبادلان: تحديد أحدهما يلغي الآخر
  if (out.min_level && !('only_level' in row)) out.only_level = null;
  else if (out.only_level && !('min_level' in row)) out.min_level = null;
  else if (out.min_level && out.only_level) out.min_level = null;
  for (const k of ['track_keys', 'exclude_tracks']) {
    if (!(k in row)) continue;
    const raw = Array.isArray(row[k]) ? row[k] : String(row[k] || '').split(/[\s,،]+/);
    const list = [...new Set(raw.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean))];
    const bad = list.find((x) => !TRACK_RE.test(x));
    if (bad) throw new Error(`مفتاح مسار غير صحيح: ${bad} (مثل M1I2L3)`);
    out[k] = list;
  }
  if ('min_pct' in row) out.min_pct = Math.min(100, Math.max(10, Math.round(Number(row.min_pct)) || 90));
  if ('minutes' in row) out.minutes = row.minutes == null || row.minutes === '' ? null : Math.min(600, Math.max(0, Math.round(Number(row.minutes)) || 0));
  return out;
}

// منهج المسار مرتبًا: العام أولًا ثم الأبعاد بترتيبها، وداخل كل منها بترتيب البنك
export function curriculumFor(items, levels, dimension = null) {
  const track = trackKey(levels);
  const order = (i) => (i.dimension ? DIMENSIONS.indexOf(i.dimension) + 1 : 0);
  return (items || [])
    .filter((i) => contentApplies(i, levels, track) && (!dimension || i.dimension === dimension))
    .sort((a, b) => order(a) - order(b) || (a.sort ?? 0) - (b.sort ?? 0));
}

export function contentState(item, row) {
  if (item.kind === 'video') {
    const pct = row?.duration > 0 ? Math.min(100, Math.round((Number(row.watched_seconds) / Number(row.duration)) * 100)) : 0;
    return { pct, done: pct >= (item.min_pct || 90), started: pct > 0 };
  }
  return { pct: row?.opened_at ? 100 : 0, done: !!row?.opened_at, started: !!row?.opened_at };
}

export function curriculumStatus(config, items, levels, progress) {
  const list = curriculumFor(items, levels, config?.dimension || null).map((i) => {
    const st = contentState(i, progress?.[i.id]);
    return {
      id: i.id, kind: i.kind, title: i.title_ar, description: i.description_ar || null, minutes: i.minutes ?? null,
      dimension: i.dimension || null, required: i.required !== false, url: i.url, min_pct: i.kind === 'video' ? i.min_pct || 90 : null,
      ...st,
    };
  });
  const need = list.filter((x) => x.required);
  const count = need.filter((x) => x.done).length;
  return { type: 'curriculum', done: count === need.length, count, total: need.length, items: list };
}

// ════════════════════════════════════════════════════════════════
// البرامج والدفعات
// ════════════════════════════════════════════════════════════════
// البرنامج يحدد ماذا يمر به القائد، والدفعة تحدد كيف ومتى ولمن.
// النسخة لقطة ثابتة من مراحل البرنامج ومتطلباته؛ الدفعة المثبتة على نسخة
// لا تتأثر بتعديلات البرنامج حتى تُرقّى.

// دفعة المشارك: تسجيله الصريح الأحدث (غير المنسحب)، ثم أحدث دفعة جارية
// أو مفتوحة لجهته، ثم الدفعة الافتراضية المفتوحة.
/** @param {{ enrollments?: any[], cohorts?: any[], organizationId?: string|null }} [input] */
export function pickCohort({ enrollments = [], cohorts = [], organizationId = null } = {}) {
  const byId = new Map(cohorts.map((c) => [c.id, c]));
  const enr = enrollments.filter((e) => e.status !== 'withdrawn' && byId.has(e.cohort_id))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  if (enr.length) return { cohort: byId.get(enr[0].cohort_id), via: 'enrollment' };
  if (organizationId) {
    const org = cohorts.filter((c) => c.organization_id === organizationId && !c.is_default && (c.status === 'open' || c.status === 'running'))
      .sort((a, b) => String(b.starts_on || b.created_at || '').localeCompare(String(a.starts_on || a.created_at || '')));
    if (org.length) return { cohort: org[0], via: 'organization' };
  }
  const d = cohorts.find((c) => c.is_default);
  return d ? { cohort: d, via: 'default' } : { cohort: null, via: 'none' };
}

// ما يُخصَّص لكل دفعة من إعداد النشاط. الباقي ثابت في البرنامج.
export const DELIVERY_FIELDS = {
  workshop: ['verify'],
  coaching: ['mode', 'location_ar', 'booking_url', 'instant_url', 'coach_email'],
};

// تخصيص الدفعة لمتطلب: يُدمج فوق إعداد البرنامج ويمر بالتحقق نفسه.
// تخصيص غير صالح لا يكسر الرحلة؛ يبقى إعداد البرنامج.
export function applyDelivery(req, override) {
  const keys = DELIVERY_FIELDS[req?.kind];
  if (!keys || !override || typeof override !== 'object') return req;
  const pick = Object.fromEntries(keys.filter((k) => override[k] != null && override[k] !== '').map((k) => [k, override[k]]));
  if (!Object.keys(pick).length) return req;
  try {
    return { ...req, config: cleanConfig(req.kind, { ...(req.config || {}), ...pick }, req.config || {}), delivery: pick };
  } catch {
    return req;
  }
}

// تخصيصات الدفعة كما يحفظها المشرف: مفاتيح معروفة لمتطلبات موجودة، بقيم صالحة.
export function cleanDelivery(delivery, requirements) {
  const out = {};
  const byCode = new Map((requirements || []).map((r) => [r.code, r]));
  for (const [code, v] of Object.entries(delivery && typeof delivery === 'object' ? delivery : {})) {
    const r = byCode.get(code);
    const keys = DELIVERY_FIELDS[r?.kind];
    if (!keys || !v || typeof v !== 'object') continue;
    const pick = Object.fromEntries(keys.filter((k) => v[k] != null && String(v[k]).trim() !== '').map((k) => [k, typeof v[k] === 'string' ? v[k].trim() : v[k]]));
    if (!Object.keys(pick).length) continue;
    cleanConfig(r.kind, { ...(r.config || {}), ...pick }, r.config || {}); // يرمي برسالة واضحة إن كانت قيمة غير صالحة
    out[code] = pick;
  }
  return out;
}

// تعريف الرحلة لدفعة: لقطة النسخة المثبتة أو صفوف البرنامج الحالية، ثم تخصيص الدفعة.
export function cohortDefinition({ live, version, cohort }) {
  const base = version?.data || live || { stages: [], requirements: [] };
  const delivery = cohort?.delivery || {};
  return {
    stages: (base.stages || []).filter((s) => s.active !== false),
    requirements: (base.requirements || []).filter((r) => r.active !== false).map((r) => applyDelivery(r, delivery[r.code])),
  };
}

// لقطة البرنامج: المراحل والمتطلبات بمعرفاتها، بلا أعمدة التتبع.
const SNAP_DROP = new Set(['program_id', 'created_at', 'updated_at']);
const snapRow = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SNAP_DROP.has(k)));
export function programSnapshot(stages, requirements) {
  return {
    stages: (stages || []).map(snapRow).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
    requirements: (requirements || []).map(snapRow).sort((a, b) => String(a.stage_key).localeCompare(String(b.stage_key)) || (a.sort ?? 0) - (b.sort ?? 0)),
  };
}

// استرجاع نسخة إلى مسودة البرنامج: ما في النسخة يُكتب كما هو، وما ليس فيها
// يُعطَّل ولا يُحذف، فلا يضيع تقدم مشارك أو دليل مرتبط به.
export function restorePlan(snapshot, live) {
  const snapStages = new Set((snapshot?.stages || []).map((s) => s.key));
  const snapReqs = new Set((snapshot?.requirements || []).map((r) => r.id));
  return {
    stages: (snapshot?.stages || []).map((s) => ({ ...s })),
    requirements: (snapshot?.requirements || []).map((r) => ({ ...r })),
    disableStages: (live?.stages || []).filter((s) => !snapStages.has(s.key) && s.active !== false).map((s) => s.key),
    disableRequirements: (live?.requirements || []).filter((r) => !snapReqs.has(r.id) && r.active !== false).map((r) => r.id),
  };
}

// الفرق بين نسختين (أو نسخة والمسودة): ما أُضيف وما حُذف وما تغيّر من المتطلبات.
export function programDiff(from, to) {
  const key = (r) => r.id;
  const a = new Map((from?.requirements || []).filter((r) => r.active !== false).map((r) => [key(r), r]));
  const b = new Map((to?.requirements || []).filter((r) => r.active !== false).map((r) => [key(r), r]));
  const fields = ['stage_key', 'title_ar', 'kind', 'required', 'dimension', 'level', 'config', 'help_ar'];
  const same = (x, y) => fields.every((f) => JSON.stringify(x[f] ?? null) === JSON.stringify(y[f] ?? null));
  return {
    added: [...b.values()].filter((r) => !a.has(key(r))).map((r) => ({ code: r.code, title: r.title_ar })),
    removed: [...a.values()].filter((r) => !b.has(key(r))).map((r) => ({ code: r.code, title: r.title_ar })),
    changed: [...b.values()].filter((r) => a.has(key(r)) && !same(a.get(key(r)), r)).map((r) => ({ code: r.code, title: r.title_ar })),
  };
}

// ── القياس البعدي: هل تغيّر شيء فعلًا؟ ──
// لا يُكتفى بفرق الدرجتين، لأن أي فرق صغير قد يكون خطأ قياس. المرجع:
//   الفرق القابل للمقارنة: المؤشر المركّب قبل وبعد بالجوانب المشتركة فقط،
//     فإن غاب جانب عن أحد النموذجين لا يدخل في أي منهما.
//   مؤشر التغير الموثوق (Jacobson و Truax 1991): الفرق مقسومًا على خطأ
//     الفرق المعياري، ولا يُعدّ التغير حقيقيًا قبل 1.96 (ثقة 95%).
//   التغير المعياري (Marx و Cummings 2007): نسبة ما تحقق من المساحة
//     المتاحة للتحسن، فلا يُظلم من بدأ مرتفعًا.
//   القياس الرجعي (Howard 1980): يقدّر المشارك ممارسته قبل البرنامج بعد
//     أن عرف المعيار، لأن تقديره الأول كثيرًا ما يكون متضخمًا (انزياح الاستجابة).
//   التثليث: لا يُحكم بالتغير من مصدر ذاتي وحده.

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

export const IMPACT_DEFAULTS = { rci_reliability: 0.75, rci_sd: 15, min_n: 50, rater_threshold: 15, rci_practice: 0 };

// ثبات أداة أطول بعدد k من أمثالها (Spearman و Brown)
export const spearmanBrown = (r, k) => (r == null ? null : r2((k * r) / (1 + (k - 1) * r)));

// المؤشر المركّب بالجوانب الموجودة في القياسين معًا
export function comparableComposite(pre, post, model = DEFAULT_MODEL) {
  const m = { ...DEFAULT_MODEL, ...(model || {}) };
  const w = { knowledge: Number(m.w_knowledge), skill: Number(m.w_skill), behavior: Number(m.w_behavior) };
  const tiers = TIERS.filter((t) => pre?.[t] != null && post?.[t] != null && w[t] > 0);
  const wsum = tiers.reduce((a, t) => a + w[t], 0);
  if (!wsum) return { tiers, pre: null, post: null };
  const c = (p) => r1(tiers.reduce((a, t) => a + w[t] * Number(p[t]), 0) / wsum);
  return { tiers, pre: c(pre), post: c(post) };
}

export function normalizedChange(pre, post) {
  if (pre == null || post == null) return null;
  if (post > pre) return pre >= 100 ? null : r2((post - pre) / (100 - pre));
  if (post < pre) return pre <= 0 ? null : r2((post - pre) / pre);
  return 0;
}

// practice: ما يُتوقع أن يكسبه المشارك من تكرار الأسئلة وحده، يُطرح من
// الفرق قبل القسمة (Chelune وزملاؤه 1993). يُطرح من المكسب الموجب وحده،
// فالتكرار يرفع الدرجة ولا يخفضها، وطرحه من التراجع يضخّمه؛ ومكسب أصغر من
// أثر التكرار يُعدّ صفرًا لا تراجعًا.
export function reliableChange(pre, post, sd, reliability, practice = 0) {
  if (pre == null || post == null) return { rci: null, reliable: false, direction: null, threshold: null };
  const sem = Number(sd) * Math.sqrt(Math.max(0, 1 - Number(reliability)));
  const sdiff = Math.SQRT2 * sem;
  if (!(sdiff > 0)) return { rci: null, reliable: false, direction: null, threshold: null };
  const p = Math.max(0, Number(practice) || 0);
  const diff = post - pre;
  const rci = (diff > 0 ? Math.max(0, diff - p) : diff) / sdiff;
  const reliable = Math.abs(rci) >= 1.96;
  return { rci: r2(rci), reliable, direction: reliable ? (rci > 0 ? 'up' : 'down') : 'flat', threshold: r1(1.96 * sdiff + p) };
}

// ثبات المؤشر المركّب الموزون لكل إطار وللمؤشر الكلي: ألفا طبقي
// (Cronbach و Schönemann و McKie 1965)، كل جانب طبقة بوزنه في المؤشر.
// يُحسب لكل صيغة على من أجاب كل أسئلتها في الجانب دون "لا ينطبق"، ثم
// يُجمع بين الصيغتين بوزن العدد. tiers: الجوانب الداخلة في المؤشر
// (الثلاثة، أو المعرفة والمواقف لحكم الاختبار وحده).
// rows: [{ assessment_id, question_id, score }]، forms: { assessment_id: 'A' | 'B' }
export function compositeReliability(questions, rows, { forms = {}, model = DEFAULT_MODEL, tiers = TIERS } = {}) {
  const m = { ...DEFAULT_MODEL, ...(model || {}) };
  const w = { knowledge: Number(m.w_knowledge), skill: Number(m.w_skill), behavior: Number(m.w_behavior) };
  const use = tiers.filter((t) => w[t] > 0);
  const W = use.reduce((a, t) => a + w[t], 0);
  const byQ = new Map(questions.filter((q) => q.active !== false).map((q) => [q.id, q]));
  const people = new Map();
  for (const r of rows) {
    const q = byQ.get(r.question_id);
    if (!q || r.score == null || Number(r.score) < 0) continue;
    if (!people.has(r.assessment_id)) people.set(r.assessment_id, new Map());
    people.get(r.assessment_id).set(q.id, Number(r.score));
  }
  const groups = new Map();
  for (const aid of people.keys()) {
    const g = forms[aid] || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(aid);
  }
  // لكل إطار وجانب: ألفا وتباين النسبة، مجموعَين بين الصيغ
  const strata = {};
  const pctOf = {};   // aid -> dim -> tier -> نسبة على أسئلة صيغته كاملة
  for (const d of DIMENSIONS) {
    for (const t of use) {
      let nA = 0, sA = 0, nV = 0, sV = 0;
      for (const [g, aids] of groups) {
        const items = questions.filter((q) => byQ.has(q.id) && q.dimension === d && q.tier === t && (!q.form || q.form === g));
        if (!items.length) continue;
        const max = items.reduce((a, q) => a + (maxScore(q) || 1), 0);
        const complete = aids.filter((aid) => items.every((q) => people.get(aid).has(q.id)));
        const mat = complete.map((aid) => items.map((q) => people.get(aid).get(q.id)));
        const pcts = mat.map((row) => (row.reduce((a, b) => a + b, 0) / max) * 100);
        complete.forEach((aid, i) => { (((pctOf[aid] ||= {})[d] ||= {})[t] = pcts[i]); });
        const alpha = items.length > 1 ? cronbachAlpha(mat) : null;
        if (alpha != null) { nA += complete.length; sA += alpha * complete.length; }
        if (pcts.length > 1) { nV += pcts.length - 1; sV += variance(pcts) * (pcts.length - 1); }
      }
      (strata[d] ||= {})[t] = { alpha: nA ? sA / nA : null, v: nV ? sV / nV : null };
    }
  }
  const composite = (aid, d) => {
    const p = pctOf[aid]?.[d];
    if (!p || !use.every((t) => p[t] != null)) return null;
    return use.reduce((a, t) => a + w[t] * p[t], 0) / W;
  };
  const strat = (cells, comps) => {
    const vC = comps.length > 2 ? variance(comps) : 0;
    if (!(vC > 0) || cells.some((c) => c.s.alpha == null || c.s.v == null)) return { n: comps.length, alpha: null, sd: comps.length > 2 ? r2(Math.sqrt(vC)) : null };
    const err = cells.reduce((a, c) => a + c.k * c.k * c.s.v * (1 - c.s.alpha), 0);
    return { n: comps.length, alpha: r2(Math.max(0, 1 - err / vC)), sd: r2(Math.sqrt(vC)) };
  };
  const out = { dims: {}, overall: null };
  const aids = [...people.keys()];
  for (const d of DIMENSIONS) {
    const comps = aids.map((aid) => composite(aid, d)).filter((x) => x != null);
    out.dims[d] = strat(use.map((t) => ({ k: w[t] / W, s: strata[d][t] })), comps);
  }
  const overall = aids.map((aid) => {
    const cs = DIMENSIONS.map((d) => composite(aid, d));
    return cs.every((x) => x != null) ? cs.reduce((a, b) => a + b, 0) / DIMENSIONS.length : null;
  }).filter((x) => x != null);
  out.overall = strat(DIMENSIONS.flatMap((d) => use.map((t) => ({ k: w[t] / W / DIMENSIONS.length, s: strata[d][t] }))), overall);
  return out;
}

// معادلة المتوسط بين الصيغتين (Kolen و Brennan): في القياس المبدئي وُزّعت
// الصيغتان على المشاركين توزيعًا متوازنًا، ففرق متوسطيهما فرق صعوبة لا فرق
// قدرة. لكل صيغة وإطار وجانب: كم تزيد عن متوسط الصيغتين (يُطرح من الدرجة).
// results: [{ form, dims: { dimension: { knowledge, skill } } }]
export function formOffsets(results, { minN = IMPACT_DEFAULTS.min_n } = {}) {
  const by = Object.fromEntries(FORMS.map((f) => [f, (results || []).filter((r) => r.form === f)]));
  if (FORMS.some((f) => by[f].length < minN)) return null;
  const out = Object.fromEntries(FORMS.map((f) => [f, {}]));
  for (const d of DIMENSIONS) {
    for (const t of ['knowledge', 'skill']) {
      const means = Object.fromEntries(FORMS.map((f) => {
        const xs = by[f].map((r) => r.dims?.[d]?.[t]).filter((x) => x != null).map(Number);
        return [f, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null];
      }));
      if (FORMS.some((f) => means[f] == null)) continue;
      const mid = FORMS.reduce((a, f) => a + means[f], 0) / FORMS.length;
      for (const f of FORMS) ((out[f][d] ||= {})[t] = r1(means[f] - mid));
    }
  }
  return out;
}

// تطبيق المعادلة على نتيجة قياس بصيغته
export function equate(result, form, offsets) {
  if (!result || !form || !offsets?.[form]) return result;
  const out = {};
  for (const [d, r] of Object.entries(result)) {
    const o = offsets[form][d] || {};
    const fix = (x, k) => (x == null ? x : r1(Math.min(100, Math.max(0, x - (o[k] || 0)))));
    out[d] = { ...r, knowledge: fix(r.knowledge, 'knowledge'), skill: fix(r.skill, 'skill') };
  }
  return out;
}

// أثر التكرار على جانب المواقف بنقاط النسبة: ما زاده كسب المواقف المشتركة
// (المكررة) على كسب الموازية (الجديدة على المشارك)، مضروبًا في حصة المشترك
// من المواقف. pairs: [{ pre: { anchor, form }, post: { anchor, form } }]
export function practiceEffect(pairs, { anchorShare = 0.5 } = {}) {
  const xs = (pairs || []).filter((p) => [p.pre?.anchor, p.pre?.form, p.post?.anchor, p.post?.form].every((x) => x != null))
    .map((p) => (p.post.anchor - p.pre.anchor) - (p.post.form - p.pre.form));
  if (!xs.length) return { n: 0, points: null };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { n: xs.length, points: r1(Math.max(0, mean * anchorShare)) };
}

// ألفا كرونباخ من مصفوفة درجات (صف لكل مشارك، عمود لكل سؤال)
export function cronbachAlpha(rows) {
  const data = (rows || []).filter((r) => r.every((x) => Number.isFinite(x)));
  const k = data[0]?.length || 0;
  if (data.length < 3 || k < 2) return null;
  const variance = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1); };
  const itemVar = Array.from({ length: k }, (_, j) => variance(data.map((r) => r[j]))).reduce((a, b) => a + b, 0);
  const totalVar = variance(data.map((r) => r.reduce((a, b) => a + b, 0)));
  if (!(totalVar > 0)) return null;
  return r2((k / (k - 1)) * (1 - itemVar / totalVar));
}

// إحصاء الأزواج للجهة أو الدفعة: متوسط الفرق وحجم الأثر dz واختبار t
export function pairedStats(pairs) {
  const ok = (pairs || []).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = ok.length;
  if (!n) return { n: 0, pre: null, post: null, diff: null, sd: null, dz: null, t: null };
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const diffs = ok.map(([a, b]) => b - a);
  const d = mean(diffs);
  const sd = n > 1 ? Math.sqrt(diffs.reduce((a, x) => a + (x - d) ** 2, 0) / (n - 1)) : null;
  return {
    n, pre: r1(mean(ok.map((p) => p[0]))), post: r1(mean(ok.map((p) => p[1]))), diff: r1(d), sd: r1(sd),
    dz: sd > 0 ? r2(d / sd) : null, t: sd > 0 ? r2(d / (sd / Math.sqrt(n))) : null,
  };
}

// حجم الأثر بلغة القرار (Cohen 1988)
export function effectLabel(dz) {
  if (dz == null) return null;
  const a = Math.abs(dz);
  return a >= 0.8 ? 'كبير' : a >= 0.5 ? 'متوسط' : a >= 0.2 ? 'صغير' : 'ضئيل';
}

// إجابات القياس الرجعي "قبل البرنامج" بالصيغة التي تقرؤها tierPercents
export function beforeAnswers(questions, values) {
  const out = {};
  for (const q of questions) if (q.retro && values[q.id]?.before != null) out[q.id] = values[q.id].before;
  return out;
}

// نسبة الممارسة "قبل البرنامج" لكل إطار، من العبارات التي قُدّرت فعلًا
// (ما أُجيب عنه بـ"لا ينطبق" الآن لا تقدير قبلي له، فلا يُحسب صفرًا)
export function beforePercents(questions, values, opts = {}) {
  const qs = questions.filter((q) => q.retro && values[q.id]?.before != null);
  return tierPercents(qs, beforeAnswers(qs, values), opts);
}

// تقدير المقيّم (المدير غالبًا) للممارسة الآن وقبل البرنامج، نسبة من 100
export function raterPercents(questions, answers) {
  const acc = {};
  for (const q of questions) {
    const a = answers?.[q.id];
    if (!a) continue;
    const max = Math.max(0, ...(q.options || []).map((o) => Number(o.score) || 0));
    const now = scoreFor(q, a.now), before = scoreFor(q, a.before);
    if (!(max > 0) || now == null || before == null || now < 0 || before < 0) continue;
    const d = (acc[q.dimension] ||= { now: 0, before: 0, max: 0 });
    d.now += now; d.before += before; d.max += max;
  }
  const out = {};
  for (const dim of DIMENSIONS) {
    const d = acc[dim];
    out[dim] = d && d.max ? { now: r1((d.now / d.max) * 100), before: r1((d.before / d.max) * 100) } : null;
  }
  return out;
}

// تقدير المقيّم الآن فقط (دعوة ما قبل البرنامج)، نسبة من 100 لكل إطار
export function raterNowPercents(questions, answers) {
  const out = {};
  for (const dim of DIMENSIONS) {
    let got = 0, max = 0;
    for (const q of questions.filter((x) => x.dimension === dim)) {
      const k = answers?.[q.id]?.now;
      const s = k == null ? null : scoreFor(q, k);
      if (s == null || s < 0) continue;
      got += s; max += maxScore(q);
    }
    out[dim] = max ? r1((got / max) * 100) : null;
  }
  return out;
}

// تقدير المقيّم نفسه قبل البرنامج وبعده: قياس قبلي وبعدي حقيقي لا رجعي.
// يُطابق بالرمز، وعلى العبارات التي حكم عليها في المرتين فقط.
export function raterProspective(preQs, preAnswers, postQs, postAnswers) {
  const ok = (q, a) => a?.now != null && (scoreFor(q, a.now) ?? -1) >= 0;
  const before = new Map(preQs.filter((q) => ok(q, preAnswers?.[q.id])).map((q) => [q.code, q]));
  const out = {};
  for (const dim of DIMENSIONS) {
    let b = 0, n = 0, max = 0;
    for (const q of postQs.filter((x) => x.dimension === dim && ok(x, postAnswers?.[x.id]))) {
      const p = before.get(q.anchor_code || q.code);
      if (!p) continue;
      b += scoreFor(p, preAnswers[p.id].now); n += scoreFor(q, postAnswers[q.id].now); max += maxScore(q);
    }
    out[dim] = max ? { now: r1((n / max) * 100), before: r1((b / max) * 100), prospective: true } : null;
  }
  return out;
}

// الحكم على أثر البرنامج في بُعد واحد بتثليث المصادر:
//   الاختبار (معرفة ومواقف) بتغير موثوق، والممارسة الذاتية، وتقدير المقيّم
//   الخارجي، ودليل الحالة المعتمد. "تغير مؤكد" يتطلب مصدرين أحدهما غير ذاتي
//   وغير رجعي: الاختبار، أو الدليل، أو مدير قدّر قبل البرنامج وبعده. تقدير
//   المدير "قبل" بعد انتهاء البرنامج ذاكرة رجعية (Ross 1989)، فيُحسب مصدرًا
//   ولا يكفي للتأكيد مع التقدير الذاتي الرجعي وحدهما.
export function impactVerdict({ test, self, rater, raterProspective = false, evidence }) {
  const sources = [
    test === 'up' && 'test', self === 'up' && 'self', rater === 'up' && 'rater', evidence && 'evidence',
  ].filter(Boolean);
  const external = sources.some((s) => s === 'test' || s === 'evidence' || (s === 'rater' && raterProspective));
  if (test === 'down' || rater === 'down') return { key: 'decline', sources, label: 'تراجع يحتاج مراجعة' };
  if (sources.length >= 2 && external) return { key: 'confirmed', sources, label: 'تغير مؤكد' };
  if (sources.length >= 1) return { key: 'emerging', sources, label: 'مؤشرات أولية' };
  return { key: 'none', sources, label: 'لا دليل كافٍ على التغير' };
}

// المقارنة الكاملة لمشارك واحد في الأبعاد الثلاثة
// نقاط أثر التكرار على مؤشر من الجوانب tiers: نقاط المواقف بوزنها فيه
function practiceOn(tiers, points, model) {
  const m = { ...DEFAULT_MODEL, ...(model || {}) };
  const w = { knowledge: Number(m.w_knowledge), skill: Number(m.w_skill), behavior: Number(m.w_behavior) };
  const W = tiers.reduce((a, t) => a + w[t], 0);
  return W && tiers.includes('skill') ? (Number(points) || 0) * w.skill / W : 0;
}

// حارس الإقران: البعدي يُقارن بالمبدئي الذي بُني له (pairs_with) لا بأي
// مبدئي. أداة بعدية بلا pairs_with عامة تقبل أي مبدئي. تُعاد قابلية
// المقارنة وسببها للعرض، ولا تُحسب مقارنة لزوج غير متطابق.
// baseline/post: { key, pairs_with } (صفّا instruments)
export const PAIR_MISMATCH_AR = 'الأداتان غير متطابقتين';
export function pairComparable(baseline, post) {
  if (!baseline || !post) return { comparable: false, reason: 'لم يكتمل القياسان' };
  if (post.pairs_with && post.pairs_with !== baseline.key) return { comparable: false, reason: PAIR_MISMATCH_AR };
  return { comparable: true, reason: null };
}

export function compareAssessments({ pre, post, model, impact, rater, evidence }) {
  const cfg = { ...IMPACT_DEFAULTS, ...(impact || {}) };
  return DIMENSIONS.map((dimension) => {
    const a = pre?.[dimension] || {}, b = post?.[dimension] || {};
    const cc = comparableComposite(a, b, model);
    const rel = cfg.reliability?.[dimension] ?? cfg.rci_reliability;
    const sd = cfg.sd?.[dimension] ?? cfg.rci_sd;
    const points = cfg.practice?.[dimension] ?? cfg.rci_practice;
    const practice = practiceOn(cc.tiers, points, model);
    const rc = reliableChange(cc.pre, cc.post, sd, rel, practice);
    // الاختبار وحده: المعرفة والمواقف، بلا تقدير ذاتي، بثباته وانحرافه إن عُرفا
    const testPre = comparableComposite({ ...a, behavior: null }, { ...b, behavior: null }, model);
    const testPractice = practiceOn(testPre.tiers, points, model);
    const testRc = reliableChange(testPre.pre, testPre.post, cfg.test_sd?.[dimension] ?? sd, cfg.test_reliability?.[dimension] ?? rel, testPractice);
    // الفرق الذاتي على العبارات المجابة في القياسين معًا إن حُسبت
    const commonDiff = b.behavior_common != null && b.behavior_pre_common != null ? b.behavior_common - b.behavior_pre_common : null;
    const selfDiff = commonDiff ?? (a.behavior != null && b.behavior != null ? b.behavior - a.behavior : null);
    const retroDiff = b.behavior_before != null && b.behavior != null ? b.behavior - b.behavior_before : null;
    const self = (retroDiff ?? selfDiff) == null ? null : (retroDiff ?? selfDiff) >= cfg.rater_threshold ? 'up' : 'flat';
    const r = rater?.[dimension];
    const raterDiff = r ? r.now - r.before : null;
    const raterDir = raterDiff == null ? null : raterDiff >= cfg.rater_threshold ? 'up' : raterDiff <= -cfg.rater_threshold ? 'down' : 'flat';
    return {
      dimension,
      pre: { knowledge: a.knowledge ?? null, skill: a.skill ?? null, behavior: a.behavior ?? null, level: a.level || null },
      post: { knowledge: b.knowledge ?? null, skill: b.skill ?? null, behavior: b.behavior ?? null, behavior_before: b.behavior_before ?? null, level: b.level || null },
      tiers: cc.tiers, composite_pre: cc.pre, composite_post: cc.post,
      change: cc.pre == null ? null : r1(cc.post - cc.pre),
      normalized: normalizedChange(cc.pre, cc.post),
      rci: rc.rci, reliable: rc.reliable, direction: rc.direction, threshold: rc.threshold, practice: r1(practice),
      test_pre: testPre.pre, test_post: testPre.post, test_practice: testPractice,
      test_direction: testRc.direction,
      self_change: r1(selfDiff), retro_change: r1(retroDiff),
      // انزياح الاستجابة: تقديره الأول لنفسه ناقص تقديره اللاحق لما كان عليه
      response_shift: a.behavior != null && b.behavior_before != null ? r1(a.behavior - b.behavior_before) : null,
      rater: r || null, rater_change: r1(raterDiff),
      verdict: impactVerdict({ test: testRc.direction, self, rater: raterDir, raterProspective: !!r?.prospective, evidence: !!evidence }),
    };
  });
}

// الحكم الفردي الرسمي على المؤشر الكلي للأطر الثلاثة: 48 سؤالًا بدل 16،
// فخطأ القياس أصغر بكثير. الأطر منفردة تُعرض للفرد وصفًا، ويُحكم بها
// إحصائيًا على مستوى الدفعة. cfg.overall_reliability وcfg.overall_sd من بيانات
// الدفعة، وإلا Spearman و Brown من ثبات الإطار الافتراضي.
export function overallChange(dims, impact = {}, evidence = false) {
  const cfg = { ...IMPACT_DEFAULTS, ...(impact || {}) };
  const full = (dims || []).filter((d) => d.composite_pre != null && d.composite_post != null);
  if (full.length !== DIMENSIONS.length) return null;
  const mean = (xs) => r1(xs.reduce((a, b) => a + b, 0) / xs.length);
  const rel = cfg.overall_reliability ?? spearmanBrown(Number(cfg.rci_reliability), DIMENSIONS.length);
  const sd = cfg.overall_sd ?? cfg.rci_sd;
  const pre = mean(full.map((d) => d.composite_pre)), post = mean(full.map((d) => d.composite_post));
  const rc = reliableChange(pre, post, sd, rel, mean(full.map((d) => d.practice || 0)));
  const tests = full.filter((d) => d.test_pre != null && d.test_post != null);
  const testRc = tests.length === DIMENSIONS.length
    ? reliableChange(mean(tests.map((d) => d.test_pre)), mean(tests.map((d) => d.test_post)),
      cfg.overall_test_sd ?? sd, cfg.overall_test_reliability ?? rel, mean(tests.map((d) => d.test_practice || 0)))
    : { direction: null };
  const selfs = full.map((d) => d.retro_change ?? d.self_change).filter((x) => x != null);
  const self = selfs.length ? (mean(selfs) >= cfg.rater_threshold ? 'up' : 'flat') : null;
  const raters = full.filter((d) => d.rater);
  const raterDiff = raters.length ? mean(raters.map((d) => d.rater.now - d.rater.before)) : null;
  const rater = raterDiff == null ? null : raterDiff >= cfg.rater_threshold ? 'up' : raterDiff <= -cfg.rater_threshold ? 'down' : 'flat';
  return {
    composite_pre: pre, composite_post: post, change: r1(post - pre), normalized: normalizedChange(pre, post),
    rci: rc.rci, reliable: rc.reliable, direction: rc.direction, threshold: rc.threshold,
    test_direction: testRc.direction, rater_change: raterDiff,
    verdict: impactVerdict({
      test: testRc.direction, self, rater, raterProspective: raters.length > 0 && raters.every((d) => d.rater.prospective), evidence: !!evidence,
    }),
  };
}

// ── طبقات الشهادة ──
// العام، ثم البرنامج، ثم الجهة. الأخص يغلب فيما خصّصه فقط، والغائب يُورث.
// signatory: null صريحة تعني «بلا موقّع»، وغيابها يعني الوراثة.
export function certProfile(global, ...layers) {
  return layers.reduce((acc, l) => {
    const o = l || {};
    return {
      program_ar: o.program_ar || acc.program_ar,
      program_en: o.program_en || acc.program_en,
      hours: o.hours ?? acc.hours,
      signatory: 'signatory' in o ? o.signatory : acc.signatory,
    };
  }, { program_ar: global.program_ar, program_en: global.program_en, hours: global.hours ?? null, signatory: global.signatory ?? null });
}

// ── جودة أسئلة القياس من الإجابات الحقيقية ──
// لكل سؤال: عدد المجيبين، والصعوبة p (متوسط الدرجة من أعلاها)، والتمييز
// (ارتباط السؤال ببقية أسئلة بُعده)، وتوزيع الخيارات. ولكل بُعد: الثبات
// (ألفا كرونباخ) على المجيبين عن كل أسئلته. الأعلام تدل على ما يُراجع.
// rows: [{ assessment_id, question_id, score, k }]
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const variance = (xs) => { const m = mean(xs); return xs.length > 1 ? xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) : 0; };
function pearson(xs, ys) {
  if (xs.length < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : null;
}
const round2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

// forms: { assessment_id: 'A' | 'B' } حين تكون للأداة صيغتان، فيُحسب الثبات
// لكل صيغة على أسئلتها ثم يُجمع بوزن العدد.
export function itemAnalysis(questions, rows, { minN = 10, forms = {} } = {}) {
  const byQ = new Map(questions.map((q) => [q.id, q]));
  const answers = new Map();   // assessment -> Map(question -> score)
  const picks = new Map();     // question -> counts per k
  for (const r of rows) {
    const q = byQ.get(r.question_id);
    if (!q || r.score == null || Number(r.score) < 0) continue;
    if (!answers.has(r.assessment_id)) answers.set(r.assessment_id, new Map());
    answers.get(r.assessment_id).set(q.id, Number(r.score));
    if (Number.isInteger(r.k)) {
      const c = picks.get(q.id) || {};
      c[r.k] = (c[r.k] || 0) + 1;
      picks.set(q.id, c);
    }
  }
  const dims = [...new Set(questions.map((q) => q.dimension))];
  const items = [];
  const dimensions = [];
  for (const d of dims) {
    const qs = questions.filter((q) => q.dimension === d);
    for (const q of qs) {
      const max = maxScore(q) || 1;
      const xs = [], rest = [];
      for (const a of answers.values()) {
        if (!a.has(q.id)) continue;
        xs.push(a.get(q.id));
        rest.push(qs.reduce((s, o) => s + (o.id !== q.id && a.has(o.id) ? a.get(o.id) / (maxScore(o) || 1) : 0), 0));
      }
      const n = xs.length;
      const p = n ? mean(xs) / max : null;
      const disc = pearson(xs, rest);
      const counts = picks.get(q.id) || {};
      const options = (q.options || []).map((o, k) => ({ k, label: o.label, score: Number(o.score) || 0, share: n ? round2((counts[k] || 0) / n) : 0 }));
      const flags = [];
      if (n >= minN) {
        if (p > 0.9) flags.push('easy');
        if (p < 0.2) flags.push('hard');
        if (disc != null && disc < 0.2) flags.push('low_discrimination');
        if (q.kind !== 'likert' && options.some((o) => o.score < max && o.share < 0.05)) flags.push('dead_option');
      }
      items.push({ id: q.id, code: q.code || null, dimension: d, tier: q.tier || null, text: q.text_ar || q.text || '', n, p: round2(p), discrimination: round2(disc), options, flags });
    }
    // الثبات على من أجاب عن كل أسئلة البعد في صيغته
    let complete = 0, wsum = 0, wn = 0;
    for (const g of new Set([...answers.keys()].map((aid) => forms[aid] || ''))) {
      const gq = qs.filter((q) => !q.form || q.form === g);
      const people = [...answers.entries()].filter(([aid, a]) => (forms[aid] || '') === g && gq.every((q) => a.has(q.id))).map(([, a]) => a);
      complete += people.length;
      const k = gq.length;
      if (k > 1 && people.length >= 3) {
        const itemVar = gq.reduce((s, q) => s + variance(people.map((a) => a.get(q.id))), 0);
        const totalVar = variance(people.map((a) => gq.reduce((s, q) => s + a.get(q.id), 0)));
        if (totalVar) { wsum += (k / (k - 1)) * (1 - itemVar / totalVar) * people.length; wn += people.length; }
      }
    }
    const alpha = wn ? wsum / wn : null;
    dimensions.push({ dimension: d, items: qs.length, complete, alpha: round2(alpha) });
  }
  // الفصل بين الأطر: ارتباط نسب الدرجات بين كل إطارين عبر المشاركين.
  // المصحح يقسم على جذر ثبات الإطارين؛ 0.85 فأعلى يعني أنهما يقيسان
  // قدرة واحدة تقريبًا، فلا تفرّق المسارات الـ27 بينهما فعلًا.
  const ratio = (a, d) => {
    let s = 0, m = 0;
    for (const q of questions) if (q.dimension === d && a.has(q.id)) { s += a.get(q.id); m += maxScore(q) || 1; }
    return m ? s / m : null;
  };
  const alphaOf = Object.fromEntries(dimensions.map((x) => [x.dimension, x.alpha]));
  const correlations = [];
  for (let i = 0; i < dims.length; i++) {
    for (let j = i + 1; j < dims.length; j++) {
      const xs = [], ys = [];
      for (const a of answers.values()) {
        const x = ratio(a, dims[i]), y = ratio(a, dims[j]);
        if (x != null && y != null) { xs.push(x); ys.push(y); }
      }
      const r = pearson(xs, ys);
      const rel = alphaOf[dims[i]] > 0 && alphaOf[dims[j]] > 0 ? Math.sqrt(alphaOf[dims[i]] * alphaOf[dims[j]]) : null;
      const corrected = r != null && rel ? Math.min(1, r / rel) : null;
      const overlap = xs.length >= minN && ((corrected != null && corrected >= 0.85) || (r != null && r >= 0.7));
      correlations.push({ a: dims[i], b: dims[j], n: xs.length, r: round2(r), corrected: round2(corrected), overlap });
    }
  }
  return { respondents: answers.size, dimensions, items, correlations };
}

// ── الاتجاه الأسبوعي للمالك ──
// أسابيع تبدأ الأحد (أسبوع العمل في السعودية)، آخرها الأسبوع الجاري.
// events: { joined: [iso], assessed: [iso], approved: [iso], active: [[iso, participantId]] }
export function weekStart(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - x.getUTCDay());
  return x.toISOString().slice(0, 10);
}
export function weeklySeries(events, { weeks = 12, now = Date.now() } = {}) {
  const starts = [];
  const first = new Date(weekStart(now));
  for (let i = weeks - 1; i >= 0; i--) starts.push(new Date(first.getTime() - i * 7 * 864e5).toISOString().slice(0, 10));
  const rows = new Map(starts.map((w) => [w, { week: w, joined: 0, assessed: 0, approved: 0, active: new Set() }]));
  for (const k of ['joined', 'assessed', 'approved']) {
    for (const t of events[k] || []) { const r = t && rows.get(weekStart(t)); if (r) r[k] += 1; }
  }
  for (const [t, id] of events.active || []) { const r = t && rows.get(weekStart(t)); if (r) r.active.add(id); }
  return [...rows.values()].map((r) => ({ ...r, active: r.active.size }));
}


// ── الدخول بحساب Google ──
// بيانات الرمز كما يعيدها Google بعد التحقق من توقيعه (tokeninfo). يُقبل فقط لعميلنا،
// ومن مُصدر Google، وغير منتهٍ، وببريد وثّقه Google.
export function googleIdentity(claims, clientId, nowSec = Math.floor(Date.now() / 1000)) {
  const c = claims || {};
  if (c.aud !== clientId) return { error: 'الرمز ليس لهذا التطبيق' };
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss)) return { error: 'مصدر الرمز غير معروف' };
  if (!(Number(c.exp) > nowSec)) return { error: 'انتهت صلاحية الدخول بحساب Google، حاول مرة أخرى' };
  if (!(c.email_verified === true || c.email_verified === 'true')) return { error: 'بريد حساب Google غير موثّق' };
  const email = normalizeEmail(c.email);
  if (!isEmail(email)) return { error: 'لا بريد صالح في حساب Google' };
  const name = String(c.name || [c.given_name, c.family_name].filter(Boolean).join(' ') || '').trim().slice(0, 120);
  return { email, name };
}

// نصوص الرحلة واتساقها وساعات البرنامج في journey.js، وتُصدَّر من هنا كما كانت
export * from './journey.js';

// ════════════════════════════════════════════════════════════════
// الخبراء: تنقية الملف، وما يُعرض لغير الإدارة
// ════════════════════════════════════════════════════════════════
export const EXPERT_ROLES = ['coach', 'advisor', 'specialist', 'assessor', 'mentor'];
const pickSet = (v, allowed) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => allowed.includes(x)))];
const txt = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const int = (v, lo, hi) => { if (v === '' || v == null) return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
// الحقول التي يكتبها الخبير بنفسه (طلب الانضمام) أو الإدارة. withAdmin يضيف السعر والملاحظة
export function cleanExpert(b, { withAdmin = false } = {}) {
  const out = {
    full_name: txt(b.full_name, 120), title: txt(b.title, 160), bio: txt(b.bio, 3000),
    linkedin_url: /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(String(b.linkedin_url || '')) ? txt(b.linkedin_url, 300) : null,
    roles: pickSet(b.roles, EXPERT_ROLES),
    dimensions: pickSet(b.dimensions, ['milestone', 'impact', 'leadership']),
    levels: pickSet(b.levels, ['beginner', 'intermediate', 'advanced']),
    sectors: (Array.isArray(b.sectors) ? b.sectors : String(b.sectors || '').split(/[،,]/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 8).map((x) => x.slice(0, 60)),
    languages: pickSet(b.languages, ['ar', 'en']),
    weekly_hours: int(b.weekly_hours, 0, 60), years_experience: int(b.years_experience, 0, 60),
  };
  if (!out.languages.length) out.languages = ['ar'];
  if (withAdmin) {
    const r = b.hourly_rate === '' || b.hourly_rate == null ? null : Number(b.hourly_rate);
    out.hourly_rate = Number.isFinite(r) && r >= 0 ? Math.round(r * 100) / 100 : null;
    out.admin_note = txt(b.admin_note, 2000);
  }
  return out;
}
// ما يخرج لغير الإدارة: لا سعر ولا ملاحظة داخلية ولا عنوان شبكة
export function expertPublic(e) {
  if (!e) return null;
  const { hourly_rate, admin_note, applied_ip, approved_by, ...rest } = e;
  return rest;
}

// خدمات الخبير من جلساته: المنعقدة وحدها تُحتسب ساعات وتكلفة (السعر للإدارة وحدها)
export function expertStats(sessions = [], rate = null, now = Date.now()) {
  const attended = sessions.filter((s) => s.status === 'attended');
  const minutes = attended.reduce((a, s) => {
    const m = (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 6e4;
    return a + (Number.isFinite(m) && m > 0 && m <= 480 ? m : 0);
  }, 0);
  const hours = Math.round((minutes / 60) * 10) / 10;
  return {
    sessions: sessions.filter((s) => s.status !== 'cancelled').length,
    attended: attended.length,
    no_show: sessions.filter((s) => s.status === 'no_show').length,
    upcoming: sessions.filter((s) => s.status === 'booked' && Date.parse(s.starts_at) > now).length,
    participants: new Set(attended.map((s) => s.participant_id)).size,
    hours,
    cost: rate == null ? null : Math.round(hours * Number(rate) * 100) / 100,
  };
}

// ── الإسناد: ترشيح الخبير الأنسب لطلب ──
// الأوزان مصدر واحد (مجموعها 100) يقرؤها الخادم ولوحة الإدارة لشرح الترتيب
export const MATCH_WEIGHTS = { fit: 35, capacity: 25, quality: 20, context: 10, continuity: 10 };
export const OFFER_HOURS = 24;
export const LEVEL_RANK = { beginner: 1, intermediate: 2, advanced: 3 };
// need: { role, dimension, level, sector }
// e: الخبير ومعه load (طلبات قائمة وجلسات قادمة) وrating (من المرحلة 5، وقد يكون فارغًا) وserved (خدم المشارك من قبل؟)
export function matchScore(e, need) {
  const w = MATCH_WEIGHTS;
  const dims = e.dimensions || [];
  const levels = e.levels || [];
  // التخصص: البُعد المطلوب، والمستوى (المستوى الأعلى يخدم ما دونه بنصف الدرجة)
  const dimFit = !need.dimension ? 1 : dims.includes(need.dimension) ? 1 : 0;
  const lvl = LEVEL_RANK[need.level] || 0;
  const lvlFit = !lvl || !levels.length ? 0.5 : levels.includes(need.level) ? 1 : levels.some((x) => LEVEL_RANK[x] > lvl) ? 0.5 : 0;
  const fit = (dimFit * 0.6 + lvlFit * 0.4) * w.fit;
  // السعة: ما بقي من ساعاته الأسبوعية بعد حِمله الحالي (كل طلب قائم أو جلسة قادمة = ساعة)
  const hours = Number(e.weekly_hours) || 0;
  const used = (e.load?.requests || 0) + (e.load?.upcoming || 0);
  const capacity = hours > 0 ? Math.max(0, 1 - used / hours) * w.capacity : 0;
  // الجودة: التقييم من 5 حين يوجد بعدد كافٍ، وإلا محايد
  const r = e.rating?.count >= MIN_RATINGS ? e.rating.avg : null;
  const quality = (r == null ? 0.6 : Math.max(0, Math.min(1, (r - 1) / 4))) * w.quality;
  const context = (need.sector && (e.sectors || []).some((s) => String(s).trim() === String(need.sector).trim()) ? 1 : 0) * w.context;
  const continuity = (e.served ? 1 : 0) * w.continuity;
  const parts = { fit, capacity, quality, context, continuity };
  const total = Math.round(Object.values(parts).reduce((a, n) => a + n, 0) * 10) / 10;
  return { total, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 10) / 10])), full: hours > 0 && used >= hours };
}
// المرشحون: النشطون بالدور المطلوب، غير من عُرض عليهم، مرتبون بالنقاط ثم بالأقل حِملًا
export function rankExperts(experts, need, tried = []) {
  const skip = new Set(tried);
  return experts
    .filter((e) => e.status === 'active' && (e.roles || []).includes(need.role) && !skip.has(e.id))
    .map((e) => ({ ...e, match: matchScore(e, need) }))
    .filter((e) => !e.match.full)
    .sort((a, b) => b.match.total - a.match.total || ((a.load?.requests || 0) - (b.load?.requests || 0)) || String(a.id).localeCompare(String(b.id)));
}

// ── التقييم في الاتجاهين ──
// يقبل المعايير المعروفة وحدها، كل منها 1 إلى 5، والمعدل متوسطها. ناقص = مرفوض
export function cleanRating(scores, keys) {
  const out = {};
  for (const k of keys) {
    const n = Math.round(Number(scores?.[k]));
    if (!(n >= 1 && n <= 5)) return null;
    out[k] = n;
  }
  const overall = Math.round((Object.values(out).reduce((a, n) => a + n, 0) / keys.length) * 100) / 100;
  return { scores: out, overall };
}
// تقييم الخبير المجمّع: يُعرض رقمه لغير الإدارة بعد MIN_RATINGS فقط، فلا يُستدل على رأي فرد
export const MIN_RATINGS = 5;
export function ratingSummary(rows = []) {
  const n = rows.length;
  const avg = n ? Math.round((rows.reduce((a, r) => a + Number(r.overall), 0) / n) * 10) / 10 : null;
  return { avg, count: n, visible: n >= MIN_RATINGS };
}
