// ════════════════════════════════════════════════════════════════
// منطق تطبيق القادة الصافي: احتساب المستوى وبناء الرحلة
// ════════════════════════════════════════════════════════════════
// بلا اعتماد على قاعدة البيانات ولا على Deno، حتى يُختبر في vitest
// (leaders-app/src/logic.test.js) ويُستورد كما هو في دالة الحافة.

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
export function tierPercents(questions, answers) {
  const acc = {};
  for (const q of questions) {
    if (q.active === false) continue;
    const d = (acc[q.dimension] ||= {});
    const t = (d[q.tier] ||= { got: 0, max: 0 });
    const w = Number(q.weight ?? 1);
    t.max += maxScore(q) * w;
    const a = answers[q.id];
    if (a != null) t.got += (scoreFor(q, a) || 0) * w;
  }
  const out = {};
  for (const dim of DIMENSIONS) {
    out[dim] = {};
    for (const tier of TIERS) {
      const t = acc[dim]?.[tier];
      out[dim][tier] = t && t.max > 0 ? Math.round((t.got / t.max) * 10000) / 100 : null;
    }
  }
  return out;
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
// المستوى يُمنح بالمؤشر المركّب، بشرط ألا يقل أي جانب عن حدّ أدنى،
// فلا تُخفي قوة جانب فجوة حقيقية في آخر. وتُعلَّم الحالة الحدّية للمستشار.
export const DEFAULT_MODEL = {
  w_knowledge: 30, w_skill: 45, w_behavior: 25,
  min_intermediate: 55, min_advanced: 80,
  floor_intermediate: 25, floor_advanced: 50,
  borderline: 5,
};
const TIER_AR = { knowledge: 'المعرفة', skill: 'المواقف', behavior: 'الممارسة' };
const LEVEL_AR = { beginner: 'تأسيسي', intermediate: 'متوسط', advanced: 'احترافي' };

export function evaluatePlacement(pcts, model = DEFAULT_MODEL) {
  const m = { ...DEFAULT_MODEL, ...(model || {}) };
  const w = { knowledge: Number(m.w_knowledge), skill: Number(m.w_skill), behavior: Number(m.w_behavior) };
  const tiers = TIERS.filter((t) => pcts?.[t] != null && w[t] > 0);
  const wsum = tiers.reduce((a, t) => a + w[t], 0);
  if (!wsum) return { level: 'beginner', composite: null, borderline: false, reason: 'لا إجابات كافية للاحتساب' };
  const composite = Math.round(tiers.reduce((a, t) => a + w[t] * Number(pcts[t]), 0) / wsum * 10) / 10;
  const weakest = tiers.reduce((a, t) => (Number(pcts[t]) < Number(pcts[a]) ? t : a), tiers[0]);
  const low = Number(pcts[weakest]);
  const gate = (min, floor) => composite >= Number(min) && low >= Number(floor);
  const level = gate(m.min_advanced, m.floor_advanced) ? 'advanced' : gate(m.min_intermediate, m.floor_intermediate) ? 'intermediate' : 'beginner';

  let reason, borderline = false;
  const next = level === 'beginner' ? ['intermediate', m.min_intermediate, m.floor_intermediate]
    : level === 'intermediate' ? ['advanced', m.min_advanced, m.floor_advanced] : null;
  if (!next) reason = `المؤشر ${composite} بلغ حد مستوى احترافي (${m.min_advanced}) ولا جانب دون ${m.floor_advanced}`;
  else {
    const [nl, nmin, nfloor] = next;
    const gap = Math.round((Number(nmin) - composite) * 10) / 10;
    if (composite >= Number(nmin)) {
      reason = `المؤشر ${composite} يكفي لمستوى ${LEVEL_AR[nl]}، لكن ${TIER_AR[weakest]} ${low}% دون الحد الأدنى ${nfloor}%`;
      borderline = Number(nfloor) - low <= Number(m.borderline);
    } else {
      reason = `المؤشر ${composite} من 100، ويبعد ${gap} عن حد مستوى ${LEVEL_AR[nl]} (${nmin})`;
      borderline = gap <= Number(m.borderline);
    }
  }
  return { level, composite, borderline, reason };
}

export function placementFromAnswers(questions, answers, rules, model = null) {
  const pcts = tierPercents(questions, answers);
  return DIMENSIONS.map((dimension) => {
    if (model) return { dimension, ...pcts[dimension], ...evaluatePlacement(pcts[dimension], model) };
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
export function buildJourney({ stages, requirements, progress, levels, state }) {
  const sorted = [...stages].filter((s) => s.active !== false).sort((a, b) => a.sort - b.sort);
  let reachedCurrent = false;
  return sorted.map((stage) => {
    const items = requirements
      .filter((r) => r.stage_key === stage.key && requirementApplies(r, levels))
      .sort((a, b) => a.sort - b.sort)
      .map((r) => {
        const auto = AUTO_CHECKS[r.code] || null;
        const p = progress[r.id] || {};
        const status = auto ? (auto(state) ? 'done' : 'pending') : p.status || 'pending';
        return { ...r, auto: !!auto, status, note: p.note || null, evidence_path: p.evidence_path || null };
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

export function handbookModulesFor(modules, levels) {
  return modules
    .filter((m) => levels[m.dimension] && RANK[levels[m.dimension]] >= RANK[m.min_level] && (m.body_md || '').trim())
    .sort((a, b) => DIMENSIONS.indexOf(a.dimension) - DIMENSIONS.indexOf(b.dimension) || a.sort - b.sort);
}

// كتل المستوى داخل الباب:
//   :::min=intermediate … :::  لمن مستواه متوسط فأعلى
//   :::only=beginner   … :::  لمستوى واحد فقط
// تُحذف على الخادم قبل الإرسال، فلا يصل للمشارك ما لا يخص مستواه.
export function filterHandbookMd(md, level) {
  const out = [];
  let keep = true;
  for (const line of String(md || '').split('\n')) {
    const open = line.trim().match(/^:::(min|only)=(beginner|intermediate|advanced)$/);
    if (open) {
      keep = open[1] === 'min' ? RANK[level] >= RANK[open[2]] : level === open[2];
      continue;
    }
    if (line.trim() === ':::') { keep = true; continue; }
    if (keep) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
