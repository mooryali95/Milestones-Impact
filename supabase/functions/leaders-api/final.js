// ════════════════════════════════════════════════════════════════
// التقييم الختامي: درجة آلية من مصادرها، قابلة لتعديل الخبير بتعليل، وقرار يُعتمد
// ════════════════════════════════════════════════════════════════
// يُبنى على مرحلة الدعم والتمكين وما قبلها: التقييم المستمر، والمعالم، والمشروع، والقياس النهائي.
// لا رقم يُنسخ: كل مكوّن يُحسب من مصدره عند العرض، ويحمل سببه بجملة ومصدره.
// الإعداد لكل برنامج (programs.final_eval) يضبطه الأدمن: الأوزان، وحدود القرار، وطريقة الاعتماد.
// المكوّن الغائب لا يُحسب صفرًا: تُعاد الأوزان على الموجود، وتُعلن التغطية.

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

export const FINAL_DEFAULTS = {
  weights: { continuous: 30, milestones: 20, project: 30, post: 20 },
  thresholds: { pass: 70, pass_notes: 60, extend: 45 },
  approval: 'expert',
  committee_size: 3,
  // أقل تغطية (مجموع أوزان المكوّنات الموجودة) يُقبل بها اقتراح قرار
  min_coverage: 50,
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// إعداد البرنامج كما يُقرأ: الافتراضي لكل ما لم يُضبط
export function finalConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const weights = { ...FINAL_DEFAULTS.weights };
  for (const k of Object.keys(weights)) if (Number.isFinite(num(r.weights?.[k]))) weights[k] = clamp(Math.round(num(r.weights[k])), 0, 100);
  const thresholds = { ...FINAL_DEFAULTS.thresholds };
  for (const k of Object.keys(thresholds)) if (Number.isFinite(num(r.thresholds?.[k]))) thresholds[k] = clamp(Math.round(num(r.thresholds[k])), 0, 100);
  return {
    weights, thresholds,
    approval: Object.hasOwn(FINAL_APPROVAL_AR, r.approval) ? r.approval : FINAL_DEFAULTS.approval,
    committee_size: clamp(Math.round(num(r.committee_size) || FINAL_DEFAULTS.committee_size), 2, 9),
    min_coverage: Number.isFinite(num(r.min_coverage)) ? clamp(Math.round(num(r.min_coverage)), 0, 100) : FINAL_DEFAULTS.min_coverage,
  };
}

// الإعداد كما يُحفظ: الحدود مرتبة تنازليًا، ومجموع الأوزان موجب
export function cleanFinalConfig(raw) {
  const c = finalConfig(raw);
  if (!Object.values(c.weights).some((w) => w > 0)) throw new Error('أعطِ وزنًا لمكوّن واحد على الأقل');
  const t = c.thresholds;
  if (!(t.pass > t.pass_notes && t.pass_notes > t.extend)) throw new Error('حدود القرار تنازلية: الاجتياز > الاجتياز بملاحظات > التمديد');
  return c;
}

export function decisionFor(score, thresholds) {
  if (score == null) return null;
  if (score >= thresholds.pass) return 'pass';
  if (score >= thresholds.pass_notes) return 'pass_notes';
  if (score >= thresholds.extend) return 'extend';
  return 'fail';
}

// المكوّنات من مصادرها، مع سبب كل رقم ومصدره
// src: { continuous: {index, components, trend}, milestones: summary, capstone: {score, status}, post: {pct, submitted_at} }
export function finalComponents(src = {}) {
  const c = src.continuous, m = src.milestones, cap = src.capstone, post = src.post;
  const weakest = (c?.components || []).filter((x) => x.value != null).sort((a, b) => a.value - b.value)[0];
  return [
    {
      key: 'continuous', value: c?.index ?? null, source: 'التقييم المستمر',
      reason: c?.index == null ? 'لا تقييمات مستمرة بعد'
        : `متوسط ${c.components.filter((x) => x.value != null).length} مصادر${weakest ? `؛ أضعفها ${weakest.label} (${weakest.value}٪)` : ''}${c.trend ? `؛ الاتجاه ${({ up: 'صاعد', down: 'هابط', flat: 'مستقر' })[c.trend.dir]}` : ''}`,
    },
    {
      key: 'milestones', value: m?.total ? clamp(Math.round(((m.done - 0.5 * m.late) / m.total) * 100), 0, 100) : null, source: 'المعالم',
      reason: !m?.total ? 'لا معالم في البرنامج'
        : `أنجز ${m.done} من ${m.total}${m.late ? `، ومتأخر في ${m.late} (أقصاه ${m.max_late} يومًا، ويُخصم نصف معلم عن كل متأخر)` : '، بلا تأخر'}`,
    },
    {
      key: 'project', value: cap?.score != null ? Math.round(Number(cap.score)) : null, source: 'وثيقة المبادرة',
      reason: cap?.score != null ? 'درجة المستشار على معيار المبادرة' : cap ? 'سُلّمت المبادرة ولم تُقيَّم بعد' : 'لم تُسلَّم المبادرة بعد',
    },
    {
      key: 'post', value: post?.pct != null ? Math.round(Number(post.pct)) : null, source: 'القياس النهائي',
      reason: post?.pct != null ? 'متوسط المؤشر المركّب في الأطر الثلاثة' : 'لم يُكمل القياس النهائي بعد',
    },
  ].map((x) => ({ ...x, label: FINAL_COMPONENT_AR[x.key] }));
}

// الحساب: آلي، ثم تعديل الخبير (لكل مكوّن أو للدرجة النهائية) بتعليل إلزامي
// adjust: { components: { [key]: { value, reason } }, score: { value, reason }, decision: { value, reason } }
export function computeFinal(components, config, adjust = {}) {
  const cfg = finalConfig(config);
  const total = Object.values(cfg.weights).reduce((a, b) => a + b, 0) || 1;
  const rows = components.map((x) => {
    const a = adjust?.components?.[x.key];
    const adjusted = a && Number.isFinite(num(a.value)) ? clamp(Math.round(num(a.value)), 0, 100) : null;
    const value = adjusted ?? x.value;
    return { ...x, weight: cfg.weights[x.key] || 0, auto: x.value, value, adjusted: adjusted != null, adjust_reason: adjusted != null ? a.reason : null };
  });
  const present = rows.filter((x) => x.value != null && x.weight > 0);
  const wsum = present.reduce((a, x) => a + x.weight, 0);
  const auto_score = present.length ? Math.round(present.reduce((a, x) => a + x.value * x.weight, 0) / wsum) : null;
  const coverage = Math.round((wsum / total) * 100);
  const so = adjust?.score;
  const score = so && Number.isFinite(num(so.value)) ? clamp(Math.round(num(so.value)), 0, 100) : auto_score;
  const suggested = coverage >= cfg.min_coverage ? decisionFor(score, cfg.thresholds) : null;
  const dec = adjust?.decision?.value && Object.hasOwn(FINAL_DECISION_AR, adjust.decision.value) ? adjust.decision.value : suggested;
  const missing = rows.filter((x) => x.value == null && x.weight > 0).map((x) => x.label);
  // تعديل يخالف ما تقترحه الأدلة يُعلَن ليُطلب له تعليل
  const departs = dec && suggested && dec !== suggested;
  return {
    components: rows.map((x) => ({ ...x, share: x.value != null && x.weight > 0 && wsum ? Math.round((x.weight / wsum) * 100) : 0 })),
    auto_score, score, score_adjusted: score !== auto_score, coverage, missing,
    suggested, decision: dec, departs, config: cfg,
  };
}

// التعديلات كما تُحفظ: كل تعديل بتعليل لا يقل عن عشرة أحرف
export function cleanAdjust(raw, computed) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const why = (x) => String(x?.reason || '').trim().slice(0, 1000);
  const need = (x, what) => { if (why(x).length < 10) throw new Error(`اكتب تعليلًا واضحًا لتعديل ${what}`); return why(x); };
  const out = { components: {} };
  for (const [k, v] of Object.entries(r.components || {})) {
    if (!Object.hasOwn(FINAL_COMPONENT_AR, k) || !Number.isFinite(num(v?.value))) continue;
    out.components[k] = { value: clamp(Math.round(num(v.value)), 0, 100), reason: need(v, `«${FINAL_COMPONENT_AR[k]}»`) };
  }
  if (r.score && Number.isFinite(num(r.score.value))) out.score = { value: clamp(Math.round(num(r.score.value)), 0, 100), reason: need(r.score, 'الدرجة النهائية') };
  if (r.decision?.value && Object.hasOwn(FINAL_DECISION_AR, r.decision.value)) {
    const after = computeFinal(computed, null, { ...out });
    const differs = after.suggested && r.decision.value !== after.suggested;
    out.decision = { value: r.decision.value, reason: differs ? need(r.decision, 'القرار المخالف للمقترح') : why(r.decision) || null };
  }
  return out;
}

// الاعتماد: من يكفي توقيعه بحسب طريقة البرنامج
export function approvalState(votes, config) {
  const cfg = finalConfig(config);
  const yes = (votes || []).filter((v) => v.vote === 'approve').length;
  const no = (votes || []).filter((v) => v.vote === 'return').length;
  if (cfg.approval === 'expert') return { done: yes >= 1, returned: no >= 1 && yes === 0, need: 1, yes, no };
  if (cfg.approval === 'committee_unanimous') return { done: yes >= cfg.committee_size && no === 0, returned: no >= 1, need: cfg.committee_size, yes, no };
  const majority = Math.floor(cfg.committee_size / 2) + 1;
  return { done: yes >= majority, returned: no >= majority, need: majority, yes, no };
}
