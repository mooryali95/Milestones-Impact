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

// ════════════════════════════════════════════════════════════════
// الأنشطة الموثقة: قراءة، فيديو، ورشة حضورية، جلسات توجيه
// ════════════════════════════════════════════════════════════════
// المتطلب من هذه الأنواع لا يكتمل بنقرة؛ يحسمه دليل يجمعه النظام.
// تجاوز يدوي من المستشار (participant_requirements.status = done) يبقى ممكنًا.
export const VERIFIED_KINDS = ['reading', 'video', 'workshop', 'coaching', 'curriculum'];

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
  return null;
}

// إعداد النشاط كما يحفظه المستشار: حقول معروفة بقيم مضبوطة فقط.
// prev: الإعداد السابق، لحفظ ما لا يُحرَّر من النموذج (توفر الاتصال الفوري).
const httpsUrl = (u) => { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' ? x.toString() : null; } catch { return null; } };
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
    return { sessions_required: intIn(c.sessions_required, 1, 30, 1), verify: VERIFY_METHODS.includes(c.verify) ? c.verify : 'qr' };
  }
  if (kind === 'curriculum') {
    // منهج المسار كله، أو مواد بُعد واحد (لتوزيعه على مراحل)
    return DIMENSIONS.includes(c.dimension) ? { dimension: c.dimension } : {};
  }
  if (kind === 'coaching') {
    const out = {
      sessions_required: intIn(c.sessions_required, 1, 30, 1), minutes: intIn(c.minutes, 5, 480, 60),
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

export function itemAnalysis(questions, rows, { minN = 10 } = {}) {
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
    // الثبات على من أجاب عن كل أسئلة البعد
    const complete = [...answers.values()].filter((a) => qs.every((q) => a.has(q.id)));
    const k = qs.length;
    let alpha = null;
    if (k > 1 && complete.length >= 3) {
      const itemVar = qs.reduce((s, q) => s + variance(complete.map((a) => a.get(q.id))), 0);
      const totalVar = variance(complete.map((a) => qs.reduce((s, q) => s + a.get(q.id), 0)));
      alpha = totalVar ? (k / (k - 1)) * (1 - itemVar / totalVar) : null;
    }
    dimensions.push({ dimension: d, items: k, complete: complete.length, alpha: round2(alpha) });
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
