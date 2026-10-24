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

// ════════════════════════════════════════════════════════════════
// الأنشطة الموثقة: قراءة، فيديو، ورشة حضورية، جلسات توجيه
// ════════════════════════════════════════════════════════════════
// المتطلب من هذه الأنواع لا يكتمل بنقرة؛ يحسمه دليل يجمعه النظام.
// تجاوز يدوي من المستشار (participant_requirements.status = done) يبقى ممكنًا.
export const VERIFIED_KINDS = ['reading', 'video', 'workshop', 'coaching'];

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
export function workshopStatus(config, sessions, attended) {
  const list = (sessions || []).filter((s) => s.active !== false)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
    .map((s) => ({ id: s.id, title: s.title_ar, location: s.location_ar || null, starts_at: s.starts_at, ends_at: s.ends_at, attended: attended.has(s.id) }));
  const need = Math.max(1, Number(config?.sessions_required) || list.length || 1);
  const count = list.filter((s) => s.attended).length;
  return { type: 'workshop', done: count >= need, count, total: need, sessions: list };
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

export const instantAvailable = (config, now = Date.now()) =>
  !!(config?.instant_url && config?.instant_until && new Date(config.instant_until).getTime() > now);

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
  if (req.kind === 'workshop') return workshopStatus(c, (ev.workshops || []).filter((s) => s.requirement_id === req.id), ev.attended || new Set());
  if (req.kind === 'coaching') return coachingStatus(c, (ev.coaching || []).filter((s) => s.requirement_id === req.id), now);
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
  if (kind === 'workshop') return { sessions_required: intIn(c.sessions_required, 1, 30, 1) };
  if (kind === 'coaching') {
    const out = { sessions_required: intIn(c.sessions_required, 1, 30, 1), minutes: intIn(c.minutes, 5, 480, 60) };
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
