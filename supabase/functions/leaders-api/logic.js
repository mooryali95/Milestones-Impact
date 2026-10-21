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

export function placementFromAnswers(questions, answers, rules) {
  const pcts = tierPercents(questions, answers);
  return DIMENSIONS.map((dimension) => ({
    dimension,
    ...pcts[dimension],
    level: levelFor(pcts[dimension], rules.filter((r) => r.dimension === dimension)),
  }));
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
