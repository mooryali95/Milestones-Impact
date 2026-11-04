// ════════════════════════════════════════════════════════════════
// التقييم الختامي: درجة آلية من مصادرها، قابلة لتعديل الخبير بتعليل، وقرار يُعتمد
// ════════════════════════════════════════════════════════════════
// يُبنى على مرحلة الدعم والتمكين وما قبلها: التقييم المستمر، والمعالم، والمشروع، والقياس النهائي.
// لا رقم يُنسخ: كل مكوّن يُحسب من مصدره عند العرض، ويحمل سببه بجملة ومصدره.
// الإعداد لكل برنامج (programs.final_eval) يضبطه الأدمن: الأوزان، وحدود القرار، وطريقة الاعتماد،
// وطريقة القياس النهائي، وقواعد التغطية، واللجنة؛ وله إصدار يرتفع مع كل حفظ ويُحفظ في لقطة كل تقييم.
// المكوّن الغائب قبل انتهاء الدفعة لا يُحسب صفرًا: تُعاد الأوزان على الموجود وتُعلن التغطية؛
// وبعد انتهائها يُحسب المشروع والقياس الغائبان صفرًا بإعلان (الملحق 5 §4.2).

export const FINAL_COMPONENT_AR = {
  continuous: 'التقييم المستمر طوال التأهيل',
  milestones: 'إنجاز المعالم في مواعيدها',
  project: 'المشروع (وثيقة المبادرة بمعيارها)',
  post: 'القياس النهائي',
};
export const FINAL_DECISION_AR = { pass: 'اجتاز', pass_notes: 'اجتاز بملاحظات', extend: 'يُمدَّد', fail: 'لم يجتز' };
export const FINAL_APPROVAL_AR = {
  expert: 'خبير واحد يعتمد',
  committee_majority: 'لجنة بالأغلبية',
  committee_unanimous: 'لجنة بالإجماع',
};
export const FINAL_STATUS_AR = { draft: 'مسودة', pending: 'بانتظار الاعتماد', approved: 'معتمد', returned: 'أُعيد للمراجعة' };
// طريقة تحويل القياس البعدي إلى درجة (قرار المالك 4.1)
export const FINAL_MEASURE_AR = {
  gain: 'مكسب موثوق: اتجاه التغير الموثوق (RCI) على المؤشر الكلي، ومن بلغ محك الإتقان قبل البرنامج وبقي عليه يُحسب صاعدًا',
  mastery: 'إتقان محكّي: الاختبار الموضوعي بعد البرنامج (معرفة ومواقف بلا تقدير ذاتي) مقابل محك الإتقان',
  level: 'متوسط المؤشر البعدي (مستوى لا تعلّمًا؛ يكافئ نقطة البداية)',
};
// القرارات التي تلزمها ملاحظات تصل المشارك
export const NOTES_REQUIRED = ['pass_notes', 'extend', 'fail'];

export const FINAL_DEFAULTS = {
  weights: { continuous: 30, milestones: 20, project: 30, post: 20 },
  thresholds: { pass: 70, pass_notes: 60, extend: 45 },
  approval: 'expert',
  committee_size: 3,
  // أعضاء اللجنة بالبريد؛ فارغ = أي حساب إدارة له صلاحية الكتابة
  committee: [],
  // أقل تغطية (مجموع أوزان المكوّنات الموجودة) يُقبل بها اقتراح قرار
  min_coverage: 50,
  // «لم يجتز» يحتاج تغطية أعلى وحضور المشروع أو القياس النهائي فعلًا، وإلا يُقترح التمديد
  fail_min_coverage: 80,
  // بعد انتهاء الدفعة: المكوّنات الغائبة بسبب المشارك تُحسب صفرًا بإعلان
  zero_after_end: ['project', 'post'],
  // تعديل الدرجة النهائية بفرق عن الآلية يتجاوز هذا يحتاج توقيعين ولو كان الاعتماد بخبير واحد
  large_adjust: 15,
  // القياس النهائي: الطريقة ودرجات اتجاه المكسب ومحك الإتقان على الاختبار الموضوعي (K+S)
  measure: { mode: 'gain', gain_scores: { up: 100, flat: 60, down: 20 }, mastery_cut: 70 },
  // أوزان مصادر التقييم المستمر داخل مكوّنه (نسبية؛ صفر يستبعد المصدر). متساوية افتراضًا
  sources: { quizzes: 1, models: 1, milestones: 1, lab: 1, katon: 1 },
  // التقييم المستمر: لا يدخل المصدر المؤشر قبل هذا العدد من الأحداث (والاختبارات قبل هذا العدد من الأسئلة)
  min_events: 3,
  min_quiz_items: 10,
  // إصدار المعادلة: يرتفع مع كل حفظ للإعداد (cleanFinalConfig)، ويُحفظ في لقطة كل تقييم مرفوع
  version: 1,
  effective_from: null,
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const intIn = (v, d, a, b) => (Number.isFinite(num(v)) ? clamp(Math.round(num(v)), a, b) : d);
const emailList = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,،;]+/)).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))].slice(0, 20);

// إعداد البرنامج كما يُقرأ: الافتراضي لكل ما لم يُضبط
export function finalConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const weights = { ...FINAL_DEFAULTS.weights };
  for (const k of Object.keys(weights)) weights[k] = intIn(r.weights?.[k], weights[k], 0, 100);
  const thresholds = { ...FINAL_DEFAULTS.thresholds };
  for (const k of Object.keys(thresholds)) thresholds[k] = intIn(r.thresholds?.[k], thresholds[k], 0, 100);
  const m = r.measure && typeof r.measure === 'object' ? r.measure : {};
  const gain = { ...FINAL_DEFAULTS.measure.gain_scores };
  for (const k of Object.keys(gain)) gain[k] = intIn(m.gain_scores?.[k], gain[k], 0, 100);
  return {
    weights, thresholds,
    approval: Object.hasOwn(FINAL_APPROVAL_AR, r.approval) ? r.approval : FINAL_DEFAULTS.approval,
    committee_size: clamp(Math.round(num(r.committee_size) || FINAL_DEFAULTS.committee_size), 2, 9),
    committee: emailList(r.committee),
    min_coverage: intIn(r.min_coverage, FINAL_DEFAULTS.min_coverage, 0, 100),
    fail_min_coverage: intIn(r.fail_min_coverage, FINAL_DEFAULTS.fail_min_coverage, 0, 100),
    zero_after_end: Array.isArray(r.zero_after_end) ? r.zero_after_end.filter((k) => Object.hasOwn(FINAL_COMPONENT_AR, k)) : [...FINAL_DEFAULTS.zero_after_end],
    large_adjust: intIn(r.large_adjust, FINAL_DEFAULTS.large_adjust, 1, 100),
    measure: { mode: Object.hasOwn(FINAL_MEASURE_AR, m.mode) ? m.mode : FINAL_DEFAULTS.measure.mode, gain_scores: gain, mastery_cut: intIn(m.mastery_cut, FINAL_DEFAULTS.measure.mastery_cut, 1, 100) },
    sources: Object.fromEntries(Object.entries(FINAL_DEFAULTS.sources).map(([k, d]) => [k, intIn(r.sources?.[k], d, 0, 10)])),
    min_events: intIn(r.min_events, FINAL_DEFAULTS.min_events, 1, 20),
    min_quiz_items: intIn(r.min_quiz_items, FINAL_DEFAULTS.min_quiz_items, 1, 100),
    version: Number.isInteger(num(r.version)) && num(r.version) >= 1 ? num(r.version) : FINAL_DEFAULTS.version,
    effective_from: typeof r.effective_from === 'string' ? r.effective_from : null,
  };
}

// الإعداد كما يُحفظ: الحدود مرتبة تنازليًا، ومجموع الأوزان موجب، والإصدار يرتفع فوق السابق
export function cleanFinalConfig(raw, previous = null, now = new Date().toISOString()) {
  const c = finalConfig(raw);
  if (!Object.values(c.weights).some((w) => w > 0)) throw new Error('أعطِ وزنًا لمكوّن واحد على الأقل');
  if (!Object.values(c.sources).some((w) => w > 0)) throw new Error('أعطِ وزنًا لمصدر واحد على الأقل في التقييم المستمر');
  const t = c.thresholds;
  if (!(t.pass > t.pass_notes && t.pass_notes > t.extend)) throw new Error('حدود القرار تنازلية: الاجتياز > الاجتياز بملاحظات > التمديد');
  if (c.approval !== 'expert' && c.committee.length && c.committee.length < c.committee_size) throw new Error(`أعضاء اللجنة المسمّون (${c.committee.length}) أقل من حجمها (${c.committee_size})`);
  const g = c.measure.gain_scores;
  if (!(g.up >= g.flat && g.flat >= g.down)) throw new Error('درجات المكسب تنازلية: صاعد ≥ مستقر ≥ هابط');
  const prev = Number.isInteger(num(previous?.version)) ? num(previous.version) : 0;
  return { ...c, version: prev + 1, effective_from: now };
}

export function decisionFor(score, thresholds) {
  if (score == null) return null;
  if (score >= thresholds.pass) return 'pass';
  if (score >= thresholds.pass_notes) return 'pass_notes';
  if (score >= thresholds.extend) return 'extend';
  return 'fail';
}

// مكوّن القياس النهائي من القياس البعدي بطريقة البرنامج (قرار 4.1).
// post: { pct (متوسط المركّب البعدي), test_pre, test_post (الاختبار الموضوعي K+S قبل وبعد), direction (اتجاه RCI الكلي), submitted_at }
export function measureScore(post, measure = FINAL_DEFAULTS.measure) {
  const m = { ...FINAL_DEFAULTS.measure, ...(measure || {}) };
  if (!post) return { value: null, reason: 'لم يُكمل القياس النهائي بعد' };
  const cut = Number(m.mastery_cut);
  const mastery = () => (post.test_post == null ? { value: null, reason: 'القياس النهائي بلا اختبار موضوعي محتسب' }
    : { value: clamp(Math.round((Number(post.test_post) / cut) * 100), 0, 100), reason: `الاختبار الموضوعي بعد البرنامج ${Math.round(post.test_post)}٪ مقابل محك الإتقان ${cut}٪ (معرفة ومواقف بلا تقدير ذاتي)` });
  if (m.mode === 'mastery') return mastery();
  if (m.mode === 'level') return post.pct == null ? { value: null, reason: 'لم يُكمل القياس النهائي بعد' } : { value: Math.round(Number(post.pct)), reason: 'متوسط المؤشر المركّب في الأطر الثلاثة (مستوى لا تعلّمًا)' };
  // gain
  const g = m.gain_scores;
  const dirAr = { up: 'صاعد', flat: 'مستقر', down: 'هابط' };
  if (post.direction == null) {
    const f = mastery();
    return f.value == null ? f : { value: f.value, reason: `لا قياس مبدئي مقارن فلا يُقدَّر المكسب؛ احتُسب الإتقان المحكّي: ${f.reason}` };
  }
  const ceiling = post.test_pre != null && post.test_post != null && Number(post.test_pre) >= cut && Number(post.test_post) >= cut;
  if (ceiling && post.direction !== 'up') return { value: g.up, reason: `بلغ محك الإتقان ${cut}٪ قبل البرنامج (${Math.round(post.test_pre)}٪) وبقي عليه (${Math.round(post.test_post)}٪)؛ أثر السقف فيُحسب صاعدًا` };
  return { value: g[post.direction] ?? null, reason: `تغير موثوق ${dirAr[post.direction] || post.direction} على المؤشر الكلي (RCI)` };
}

// المكوّنات من مصادرها، مع سبب كل رقم ومصدره
// src: { continuous: {index, components, trend}, milestones: summary, capstone: {score, status}, post: {pct, test_pre, test_post, direction, submitted_at} }
export function finalComponents(src = {}, config = null) {
  const cfg = finalConfig(config);
  const c = src.continuous, m = src.milestones, cap = src.capstone, post = src.post;
  const weakest = (c?.components || []).filter((x) => x.value != null && x.in_index !== false).sort((a, b) => a.value - b.value)[0];
  const used = (c?.components || []).filter((x) => x.value != null && x.in_index !== false).length;
  const lateAll = m ? (m.late || 0) + (m.done_late || 0) : 0;
  const measured = measureScore(post, cfg.measure);
  return [
    {
      key: 'continuous', value: c?.index ?? null, source: 'التقييم المستمر',
      reason: c?.index == null ? 'لا مصادر بلغت حدها الأدنى من الأحداث بعد'
        : `متوسط ${used} مصادر${weakest ? `؛ أضعفها ${weakest.label} (${weakest.value}٪)` : ''}${c.trend ? `؛ الاتجاه ${({ up: 'صاعد', down: 'هابط', flat: 'مستقر' })[c.trend.dir]}` : ''}`,
    },
    {
      key: 'milestones', value: m?.total ? clamp(Math.round(((m.done - 0.5 * lateAll) / m.total) * 100), 0, 100) : null, source: 'المعالم',
      reason: !m?.total ? 'لا معالم في البرنامج'
        : `أنجز ${m.done} من ${m.total}${m.done_late ? `، منها ${m.done_late} بعد موعده (أقصاه ${m.max_done_late} يومًا)` : ''}${m.late ? `، ومتأخر في ${m.late} لم يُنجز (أقصاه ${m.max_late} يومًا)` : ''}${lateAll ? '؛ يُخصم نصف معلم عن كل متأخر' : '، بلا تأخر'}`,
    },
    {
      key: 'project', value: cap?.score != null ? Math.round(Number(cap.score)) : null, source: 'وثيقة المبادرة',
      reason: cap?.score != null ? 'درجة المستشار على معيار المبادرة' : cap ? 'سُلّمت المبادرة ولم تُقيَّم بعد' : 'لم تُسلَّم المبادرة بعد',
    },
    { key: 'post', value: measured.value, source: 'القياس النهائي', reason: measured.reason },
  ].map((x) => ({ ...x, label: FINAL_COMPONENT_AR[x.key] }));
}

// الحساب: آلي، ثم تعديل الخبير (لكل مكوّن أو للدرجة النهائية) بتعليل إلزامي
// adjust: { components: { [key]: { value, reason } }, score: { value, reason }, decision: { value, reason }, notes_to_participant }
// ctx: { ended } هل انتهت الدفعة؟ فيُحسب الغائب من zero_after_end صفرًا بإعلان
export function computeFinal(components, config, adjust = {}, ctx = {}) {
  const cfg = finalConfig(config);
  const ended = ctx?.ended === true;
  const total = Object.values(cfg.weights).reduce((a, b) => a + b, 0) || 1;
  const rows = components.map((x) => {
    const a = adjust?.components?.[x.key];
    const adjusted = a && Number.isFinite(num(a.value)) ? clamp(Math.round(num(a.value)), 0, 100) : null;
    const zeroed = adjusted == null && x.value == null && ended && cfg.zero_after_end.includes(x.key) && (cfg.weights[x.key] || 0) > 0;
    const value = adjusted ?? (zeroed ? 0 : x.value);
    return {
      ...x, weight: cfg.weights[x.key] || 0, auto: zeroed ? 0 : x.value, value, zeroed,
      reason: zeroed ? `${x.reason}؛ انتهت الدفعة فيُحسب صفرًا` : x.reason,
      adjusted: adjusted != null, adjust_reason: adjusted != null ? a.reason : null,
    };
  });
  const present = rows.filter((x) => x.value != null && x.weight > 0);
  const wsum = present.reduce((a, x) => a + x.weight, 0);
  const auto_score = present.length ? Math.round(present.reduce((a, x) => a + x.value * x.weight, 0) / wsum) : null;
  const coverage = Math.round((wsum / total) * 100);
  const so = adjust?.score;
  const score = so && Number.isFinite(num(so.value)) ? clamp(Math.round(num(so.value)), 0, 100) : auto_score;
  let suggested = coverage >= cfg.min_coverage ? decisionFor(score, cfg.thresholds) : null;
  // «لم يجتز» لا يُقترح إلا بتغطية عالية وبدليل حاضر فعلًا من المشروع أو القياس النهائي (لا صفر معلن)
  const evidence = rows.some((x) => ['project', 'post'].includes(x.key) && x.value != null && !x.zeroed && x.weight > 0);
  const fail_blocked = suggested === 'fail' && !(coverage >= cfg.fail_min_coverage && evidence);
  if (fail_blocked) suggested = 'extend';
  const dec = adjust?.decision?.value && Object.hasOwn(FINAL_DECISION_AR, adjust.decision.value) ? adjust.decision.value : suggested;
  const missing = rows.filter((x) => x.value == null && x.weight > 0).map((x) => x.label);
  const zeroed = rows.filter((x) => x.zeroed).map((x) => x.label);
  // تعديل يخالف ما تقترحه الأدلة يُعلَن ليُطلب له تعليل؛ وتعديل كبير للدرجة يحتاج توقيعين
  const departs = dec && suggested && dec !== suggested;
  const large_adjust = score != null && auto_score != null && Math.abs(score - auto_score) > cfg.large_adjust;
  return {
    components: rows.map((x) => ({ ...x, share: x.value != null && x.weight > 0 && wsum ? Math.round((x.weight / wsum) * 100) : 0 })),
    auto_score, score, score_adjusted: score !== auto_score, coverage, missing, zeroed, ended,
    suggested, fail_blocked, decision: dec, departs, large_adjust,
    notes_to_participant: adjust?.notes_to_participant || null,
    config: cfg, config_version: cfg.version,
  };
}

// التعديلات كما تُحفظ: كل تعديل بتعليل لا يقل عن عشرة أحرف، وملاحظات للمشارك مع القرارات التي تلزمها
export function cleanAdjust(raw, computed, ctx = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const why = (x) => String(x?.reason || '').trim().slice(0, 1000);
  const need = (x, what) => { if (why(x).length < 10) throw new Error(`اكتب تعليلًا واضحًا لتعديل ${what}`); return why(x); };
  const out = { components: {} };
  for (const [k, v] of Object.entries(r.components || {})) {
    if (!Object.hasOwn(FINAL_COMPONENT_AR, k) || !Number.isFinite(num(v?.value))) continue;
    out.components[k] = { value: clamp(Math.round(num(v.value)), 0, 100), reason: need(v, `«${FINAL_COMPONENT_AR[k]}»`) };
  }
  if (r.score && Number.isFinite(num(r.score.value))) out.score = { value: clamp(Math.round(num(r.score.value)), 0, 100), reason: need(r.score, 'الدرجة النهائية') };
  const after = computeFinal(computed, ctx.config || null, { ...out }, ctx);
  if (r.decision?.value && Object.hasOwn(FINAL_DECISION_AR, r.decision.value)) {
    const differs = after.suggested && r.decision.value !== after.suggested;
    out.decision = { value: r.decision.value, reason: differs ? need(r.decision, 'القرار المخالف للمقترح') : why(r.decision) || null };
  }
  const notes = String(r.notes_to_participant || '').trim().slice(0, 2000);
  if (notes) out.notes_to_participant = notes;
  const decision = out.decision?.value || after.suggested;
  if (NOTES_REQUIRED.includes(decision) && notes.length < 10) throw new Error(`قرار «${FINAL_DECISION_AR[decision]}» يلزمه ملاحظات تصل المشارك: ما الذي ينقصه وكيف يستكمله`);
  return out;
}

// هل يحق لهذا الحساب التصويت على هذا التقييم؟ null = نعم، وإلا سبب المنع
export function voteBlock(email, record, config) {
  const cfg = finalConfig(config);
  const e = String(email || '').toLowerCase();
  if (cfg.committee.length && !cfg.committee.includes(e)) return 'الاعتماد لأعضاء اللجنة المسمّين في إعداد البرنامج';
  const adj = record?.adjust || {};
  const touched = Object.keys(adj.components || {}).length > 0 || !!adj.score || !!adj.decision;
  if (touched && record?.submitted_by && String(record.submitted_by).toLowerCase() === e) return 'من عدّل التقييم لا يعتمده بنفسه؛ يعتمده خبير آخر';
  return null;
}

// الاعتماد: من يكفي توقيعه بحسب طريقة البرنامج؛ تعديل كبير للدرجة يحتاج توقيعين ولو كان الاعتماد بخبير
export function approvalState(votes, config, { largeAdjust = false } = {}) {
  const cfg = finalConfig(config);
  const yes = (votes || []).filter((v) => v.vote === 'approve').length;
  const no = (votes || []).filter((v) => v.vote === 'return').length;
  if (cfg.approval === 'expert') {
    const need = largeAdjust ? 2 : 1;
    return { done: yes >= need, returned: no >= 1 && yes === 0, need, yes, no, large_adjust: largeAdjust };
  }
  if (cfg.approval === 'committee_unanimous') return { done: yes >= cfg.committee_size && no === 0, returned: no >= 1, need: cfg.committee_size, yes, no };
  const majority = Math.floor(cfg.committee_size / 2) + 1;
  return { done: yes >= majority, returned: no >= majority, need: majority, yes, no };
}
