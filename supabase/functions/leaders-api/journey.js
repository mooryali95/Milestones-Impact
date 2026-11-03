// ════════════════════════════════════════════════════════════════
// الرحلة من إعداداتها: نصوص تُملأ من مصدرها، وفحص اتساق، وساعات البرنامج
// ════════════════════════════════════════════════════════════════
// منفصلة عن logic.js لحجمها؛ تُصدَّر منه أيضًا فلا يتغير أي استيراد قائم.
import { requirementApplies, SESSION_DEFAULTS } from './logic.js';

// ════════════════════════════════════════════════════════════════
// نصوص الرحلة من الإعدادات: لا رقم جلسات أو مدة يُكتب في وصف
// ════════════════════════════════════════════════════════════════
// وصف المرحلة وعناوين متطلباتها تحمل رموزًا تُملأ من مصدرها عند العرض:
//   {sessions:O-SESS} عدد جلسات المتطلب (أربع جلسات)    {minutes:O-SESS} مدة الجلسة (60 دقيقة)
//   {days:T-ATTEND}  عدد الأيام (أربعة أيام)             {duration} مدة المرحلة من duration_days
//   {ready_min} عتبة جاهزية مشروع التخرج               {assessment_minutes} مدة القياس المبدئي
const FEM = { 3: 'ثلاث', 4: 'أربع', 5: 'خمس', 6: 'ست', 7: 'سبع', 8: 'ثماني', 9: 'تسع', 10: 'عشر' };
const MASC = { 3: 'ثلاثة', 4: 'أربعة', 5: 'خمسة', 6: 'ستة', 7: 'سبعة', 8: 'ثمانية', 9: 'تسعة', 10: 'عشرة' };
const counted = (n, one, two, few, many, words) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${words ? words[n] : n} ${few}` : `${n} ${many}`);
export const sessionsAr = (n) => counted(n, 'جلسة واحدة', 'جلستان', 'جلسات', 'جلسة', FEM);
export const daysAr = (n) => counted(n, 'يوم واحد', 'يومان', 'أيام', 'يومًا', MASC);
export const minutesAr = (n) => `${n} دقيقة`;
export function durationAr(days) {
  const d = Number(days) || 0;
  if (!d) return '';
  if (d % 30 === 0) return counted(d / 30, 'شهر', 'شهران', 'أشهر', 'شهرًا');
  if (d % 7 === 0) return counted(d / 7, 'أسبوع', 'أسبوعان', 'أسابيع', 'أسبوعًا');
  return counted(d, 'يوم', 'يومان', 'أيام', 'يومًا');
}

const TOKEN = /\{(sessions|minutes|days):([A-Z0-9-]+)\}|\{(duration|ready_min|assessment_minutes)\}/g;
// ctx: { reqs: [{code, config}], durationDays, readyMin, assessmentMinutes }
// رمز لمتطلب غير موجود يبقى ظاهرًا كما هو فيلاحظه المحرر، ولا يُخترع رقم
export function renderJourneyText(text, ctx = {}) {
  if (typeof text !== 'string' || !text.includes('{')) return text;
  const byCode = new Map((ctx.reqs || []).map((r) => [r.code, r.config || {}]));
  return text.replace(TOKEN, (all, kind, code, plain) => {
    if (plain === 'duration') return durationAr(ctx.durationDays) || all;
    if (plain === 'ready_min') return ctx.readyMin != null ? String(ctx.readyMin) : all;
    if (plain === 'assessment_minutes') return ctx.assessmentMinutes ? minutesAr(ctx.assessmentMinutes) : all;
    const c = byCode.get(code);
    if (!c) return all;
    const n = Math.max(1, Number(c.sessions_required) || SESSION_DEFAULTS.sessions_required);
    if (kind === 'sessions') return sessionsAr(n);
    if (kind === 'days') return daysAr(n);
    return minutesAr(Number(c.minutes) || SESSION_DEFAULTS.minutes);
  });
}

const STAGE_TEXT = ['title_ar', 'duration_label', 'description_ar', 'activities_ar', 'outcome_ar', 'mode_note_ar', 'builds_on_ar'];
/**
 * @param {any} def
 * @param {{ readyMin?: number|null, assessmentMinutes?: number|null }} [opts]
 */
export function renderJourney(def, { readyMin = null, assessmentMinutes = null } = {}) {
  const base = { reqs: def.requirements, readyMin, assessmentMinutes };
  const stages = def.stages.map((s) => {
    const ctx = { ...base, durationDays: s.duration_days };
    const out = { ...s };
    for (const f of STAGE_TEXT) out[f] = renderJourneyText(s[f], ctx);
    return out;
  });
  const requirements = def.requirements.map((r) => ({ ...r, title_ar: renderJourneyText(r.title_ar, base), help_ar: renderJourneyText(r.help_ar, base) }));
  return { ...def, stages, requirements };
}

// حارس الحفظ: رقم جلسات أو دقائق أو مدة مكتوب نصًا في وصف الرحلة يُرفض، ويُقترح الرمز
/** @type {Array<[RegExp, string]>} */
const HARDCODED = [
  [/\d+\s*دقيقة|دقيقتان|(?:ثلاث|أربع|خمس|ست|سبع|ثماني|تسع|عشر)\s+جلسات|جلستان|\d+\s*جلس/, 'اكتب عدد الجلسات ومدتها برمز من إعداد النشاط: {sessions:الرمز} و{minutes:الرمز}'],
  [/\d+\s*(?:أسابيع|أسبوع|أشهر|شهر)|أسبوعان|شهران/, 'مدة المرحلة تُكتب برمز {duration} من حقل عدد الأيام'],
  [/\d+\s*أيام/, 'عدد الأيام يُكتب برمز {days:الرمز} أو {duration}'],
];
export function hardcodedFacts(text) {
  const t = String(text || '').replace(TOKEN, '');
  const hit = HARDCODED.find(([re]) => re.test(t));
  return hit ? hit[1] : null;
}

// ════════════════════════════════════════════════════════════════
// اتساق الرحلة: هل تتسع المرحلة لما يُطلب فيها؟
// ════════════════════════════════════════════════════════════════
// تُعرض للمحرر قبل الحفظ وبعده. error يمنع ما لا يُعرض صحيحًا (رمز بلا مصدر)،
// وwarn ينبّه إلى ما يصعب تنفيذه (جلسات أكثر مما تسعه مدة المرحلة).
const MIN_GAP_DAYS = { coaching: 3, workshop: 1 };       // أقل فاصل معقول بين جلستين
const MINUTES_RANGE = { coaching: [15, 120], meeting: [10, 120] };
export function unknownTokens(text, reqs) {
  const codes = new Set((reqs || []).map((r) => r.code));
  return [...String(text || '').matchAll(/\{(?:sessions|minutes|days):([A-Z0-9-]+)\}/g)].map((m) => m[1]).filter((c) => !codes.has(c));
}
// شاشة كل مرحلة قبول تُكمل متطلبها وحده (انظر leaders-app/src/gates.js)
const ONBOARDING_GATE = { profile: 'P-INFO', assessment: 'A-DONE' };

export function journeyCoherence(stages, requirements) {
  const out = [];
  const reqs = (requirements || []).filter((r) => r.active !== false);
  for (const s of (stages || []).filter((x) => x.active !== false)) {
    const days = Number(s.duration_days) || 0;
    for (const f of STAGE_TEXT) {
      for (const c of unknownTokens(s[f], reqs)) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: الرمز يشير إلى نشاط غير موجود (${c})` });
      if (/\{duration\}/.test(s[f] || '') && !days) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: {duration} بلا مدة بالأيام` });
    }
    for (const r of reqs.filter((x) => x.stage_key === s.key)) {
      const c = r.config || {};
      const n = Number(c.sessions_required) || 0;
      const gap = MIN_GAP_DAYS[r.kind];
      if (gap && n > 1 && days && n > Math.ceil(days / gap)) {
        out.push({ level: 'warn', stage: s.key, req: r.code, msg: `${r.code}: ${sessionsAr(n)} في ${durationAr(days)} أكثر مما تسعه المرحلة (جلسة كل ${gap === 1 ? 'يوم' : `${gap} أيام`} على الأقل)` });
      }
      const range = MINUTES_RANGE[r.kind];
      if (range && c.minutes && (c.minutes < range[0] || c.minutes > range[1])) {
        out.push({ level: 'warn', stage: s.key, req: r.code, msg: `${r.code}: مدة الجلسة ${minutesAr(c.minutes)} خارج المعتاد (${range[0]} إلى ${range[1]} دقيقة)` });
      }
      for (const code of [...unknownTokens(r.title_ar, reqs), ...unknownTokens(r.help_ar, reqs)]) out.push({ level: 'error', stage: s.key, req: r.code, msg: `${r.code}: الرمز يشير إلى نشاط غير موجود (${code})` });
    }
    // مرحلتا القبول تُكملهما شاشتان مخصصتان؛ متطلب إلزامي آخر فيهما يُكمَل من الرحلة بعدهما لا من الشاشة
    if (ONBOARDING_GATE[s.key]) {
      for (const r of reqs.filter((x) => x.stage_key === s.key && x.required !== false && x.code !== ONBOARDING_GATE[s.key])) {
        out.push({ level: 'warn', stage: s.key, req: r.code, msg: `${r.code}: متطلب إلزامي في «${s.title_ar}» لا تُكمله شاشة ${s.key === 'profile' ? 'الملف' : 'القياس'}؛ يظهر للمشارك في رحلته بعدها، فاجعله في المرحلة التالية أو اختياريًا إن كان يمنع اكتمال المرحلة` });
      }
    }
  }
  // قواعد الفتح والاكتمال (تُعرَّف أسفل الملف وتُستدعى وقت التشغيل)
  return [...out, ...stageRulesIssues(stages)];
}

// ════════════════════════════════════════════════════════════════
// ساعات البرنامج: من الأنشطة نفسها، فلا تُكتب على الشهادة رقمًا منفصلًا
// ════════════════════════════════════════════════════════════════
// تُجمع الأنشطة الحضورية المطلوبة من المشارك: الورش والجلسات واللقاءات (عدد × مدة).
// نشاط بلا مدة معلنة لا يُخمَّن: يُعاد في missing ليكمله المحرر.
const TIMED_KINDS = new Set(['workshop', 'coaching', 'meeting']);
export function programHours(requirements, levels = null) {
  let minutes = 0;
  const missing = [];
  for (const r of requirements || []) {
    if (!TIMED_KINDS.has(r.kind) || r.required === false || (levels && !requirementApplies(r, levels))) continue;
    if (r.active === false) continue;
    const c = r.config || {};
    if (!c.minutes) { missing.push(r.code); continue; }
    minutes += (r.kind === 'meeting' ? 1 : Math.max(1, Number(c.sessions_required) || 1)) * Number(c.minutes);
  }
  return { hours: Math.round(minutes / 60), minutes, missing };
}

// ════════════════════════════════════════════════════════════════
// محرك قواعد المراحل: النوع، وشرط الفتح، وشرط الاكتمال، لكل مرحلة
// ════════════════════════════════════════════════════════════════
// يضبطها الأدمن في journey_stages.rules. الفارغ يعني السلوك الأصلي حرفيًا:
// إلزامية، تُفتح بعد اكتمال الإلزامية قبلها، وتكتمل بمتطلباتها الإلزامية.
// تدخل الأدمن لمشارك بعينه (فتح، اعتماد اكتمال، إعفاء) يأتي من overrides.
const MODES = ['required', 'on_demand', 'optional'];
const UNLOCKS = ['previous', 'always', 'stages', 'day', 'approval'];
const COMPLETES = ['required', 'any', 'approval'];

// القواعد كما تُقرأ: كل مفتاح بقيمته الافتراضية إن غاب
export function stageRules(stage) {
  const r = stage?.rules && typeof stage.rules === 'object' ? stage.rules : {};
  return {
    mode: MODES.includes(r.mode) ? r.mode : 'required',
    unlock: UNLOCKS.includes(r.unlock) ? r.unlock : 'previous',
    after: Array.isArray(r.after) ? r.after.map(String) : [],
    day: Number.isFinite(Number(r.day)) && r.day !== null && r.day !== '' ? Math.max(0, Math.round(Number(r.day))) : null,
    complete: COMPLETES.includes(r.complete) ? r.complete : 'required',
  };
}

// القواعد كما تُحفظ: تُرفض القيم المجهولة، ويُحذف ما يساوي الافتراضي فيبقى الفارغ فارغًا
/** @param {any} raw @param {string[]} stageKeys @param {string} [selfKey] */
export function cleanStageRules(raw, stageKeys, selfKey) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (r.mode != null && r.mode !== '') {
    if (!MODES.includes(r.mode)) throw new Error('نوع المرحلة غير معروف');
    if (r.mode !== 'required') out.mode = r.mode;
  }
  if (r.unlock != null && r.unlock !== '') {
    if (!UNLOCKS.includes(r.unlock)) throw new Error('شرط الفتح غير معروف');
    if (r.unlock !== 'previous') out.unlock = r.unlock;
  }
  if (out.unlock === 'stages') {
    const keys = new Set(stageKeys || []);
    const after = [...new Set((Array.isArray(r.after) ? r.after : []).map(String))];
    if (!after.length) throw new Error('اختر المرحلة أو المراحل التي تُفتح هذه بعد اكتمالها');
    const bad = after.find((k) => !keys.has(k) || k === selfKey);
    if (bad) throw new Error(bad === selfKey ? 'المرحلة لا تشترط نفسها' : `مرحلة غير موجودة في البرنامج: ${bad}`);
    out.after = after;
  }
  if (out.unlock === 'day') {
    const d = Number(r.day);
    if (!Number.isFinite(d) || d < 0 || d > 3650) throw new Error('عدد الأيام من بداية الدفعة بين 0 و3650');
    out.day = Math.round(d);
  }
  if (r.complete != null && r.complete !== '') {
    if (!COMPLETES.includes(r.complete)) throw new Error('شرط الاكتمال غير معروف');
    if (r.complete !== 'required') out.complete = r.complete;
  }
  return out;
}

// فحص الرحلة كلها: حلقات في شروط الفتح، ومراجع لمراحل مخفية أو محذوفة،
// ومراحل لا يصلها أحد. error يمنع النشر، وwarn ينبّه.
export function stageRulesIssues(stages) {
  const out = [];
  const all = stages || [];
  const live = all.filter((s) => s.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const byKey = new Map(all.map((s) => [s.key, s]));
  const title = (k) => byKey.get(k)?.title_ar || k;
  const deps = new Map(live.map((s, i) => {
    const r = stageRules(s);
    if (r.unlock === 'stages') return [s.key, r.after];
    if (r.unlock === 'previous') return [s.key, live.slice(0, i).filter((x) => stageRules(x).mode === 'required').map((x) => x.key)];
    return [s.key, []];
  }));
  for (const s of live) {
    const r = stageRules(s);
    for (const k of r.unlock === 'stages' ? r.after : []) {
      if (!byKey.has(k)) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: تُفتح بعد مرحلة غير موجودة (${k})` });
      else if (byKey.get(k).active === false) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: تُفتح بعد «${title(k)}» وهي مخفية، فلن تُفتح أبدًا` });
    }
    if (r.unlock === 'stages' && !r.after.length) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: شرط الفتح «بعد مراحل» بلا مراحل محددة` });
    if (r.unlock === 'day' && r.day == null) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: شرط الفتح بالأيام بلا عدد أيام` });
    if (r.unlock === 'approval') out.push({ level: 'warn', stage: s.key, msg: `«${s.title_ar}»: لا تُفتح إلا بيد الأدمن أو الخبير لكل مشارك` });
    if (r.complete === 'approval' && r.mode === 'required') out.push({ level: 'warn', stage: s.key, msg: `«${s.title_ar}»: إلزامية لا تكتمل إلا باعتماد يدوي، وما بعدها ينتظر هذا الاعتماد` });
  }
  // حلقة: مرحلة تنتظر (مباشرة أو عبر غيرها) مرحلة تنتظرها
  const seen = new Set(), stack = new Set();
  const visit = (k, path) => {
    if (stack.has(k)) { out.push({ level: 'error', stage: k, msg: `حلقة في شروط الفتح: ${[...path, k].map(title).join(' ← ')}` }); return true; }
    if (seen.has(k)) return false;
    seen.add(k); stack.add(k);
    for (const d of deps.get(k) || []) if (deps.has(d) && visit(d, [...path, k])) { stack.delete(k); return true; }
    stack.delete(k);
    return false;
  };
  for (const s of live) visit(s.key, []);
  return out;
}

// القاعدة بجملة يقرؤها الأدمن على بطاقة المرحلة
export function stageRuleSummary(stage, stages = []) {
  const r = stageRules(stage);
  const title = (k) => stages.find((s) => s.key === k)?.title_ar || k;
  const mode = { required: 'إلزامية', on_demand: 'عند الطلب', optional: 'اختيارية مقترحة' }[r.mode];
  const unlock = {
    previous: 'تُفتح بعد اكتمال الإلزامية قبلها',
    always: 'متاحة من البداية',
    stages: `تُفتح بعد اكتمال: ${r.after.map(title).join('، ')}`,
    day: r.day === 0 ? 'تُفتح مع بداية الدفعة' : `تُفتح بعد ${r.day ?? '؟'} يومًا من بداية الدفعة`,
    approval: 'يفتحها الأدمن أو الخبير',
  }[r.unlock];
  const complete = { required: 'تكتمل بمتطلباتها الإلزامية', any: 'تكتمل بأي متطلب فيها', approval: 'تكتمل باعتماد الأدمن أو الخبير' }[r.complete];
  return `${mode} · ${unlock} · ${complete}`;
}

const DAY_MS = 86400000;
// حالة كل مرحلة بعد حساب متطلباتها. stages مرتبة، ولكل منها items محسوبة.
// ctx: { overrides: { [stage_key]: 'open'|'complete'|'skip' }, cohortStart: 'YYYY-MM-DD'|null, today: Date|string }
export function resolveStages(stages, { overrides = {}, cohortStart = null, today = new Date() } = {}) {
  const now = new Date(today).getTime();
  const start = cohortStart ? new Date(`${cohortStart}T00:00:00Z`).getTime() : null;
  const done = new Map();
  const out = [];
  const title = (k) => stages.find((s) => s.key === k)?.title_ar || k;
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const r = stageRules(s);
    const ov = overrides[s.key] || null;
    const required = s.items.filter((x) => x.required);
    const byItems = r.complete === 'any' ? s.items.some((x) => x.status === 'done')
      : r.complete === 'approval' ? false
        : required.length > 0 && required.every((x) => x.status === 'done');
    const before = stages.slice(0, i).filter((x) => stageRules(x).mode === 'required');
    let unlocked, waits = [];
    if (ov === 'open') unlocked = true;
    else if (r.unlock === 'always') unlocked = true;
    else if (r.unlock === 'approval') unlocked = false;
    else if (r.unlock === 'stages') { waits = r.after.filter((k) => !done.get(k)); unlocked = !waits.length; }
    else if (r.unlock === 'day' && start != null && r.day != null) unlocked = now >= start + r.day * DAY_MS;
    else { waits = before.filter((x) => !done.get(x.key)).map((x) => x.key); unlocked = !waits.length; }
    let status;
    // المقفلة تبقى مقفلة ولو اكتملت متطلباتها (كالسلوك الأصلي)، إلا بتدخل الأدمن
    if (ov === 'complete' || ov === 'skip') status = 'done';
    else if (!unlocked) status = 'locked';
    else if (byItems) status = 'done';
    else status = r.mode === 'required' ? 'active' : 'available';
    done.set(s.key, status === 'done');
    let lock_reason = null;
    if (status === 'locked') {
      if (r.unlock === 'approval') lock_reason = 'تُفتح حين يفتحها لك فريق البرنامج';
      else if (r.unlock === 'day' && start != null && r.day != null) lock_reason = `تُفتح في ${new Date(start + r.day * DAY_MS).toISOString().slice(0, 10)}`;
      else if (waits.length) lock_reason = `تُفتح بعد اكتمال: ${waits.map(title).join('، ')}`;
    }
    out.push({ ...s, status, mode: s.mode, stage_mode: r.mode, lock_reason, override: ov, skipped: ov === 'skip' });
  }
  return out;
}
