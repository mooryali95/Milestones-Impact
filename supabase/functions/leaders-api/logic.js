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
// خيار بدرجة سالبة يعني "لا ينطبق على عملي": يُستبعد سؤاله من الحساب.
export function tierPercents(questions, answers) {
  const acc = {};
  for (const q of questions) {
    if (q.active === false) continue;
    if (answers[q.id] != null && (scoreFor(q, answers[q.id]) ?? 0) < 0) continue;
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
// حد المتوسط الأدنى 40 فوق نسبة التخمين في أسئلة الأربعة بدائل (25%)،
// والهامش الحدّي 8 قريب من خطأ القياس المتوقع لستة أسئلة في الجانب.
export const DEFAULT_MODEL = {
  w_knowledge: 35, w_skill: 50, w_behavior: 15,
  min_intermediate: 55, min_advanced: 80,
  floor_intermediate: 40, floor_advanced: 60,
  borderline: 8,
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

// ── الكتاب التفاعلي: الاختبارات والنقاط ──
// صيغة الاختبار في quiz_md:
//   س: نص السؤال
//   - خيار
//   * الخيار الصحيح
//   لماذا: شرح يظهر بعد الإجابة
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
export function modelsFor(models, levels) {
  return models
    .filter((m) => m.active !== false && levels[m.dimension] && RANK[levels[m.dimension]] >= RANK[m.min_level])
    .sort((a, b) => DIMENSIONS.indexOf(a.dimension) - DIMENSIONS.indexOf(b.dimension) || a.sort - b.sort);
}

// يتحقق من اكتمال النموذج قبل التسليم؛ يعيد قائمة بالحقول الناقصة
export function missingFields(fields, answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const missing = [];
  for (const f of fields || []) {
    if (f.required === false) continue;
    const v = a[f.key];
    if (f.type === 'table') {
      const rows = (Array.isArray(v) ? v : []).filter((r) => Array.isArray(r) && String(r[0] || '').trim());
      if (rows.length < (f.min_rows || 1)) missing.push(`${f.label}: ${f.min_rows || 1} صفوف على الأقل`);
    } else if (!String(v ?? '').trim()) missing.push(f.label);
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
export const COORD_DEFAULTS = { scores: false, contact: false, export: true };
export function coordPermissions(p) {
  const x = p && typeof p === 'object' ? p : {};
  return { scores: x.scores === true, contact: x.contact === true, export: x.export !== false };
}

// ما يراه المنسق من المشارك: الاسم والمسمى والمسار والمرحلة ونسبة الإنجاز دائمًا،
// والتواصل والدرجات فقط إن سمح المدير. لا شيء غيرها يخرج من الخادم.
export function coordParticipant(p, perms) {
  const out = {
    id: p.id, full_name: p.full_name, job_title: p.job_title || null, status: p.status,
    track: p.track || null, track_title: p.track_title || null, approved: !!p.approved,
    progress: Number.isFinite(p.progress) ? p.progress : 0, created_at: p.created_at, last_login_at: p.last_login_at || null,
  };
  if (perms.contact) { out.email = p.email || null; out.phone = p.phone || null; }
  if (perms.scores) out.levels = p.levels || null;
  return out;
}

// نسبة الإنجاز: البنود المنجزة من المتطلبات الإلزامية النشطة
export function progressPct(doneCount, requiredTotal) {
  if (!requiredTotal) return 0;
  return Math.min(100, Math.round((doneCount / requiredTotal) * 100));
}

// مفتاح أسبوع ISO لمنع إرسال التقرير الأسبوعي مرتين
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
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

export const IMPACT_DEFAULTS = { rci_reliability: 0.75, rci_sd: 15, min_n: 20, rater_threshold: 10 };

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

export function reliableChange(pre, post, sd, reliability) {
  if (pre == null || post == null) return { rci: null, reliable: false, direction: null, threshold: null };
  const sem = Number(sd) * Math.sqrt(Math.max(0, 1 - Number(reliability)));
  const sdiff = Math.SQRT2 * sem;
  if (!(sdiff > 0)) return { rci: null, reliable: false, direction: null, threshold: null };
  const rci = (post - pre) / sdiff;
  const reliable = Math.abs(rci) >= 1.96;
  return { rci: r2(rci), reliable, direction: reliable ? (rci > 0 ? 'up' : 'down') : 'flat', threshold: r1(1.96 * sdiff) };
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
export function beforePercents(questions, values) {
  const qs = questions.filter((q) => q.retro && values[q.id]?.before != null);
  return tierPercents(qs, beforeAnswers(qs, values));
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

// الحكم على أثر البرنامج في بُعد واحد بتثليث المصادر:
//   الاختبار (معرفة ومواقف) بتغير موثوق، والممارسة الذاتية، وتقدير المقيّم
//   الخارجي، ودليل الحالة المعتمد. "تغير مؤكد" يتطلب مصدرين أحدهما غير ذاتي.
export function impactVerdict({ test, self, rater, evidence }) {
  const sources = [
    test === 'up' && 'test', self === 'up' && 'self', rater === 'up' && 'rater', evidence && 'evidence',
  ].filter(Boolean);
  const external = sources.some((s) => s !== 'self');
  if (test === 'down' || rater === 'down') return { key: 'decline', sources, label: 'تراجع يحتاج مراجعة' };
  if (sources.length >= 2 && external) return { key: 'confirmed', sources, label: 'تغير مؤكد' };
  if (sources.length >= 1) return { key: 'emerging', sources, label: 'مؤشرات أولية' };
  return { key: 'none', sources, label: 'لا دليل كافٍ على التغير' };
}

// المقارنة الكاملة لمشارك واحد في الأبعاد الثلاثة
export function compareAssessments({ pre, post, model, impact, rater, evidence }) {
  const cfg = { ...IMPACT_DEFAULTS, ...(impact || {}) };
  return DIMENSIONS.map((dimension) => {
    const a = pre?.[dimension] || {}, b = post?.[dimension] || {};
    const cc = comparableComposite(a, b, model);
    const rel = cfg.reliability?.[dimension] ?? cfg.rci_reliability;
    const sd = cfg.sd?.[dimension] ?? cfg.rci_sd;
    const rc = reliableChange(cc.pre, cc.post, sd, rel);
    // الاختبار وحده: المعرفة والمواقف، بلا تقدير ذاتي
    const testPre = comparableComposite({ ...a, behavior: null }, { ...b, behavior: null }, model);
    const testRc = reliableChange(testPre.pre, testPre.post, sd, rel);
    const selfDiff = a.behavior != null && b.behavior != null ? b.behavior - a.behavior : null;
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
      rci: rc.rci, reliable: rc.reliable, direction: rc.direction, threshold: rc.threshold,
      test_direction: testRc.direction,
      self_change: r1(selfDiff), retro_change: r1(retroDiff),
      // انزياح الاستجابة: تقديره الأول لنفسه ناقص تقديره اللاحق لما كان عليه
      response_shift: a.behavior != null && b.behavior_before != null ? r1(a.behavior - b.behavior_before) : null,
      rater: r || null, rater_change: r1(raterDiff),
      verdict: impactVerdict({ test: testRc.direction, self, rater: raterDir, evidence: !!evidence }),
    };
  });
}
