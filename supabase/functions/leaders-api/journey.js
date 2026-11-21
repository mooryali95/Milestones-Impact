// ════════════════════════════════════════════════════════════════
// الرحلة من إعداداتها: نصوص تُملأ من مصدرها، وفحص اتساق، وساعات البرنامج
// ════════════════════════════════════════════════════════════════
// منفصلة عن logic.js لحجمها؛ تُصدَّر منه أيضًا فلا يتغير أي استيراد قائم.
import { requirementApplies, SESSION_DEFAULTS } from './logic.js';
import { PHASE_AR } from './labels.js';
import { plainInt } from './digits.js';
import { countedDef, countedItems } from './optional.js';

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
// بعد حرف جر («بعد يومين»): المثنى مجرور، والمجهول «؟ يومًا»
const afterDaysAr = (n) => (n == null ? '؟ يومًا' : n === 2 ? 'يومين' : daysAr(n));
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
      for (const r of reqs.filter((x) => x.stage_key === s.key && countedDef(x) && x.code !== ONBOARDING_GATE[s.key])) {
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
    if (!TIMED_KINDS.has(r.kind) || !countedDef(r) || (levels && !requirementApplies(r, levels))) continue;
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
// with: تبدأ مع مرحلة قبلها في الترتيب (rules.with)، فتُفتح حين تُفتح مرجعها وتسير معها (المراحل المتوازية P1)
const UNLOCKS = ['previous', 'with', 'always', 'stages', 'day', 'approval'];
const COMPLETES = ['required', 'any', 'approval'];
// طبيعة عنصر الرحلة (T1، تصور 2026-11-18 ب5): «مرحلة» متتابعة (الافتراضي)، و«مسار مستمر» يسير بجانب السلسلة فلا يأخذ منها
// أيامًا ولا يقفل ما بعدها إلا المرحلة المسماة في due_before، و«خدمة» (T2، ب5.2) يطلبها من يريد: لا أيام لها في السلسلة ولا تقفل
// شيئًا ولا تُحسب في التقدم ولا يُشترط اكتمالها، وتبقى في الرحلة بحقل lane فيجدها الحجز وفتح الجلسات
export const LANES = Object.freeze(['stage', 'track', 'service']);
export const LANE_AR = Object.freeze({ stage: 'مرحلة متتابعة', track: 'مسار مستمر', service: 'خدمة' });
// نهاية المسار (until): نهاية الرحلة (الافتراضي: نهاية الدفعة في ملفها، وإلا نهاية السلسلة)، أو مدته بالأيام، أو نهاية طور، أو نهاية مرحلة
export const TRACK_UNTIL_DEFAULT = 'journey_end';
export const TRACK_DUE_DEFAULT = 'report';
// بوابات القبول (عليها يُبنى فتح ما بعدها) لا تصير مسارًا، والمصدر الواحد لـPLAN_GATE_STAGES في cohort-plan.js
export const GATE_STAGE_KEYS = Object.freeze(['profile', 'assessment', 'approval']);
/** قيمة until إن صلحت بصيغتها، وإلا null: 'journey_end' | 'days' | 'phase:<المحور>' | 'stage:<المفتاح>' @param {any} v */
export function untilOf(v) {
  const t = v == null ? '' : String(v).trim();
  if (t === 'journey_end' || t === 'days') return t;
  const m = /^(phase|stage):([A-Za-z0-9_-]+)$/.exec(t);
  if (!m) return null;
  if (m[1] === 'phase' && !PHASE_AR[m[2]]) return null;
  return t;
}
// أخطاء القواعد التي تمنع الحفظ والنشر والترتيب (withGuard وversionBlock): «تبدأ مع»، وطبيعة المسار، وما يشترطه المسار
export const BLOCKING_RULES = Object.freeze(['with', 'lane', 'due_before']);
export const isTrack = (s) => stageRules(s).lane === 'track';
/** هل المرحلة خدمة (T2) @param {any} s */
export const isService = (s) => stageRules(s).lane === 'service';
// إتاحة الخدمة الموصى بها (ب5.2): من بعد اعتماد المستوى. لا unlock:'approval'، فتلك «لا تُفتح إلا بيد الأدمن أو الخبير لكل مشارك»
export const SERVICE_UNLOCK_DEFAULT = Object.freeze({ unlock: 'stages', after: Object.freeze(['approval']) });
// والقياس البعدي لا يوضع في خدمة: الخدمة لمن يريد، وعليه يُبنى التقييم والتقرير
export const POST_IN_SERVICE_AR = 'لا يوضع القياس البعدي في خدمة: الخدمة لمن يريد، وعليه يُبنى التقييم والتقرير';
/** أول خدمة فيها متطلب E-POST فعّال، أو null @param {any[]} stages @param {any[]} requirements */
export function postInService(stages, requirements) {
  const services = new Set((stages || []).filter((s) => s && s.active !== false && isService(s)).map((s) => s.key));
  const r = (requirements || []).find((x) => x && x.code === 'E-POST' && x.active !== false && services.has(x.stage_key));
  return r ? r.stage_key : null;
}
// القياس البعدي (E-POST) لا يوضع في مسار مستمر (ب5.1 الحراس): عليه يُبنى التقييم والتقرير، فلا يسير بجانب الرحلة.
// يقرؤه حفظ قاعدة المرحلة وحفظ المتطلب وحفظ النسخة، فلا يصل إليه أي ترتيب للخطوات
export const POST_IN_TRACK_AR = 'لا يوضع القياس البعدي في مسار مستمر: عليه يُبنى التقييم والتقرير';
/** أول مسار مستمر فيه متطلب E-POST فعّال، أو null @param {any[]} stages @param {any[]} requirements */
export function postInTrack(stages, requirements) {
  const tracks = new Set((stages || []).filter((s) => s && s.active !== false && isTrack(s)).map((s) => s.key));
  const r = (requirements || []).find((x) => x && x.code === 'E-POST' && x.active !== false && tracks.has(x.stage_key));
  return r ? r.stage_key : null;
}

// القواعد كما تُقرأ: كل مفتاح بقيمته الافتراضية إن غاب
export function stageRules(stage) {
  const r = stage?.rules && typeof stage.rules === 'object' ? stage.rules : {};
  return {
    // الخدمة (T2) لمن يريد، فلا تكون إلزامية أبدًا: «عند الحاجة» أو «اختيارية» بنمطها
    mode: r.lane === 'service' ? (r.mode === 'optional' ? 'optional' : 'on_demand') : MODES.includes(r.mode) ? r.mode : 'required',
    unlock: UNLOCKS.includes(r.unlock) ? r.unlock : 'previous',
    after: Array.isArray(r.after) ? r.after.map(String) : [],
    with: r.with != null && r.with !== '' ? String(r.with) : null,
    day: Number.isFinite(Number(r.day)) && r.day !== null && r.day !== '' ? Math.max(0, Math.round(Number(r.day))) : null,
    // الإزاحة (R3a في تصور محرر رحلة الدفعة): «تسير مع» مرجعها وتُخطَّط بعد N يومًا من بدايته. تخطيط للتواريخ وحدها،
    // والفتح يبقى مع بداية المرجع (القرار 6)، فلا يقرؤها resolveStages
    offset: r.unlock === 'with' && Number.isInteger(Number(r.offset)) && Number(r.offset) > 0 && r.offset !== true ? Number(r.offset) : 0,
    complete: COMPLETES.includes(r.complete) ? r.complete : 'required',
    ...laneOf(r),
  };
}
// الطبيعة وحقولها: المرحلة المتتابعة بلا حقول جديدة، فشكل القواعد لبرنامج بلا مسار لا يتغير حرفًا
function laneOf(r) {
  const lane = LANES.includes(r.lane) ? r.lane : 'stage';
  if (lane !== 'track') return lane === 'stage' ? {} : { lane };
  return {
    lane, until: untilOf(r.until) || TRACK_UNTIL_DEFAULT,
    due_before: r.due_before != null && r.due_before !== '' ? String(r.due_before) : TRACK_DUE_DEFAULT,
  };
}
const laneKey = (s) => stageRules(s).lane || 'stage';

// «تبدأ مع» تصنع مجموعة متجاورة: المرجع ومن يسير معه متتاليان في الترتيب ومن محور واحد.
// بذلك يتفق الفتح (resolveStages) والنوافذ (stageWindows) والتوزيع (distributeSchedule) والخط الزمني على شكل واحد:
// المجموعة تبدأ معًا، وما بعدها يبدأ بعد أطولها. مرحلة غريبة بين المرجع وتابعه تُرسم بعد المجموعة وتسري قبل نهايتها.
const phaseOf = (s) => (s?.phase && PHASE_AR[s.phase] ? s.phase : 'qualification');
export const stagePhase = phaseOf;
// أول المجموعة: يتبع سلسلة «تبدأ مع» إلى مرحلة لا تبدأ مع غيرها (live مرتبة وظاهرة)
function withRoot(live, key) {
  const byKey = new Map(live.map((s) => [s.key, s]));
  const seen = new Set();
  let k = key;
  for (;;) {
    const s = byKey.get(k);
    if (!s || seen.has(k)) return k;
    seen.add(k);
    const r = stageRules(s);
    if (r.unlock !== 'with' || !r.with || !byKey.has(r.with)) return k;
    k = r.with;
  }
}
// سبب رفض مرجع قبل المرحلة في الترتيب، أو null: محور مختلف، أو مرحلة بينهما لا تسير معهما
export function withPlacementIssue(live, self, refKey) {
  const idx = live.findIndex((x) => x.key === self.key);
  const at = live.findIndex((x) => x.key === refKey);
  if (idx < 0 || at < 0 || at >= idx) return null;
  const ref = live[at];
  // المسار المستمر (T1) يبدأ مع أي مرحلة سابقة من أي طور، ولا يدخل مجموعة «تسير معًا»، فلا قيد محور ولا مجاورة عليه
  // والخدمة (T2) خارج السلسلة: لا تدخل مجموعة ولا تُرسم في خانة
  if (laneKey(self) === 'track' || laneKey(self) === 'service') return null;
  if (laneKey(ref) === 'track') return `«${ref.title_ar || ref.key}» مسار مستمر، فلا تبدأ معه مرحلة متتابعة`;
  if (laneKey(ref) === 'service') return `«${ref.title_ar || ref.key}» خدمة لمن يريد، فلا تبدأ معها مرحلة`;
  if (phaseOf(ref) !== phaseOf(self)) {
    return `تبدأ مع «${ref.title_ar || ref.key}» وهي في محور «${PHASE_AR[phaseOf(ref)]}» وهذه في «${PHASE_AR[phaseOf(self)]}»، والمراحل التي تسير معًا من محور واحد`;
  }
  const root = withRoot(live, refKey);
  // المسار المستمر بين المرجع وتابعه لا يفصلهما: يسير بجانب السلسلة لا فيها
  const odd = live.slice(at + 1, idx).find((x) => laneKey(x) !== 'track' && laneKey(x) !== 'service' && !(stageRules(x).unlock === 'with' && withRoot(live, x.key) === root));
  if (odd) return `تبدأ مع «${ref.title_ar || ref.key}» وبينهما «${odd.title_ar || odd.key}» لا تسير معهما؛ رتّب «${odd.title_ar || odd.key}» بعد المجموعة أو اختر مرجعًا يليها مباشرة`;
  return null;
}
// المراجع المقبولة لمرحلة: ظاهرة قبلها في الترتيب، ومن محورها، ولا يفصلها عنها إلا من يسير معها.
// المصدر الواحد لقائمة المحرر (withOptions) وللفحص على الخادم (stageRulesIssues)
export function withCandidates(stages, selfKey) {
  const all = stages || [];
  const self = all.find((s) => s.key === selfKey);
  const live = all.filter((s) => s.active !== false || s.key === selfKey).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  if (!self) return live.filter((s) => s.active !== false);
  const idx = live.indexOf(self);
  return live.slice(0, idx).filter((s) => s.active !== false && laneKey(s) !== 'track' && laneKey(s) !== 'service' && !withPlacementIssue(live, self, s.key));
}

// القواعد كما تُحفظ: تُرفض القيم المجهولة، ويُحذف ما يساوي الافتراضي فيبقى الفارغ فارغًا.
// stageKeys: مفاتيح مراحل البرنامج، أو المراحل نفسها ({ key, title_ar, sort, active }) ليُفحص مرجع «تبدأ مع»
// بترتيبه وظهوره. بالمفاتيح وحدها يُفحص الوجود فقط، ويكمل stageRulesIssues الباقي.
/** @param {any} raw @param {Array<string | { key: string, title_ar?: string, sort?: number, active?: boolean, duration_days?: number|null }>} stageKeys @param {string} [selfKey] */
export function cleanStageRules(raw, stageKeys, selfKey) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const list = (stageKeys || []).map((x) => (x && typeof x === 'object' ? x : { key: String(x) }));
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
    const keys = new Set(list.map((x) => x.key));
    const after = [...new Set((Array.isArray(r.after) ? r.after : []).map(String))];
    if (!after.length) throw new Error('اختر المرحلة أو المراحل التي تُفتح هذه بعد اكتمالها');
    const bad = after.find((k) => !keys.has(k) || k === selfKey);
    if (bad) throw new Error(bad === selfKey ? 'المرحلة لا تشترط نفسها' : `مرحلة غير موجودة في البرنامج: ${bad}`);
    // الخدمة (T2) لمن يريد، فلا يُشترط اكتمالها لفتح غيرها
    const svc = list.find((x) => after.includes(x.key) && x.rules && laneKey(x) === 'service');
    if (svc) throw new Error(`«${svc.title_ar || svc.key}» خدمة لمن يريد، فلا يُشترط اكتمالها لفتح مرحلة`);
    out.after = after;
  }
  // الطبيعة (T1): المسار المستمر يبدأ مع مرحلة سابقة من أي طور بإزاحة بلا سقف، وينتهي بـuntil، وتُشترط بنوده الإلزامية
  // قبل المرحلة المسماة في due_before وحدها. «مرحلة» هي الافتراضي فلا تُحفظ، و«الخدمة» في الخطوة التالية (T2)
  const lane = r.lane != null && r.lane !== '' ? String(r.lane) : 'stage';
  if (!LANES.includes(lane)) throw new Error('طبيعة المرحلة غير معروفة');
  const track = lane === 'track';
  // الخدمة (T2، ب5.2): يطلبها من يريد، فلا تكون بوابة قبول ولا «تبدأ مع» غيرها. إتاحتها الموصى بها من بعد اعتماد المستوى
  // (SERVICE_UNLOCK_DEFAULT)، ونمطها «عند الحاجة» إلا «اختيارية» صراحة
  const service = lane === 'service';
  if (service) {
    if (selfKey && GATE_STAGE_KEYS.includes(selfKey)) throw new Error('بوابات القبول (الملف وتحديد المستوى واعتماده) لا تصير خدمة: عليها يُبنى فتح ما بعدها');
    if (out.unlock === 'with') throw new Error('الخدمة لا تبدأ مع مرحلة: تُتاح بشرط فتح (بعد اعتماد المستوى مثلًا) حتى نهاية الرحلة');
    out.mode = out.mode === 'optional' ? 'optional' : 'on_demand';
  }
  if (track) {
    if (selfKey && GATE_STAGE_KEYS.includes(selfKey)) throw new Error('بوابات القبول (الملف وتحديد المستوى واعتماده) لا تصير مسارًا مستمرًا: عليها يُبنى فتح ما بعدها');
    if (out.unlock !== 'with') throw new Error('المسار المستمر يبدأ مع مرحلة قبله: اختر «تبدأ مع» ثم المرحلة');
  }
  if (out.unlock === 'with') {
    const k = r.with != null && r.with !== '' ? String(r.with) : '';
    if (!k) throw new Error('اختر المرحلة التي تبدأ هذه معها');
    if (k === selfKey) throw new Error('المرحلة لا تبدأ مع نفسها');
    const target = list.find((x) => x.key === k);
    if (!target) throw new Error(`مرحلة غير موجودة في البرنامج: ${k}`);
    const name = target.title_ar || k;
    if (target.active === false) throw new Error(`«${name}» مخفية، فلا تبدأ معها مرحلة`);
    const self = list.find((x) => x.key === selfKey);
    if (self && Number.isFinite(Number(self.sort)) && Number.isFinite(Number(target.sort)) && Number(target.sort) >= Number(self.sort)) {
      throw new Error(`«${name}» بعد هذه المرحلة في الترتيب؛ اختر مرحلة قبلها، أو رتّب المراحل أولًا`);
    }
    if (target.rules && laneKey(target) === 'track') throw new Error(`«${name}» مسار مستمر، فلا تبدأ معه مرحلة. اختر مرحلة متتابعة`);
    if (target.rules && laneKey(target) === 'service') throw new Error(`«${name}» خدمة لمن يريد، فلا تبدأ معها مرحلة. اختر مرحلة متتابعة`);
    out.with = k;
    // الإزاحة (R3a): تُخطَّط بعد N يومًا من بداية مرجعها، من 0 إلى مدته (البند 4.6). صفر هو الافتراضي فلا يُحفظ
    if (r.offset != null && r.offset !== '') {
      const n = plainInt(r.offset);
      if (!Number.isInteger(n) || n < 0 || n > 365) throw new Error('الإزاحة عدد أيام صحيح من 0 إلى 365');
      // المسار المستمر يبدأ بعد مرجعه بأي عدد أيام (يوم بعد التدريب مثلًا)، فلا سقف بمدة المرجع
      const cap = !track && target.duration_days != null && target.duration_days !== '' ? Math.max(0, Math.round(Number(target.duration_days) || 0)) : null;
      if (cap != null && n > cap) throw new Error(`الإزاحة من 0 إلى مدة «${name}» (${daysAr(cap)})`);
      if (n > 0) out.offset = n;
    }
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
  if (track) {
    out.lane = 'track';
    const raw = r.until != null && r.until !== '' ? String(r.until) : TRACK_UNTIL_DEFAULT;
    const until = untilOf(raw);
    if (!until) throw new Error('نهاية المسار: نهاية الرحلة، أو مدته بالأيام، أو نهاية طور، أو نهاية مرحلة');
    if (until.startsWith('stage:')) {
      const k = until.slice(6);
      const t = list.find((x) => x.key === k);
      if (!t || k === selfKey) throw new Error(k === selfKey ? 'المسار لا ينتهي بنهايته هو؛ اختر «مدته بالأيام»' : `مرحلة غير موجودة في البرنامج: ${k}`);
      if (t.rules && laneKey(t) === 'track') throw new Error(`«${t.title_ar || k}» مسار مستمر آخر؛ ينتهي المسار بنهاية مرحلة متتابعة`);
      if (t.rules && laneKey(t) === 'service') throw new Error(`«${t.title_ar || k}» خدمة بلا نهاية في الرحلة؛ ينتهي المسار بنهاية مرحلة متتابعة`);
    }
    out.until = until;
    // ما يشترط بنوده الإلزامية: «التقرير النهائي» افتراضيًا إن كان في البرنامج، أو مرحلة متتابعة تسميها
    const keys = new Set(list.map((x) => x.key));
    const due = r.due_before != null && r.due_before !== '' ? String(r.due_before) : (keys.has(TRACK_DUE_DEFAULT) ? TRACK_DUE_DEFAULT : '');
    if (due) {
      if (due === selfKey) throw new Error('المسار لا يشترط نفسه؛ اختر المرحلة التي تنتظر بنوده الإلزامية');
      const t = list.find((x) => x.key === due);
      if (!t) throw new Error(`مرحلة غير موجودة في البرنامج: ${due}`);
      if (t.rules && laneKey(t) === 'track') throw new Error(`«${t.title_ar || due}» مسار مستمر؛ تُشترط بنود المسار قبل مرحلة متتابعة`);
      if (t.rules && laneKey(t) === 'service') throw new Error(`«${t.title_ar || due}» خدمة لمن يريد؛ تُشترط بنود المسار قبل مرحلة متتابعة`);
      if (GATE_STAGE_KEYS.includes(due)) throw new Error(`«${t.title_ar || due}» من بوابات القبول، فلا تنتظر مسارًا يبدأ بعدها`);
      out.due_before = due;
    }
  }
  if (service) out.lane = 'service';
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
  // المسار المستمر (T1) لا يدخل في «بعد الإلزامية قبلها»، والمرحلة المسماة في due_before تنتظر بنوده الإلزامية
  const tracks = live.filter((s) => laneKey(s) === 'track');
  const dueOf = (k) => tracks.filter((t) => stageRules(t).due_before === k).map((t) => t.key);
  const deps = new Map(live.map((s, i) => {
    const r = stageRules(s);
    const due = tracks.length ? dueOf(s.key) : [];
    if (r.unlock === 'stages') return [s.key, [...r.after, ...due]];
    if (r.unlock === 'with') return [s.key, [...(r.with ? [r.with] : []), ...due]];
    if (r.unlock === 'previous') return [s.key, [...live.slice(0, i).filter((x) => stageRules(x).mode === 'required' && laneKey(x) !== 'track').map((x) => x.key), ...due]];
    return [s.key, due];
  }));
  for (const s of live) {
    const r = stageRules(s);
    for (const k of r.unlock === 'stages' ? r.after : []) {
      if (!byKey.has(k)) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: تُفتح بعد مرحلة غير موجودة (${k})` });
      else if (byKey.get(k).active === false) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: تُفتح بعد «${title(k)}» وهي مخفية، فلن تُفتح أبدًا` });
    }
    // «تبدأ مع»: المرجع موجود وظاهر وقبلها في الترتيب ومجاور لها في محورها. يرفضه الخادم عند حفظ القواعد، وعند الترتيب بالأسهم
    // وإخفاء المرحلة وحذفها (admin.ts: withGuard)، وعند النشر، لأن resolveStages يمر بالترتيب مرة واحدة فتبقى مقفلة إلى الأبد
    if (r.unlock === 'with') {
      const k = r.with;
      const idx = live.indexOf(s);
      const at = live.findIndex((x) => x.key === k);
      const issue = (msg) => out.push({ level: 'error', stage: s.key, rule: 'with', msg: `«${s.title_ar}»: ${msg}` });
      if (!k) issue('شرط الفتح «تبدأ مع» بلا مرحلة محددة');
      else if (k === s.key) issue('تبدأ مع نفسها، فلن تُفتح أبدًا');
      else if (!byKey.has(k)) issue(`تبدأ مع مرحلة غير موجودة (${k})`);
      else if (byKey.get(k).active === false) issue(`تبدأ مع «${title(k)}» وهي مخفية، فلن تُفتح أبدًا`);
      else if (at > idx) issue(`تبدأ مع «${title(k)}» وهي بعدها في الترتيب، فلن تُفتح أبدًا. رتّب «${title(k)}» قبلها أو غيّر المرجع`);
      else {
        const why = withPlacementIssue(live, s, k);
        if (why) issue(why);
        // الإزاحة أكبر من مدة المرجع (مدته قصرت بعد ضبطها): تنبيه لا منع، وخطة الدفعة تحصرها في مدته (cohortPlan)
        const cap = Math.max(0, Math.round(Number(byKey.get(k).duration_days) || 0));
        if (r.offset > cap && r.lane !== 'track') out.push({ level: 'warn', stage: s.key, rule: 'offset', msg: `«${s.title_ar}»: تُخطَّط بعد ${daysAr(r.offset)} من بداية «${title(k)}» ومدتها ${cap ? daysAr(cap) : 'صفر'}، فتُحصر الإزاحة في مدتها` });
      }
    }
    if (r.lane === 'track') {
      const lane = (msg, level = 'error', rule = 'lane') => out.push({ level, stage: s.key, rule, msg: `«${s.title_ar}»: ${msg}` });
      if (GATE_STAGE_KEYS.includes(s.key)) lane('من بوابات القبول، فلا تكون مسارًا مستمرًا');
      if (r.unlock !== 'with') lane('مسار مستمر بلا مرحلة يبدأ معها؛ اختر «تبدأ مع»');
      const due = r.due_before;
      if (due === s.key) lane('مسار يشترط نفسه', 'error', 'due_before');
      else if (byKey.has(due) && byKey.get(due).active === false) lane(`تُشترط بنوده قبل «${title(due)}» وهي مخفية، فلا ينتظره أحد`, 'warn', 'due_before');
      else if (byKey.has(due) && laneKey(byKey.get(due)) === 'track') lane(`تُشترط بنوده قبل «${title(due)}» وهي مسار مستمر`, 'error', 'due_before');
      else if (byKey.has(due) && laneKey(byKey.get(due)) === 'service') lane(`تُشترط بنوده قبل «${title(due)}» وهي خدمة`, 'error', 'due_before');
      else if (!byKey.has(due) && due !== TRACK_DUE_DEFAULT) lane(`تُشترط بنوده قبل مرحلة غير موجودة (${due})`, 'error', 'due_before');
      if (r.until.startsWith('stage:') && !live.some((x) => x.key === r.until.slice(6))) lane(`ينتهي بنهاية مرحلة غير موجودة أو مخفية (${r.until.slice(6)})، فينتهي بنهاية الرحلة`, 'warn', 'until');
    }
    // الخدمة (T2): ليست بوابة قبول ولا تبدأ مع غيرها، ولا يُشترط اكتمالها لفتح مرحلة (وإلا صارت إلزامية بلا اسمها)
    if (r.lane === 'service') {
      const lane = (msg) => out.push({ level: 'error', stage: s.key, rule: 'lane', msg: `«${s.title_ar}»: ${msg}` });
      if (GATE_STAGE_KEYS.includes(s.key)) lane('من بوابات القبول، فلا تكون خدمة');
      if (r.unlock === 'with') lane('خدمة تبدأ مع مرحلة؛ اجعل إتاحتها بشرط فتح (بعد اعتماد المستوى مثلًا)');
    }
    if (r.unlock === 'stages') {
      const svc = r.after.find((k) => byKey.has(k) && laneKey(byKey.get(k)) === 'service');
      if (svc) out.push({ level: 'error', stage: s.key, rule: 'lane', msg: `«${s.title_ar}»: تُفتح بعد «${title(svc)}» وهي خدمة لمن يريد، فلا يُشترط اكتمالها` });
    }
    if (r.unlock === 'stages' && !r.after.length) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: شرط الفتح «بعد مراحل» بلا مراحل محددة` });
    if (r.unlock === 'day' && r.day == null) out.push({ level: 'error', stage: s.key, msg: `«${s.title_ar}»: شرط الفتح بالأيام بلا عدد أيام` });
    if (r.unlock === 'approval') out.push({ level: 'warn', stage: s.key, msg: `«${s.title_ar}»: لا تُفتح إلا بيد الأدمن أو الخبير لكل مشارك` });
    if (r.complete === 'approval' && r.mode === 'required') out.push({ level: 'warn', stage: s.key, msg: `«${s.title_ar}»: إلزامية لا تكتمل إلا باعتماد يدوي، وما بعدها ينتظر هذا الاعتماد` });
  }
  // حلقة: مرحلة تنتظر (مباشرة أو عبر غيرها) مرحلة تنتظرها
  const seen = new Set(), stack = new Set();
  const visit = (k, path) => {
    if (stack.has(k)) {
      // حلقة يصنعها شرط مسار مستمر (due_before) تمنع النشر والحفظ كخطأ «تبدأ مع»، فلا يُقفل أحد إلى الأبد
      const viaTrack = tracks.length && [...path, k].some((x) => tracks.some((t) => t.key === x));
      out.push({ level: 'error', stage: k, ...(viaTrack ? { rule: 'due_before' } : {}), msg: `حلقة في شروط الفتح: ${[...path, k].map(title).join(' ← ')}` });
      return true;
    }
    if (seen.has(k)) return false;
    seen.add(k); stack.add(k);
    for (const d of deps.get(k) || []) if (deps.has(d) && visit(d, [...path, k])) { stack.delete(k); return true; }
    stack.delete(k);
    return false;
  };
  for (const s of live) visit(s.key, []);
  return out;
}

// وسم نمط المرحلة غير الإلزامية: المصدر الواحد لملخص القاعدة هنا ولوسم الخط والبطاقة (journey-timeline.js)،
// و«عند الحاجة» هي كلمة المشارك نفسها («متاحة عند الحاجة»)
export const STAGE_TAG_AR = Object.freeze({ on_demand: 'عند الحاجة', optional: 'اختيارية' });
// الخدمة بجملة واحدة يقرؤها الأدمن في البطاقة والخط والنموذج
export const SERVICE_NOTE_AR = 'لا تأخذ من الرحلة أيامًا ولا تُحسب في التقدم ولا يُشترط اكتمالها';
/** إتاحة الخدمة بجملة: من متى تُتاح، وحتى نهاية الرحلة @param {any} stage @param {(k: string) => string} [title] */
export function serviceAvailAr(stage, title = (k) => k) {
  const r = stageRules(stage);
  const from = {
    previous: 'تُتاح بعد اكتمال الإلزامية قبلها', always: 'متاحة من بداية الرحلة',
    stages: `تُتاح بعد اكتمال ${r.after.map((k) => `«${title(k)}»`).join(' و')}`,
    with: 'تُتاح مع مرجعها', day: r.day === 0 ? 'تُتاح مع بداية الدفعة' : `تُتاح بعد ${afterDaysAr(r.day)} من بداية الدفعة`,
    approval: 'يتيحها الأدمن أو الخبير لكل مشارك',
  }[r.unlock];
  return `${from} حتى نهاية الرحلة`;
}
/** عدد الجلسات للمشارك بجملة: «حتى جلستين للمشارك» @param {number|null} n */
export function sessionsMaxAr(n) {
  if (!n) return '';
  return `حتى ${n === 1 ? 'جلسة واحدة' : n === 2 ? 'جلستين' : n <= 10 ? `${n} جلسات` : `${n} جلسة`} للمشارك`;
}

// القاعدة بجملة يقرؤها الأدمن على بطاقة المرحلة
export function stageRuleSummary(stage, stages = []) {
  const r = stageRules(stage);
  const title = (k) => stages.find((s) => s.key === k)?.title_ar || k;
  const mode = { required: 'إلزامية', on_demand: STAGE_TAG_AR.on_demand, optional: `${STAGE_TAG_AR.optional} مقترحة` }[r.mode];
  const unlock = {
    previous: 'تُفتح بعد اكتمال الإلزامية قبلها',
    always: 'متاحة من البداية',
    stages: `تُفتح بعد اكتمال: ${r.after.map(title).join('، ')}`,
    with: `تُفتح مع بداية «${r.with ? title(r.with) : '؟'}»${r.offset ? `، ومخطط بعد ${daysAr(r.offset)} من بدايتها` : ''}`,
    day: r.day === 0 ? 'تُفتح مع بداية الدفعة' : `تُفتح بعد ${afterDaysAr(r.day)} من بداية الدفعة`,
    approval: 'يفتحها الأدمن أو الخبير',
  }[r.unlock];
  const complete = { required: 'تكتمل بمتطلباتها الإلزامية', any: 'تكتمل بأي متطلب فيها', approval: 'تكتمل باعتماد الأدمن أو الخبير' }[r.complete];
  if (r.lane === 'track') return `${LANE_AR.track} · ${unlock} · ${untilAr(r.until, title)} · ${dueBeforeAr(r.due_before, stages)}`;
  // الخدمة (T2): إتاحتها، ثم أنها لا تأخذ من الرحلة أيامًا ولا تُحسب في التقدم
  if (r.lane === 'service') return `${LANE_AR.service} ${STAGE_TAG_AR[r.mode] || ''} · ${serviceAvailAr(stage, title)} · ${SERVICE_NOTE_AR}`;
  return `${mode} · ${unlock} · ${complete}`;
}
/** نهاية المسار بجملة @param {string} until @param {(k: string) => string} [title] */
export function untilAr(until, title = (k) => k) {
  const u = untilOf(until) || TRACK_UNTIL_DEFAULT;
  if (u === 'journey_end') return 'يمتد حتى نهاية الرحلة';
  if (u === 'days') return 'يمتد بمدته بالأيام';
  if (u.startsWith('phase:')) return `يمتد حتى نهاية محور «${PHASE_AR[u.slice(6)] || u.slice(6)}»`;
  return `يمتد حتى نهاية «${title(u.slice(6))}»`;
}
/** ما تنتظره بنود المسار، بجملة @param {string} due @param {any[]} stages */
export function dueBeforeAr(due, stages = []) {
  const t = (stages || []).find((s) => s.key === due);
  if (!t) return 'لا يقفل مرحلة بعده';
  return `بنوده الإلزامية مطلوبة قبل «${t.title_ar || due}» وحدها`;
}
// خيارات نهاية المسار للمحرر: نهاية الرحلة والمدة، ونهاية كل محور فيه مراحل، ونهاية كل مرحلة متتابعة ظاهرة غيره
export function untilOptions(stages = [], selfKey = null) {
  const live = (stages || []).filter((s) => s.active !== false && s.key !== selfKey && laneKey(s) !== 'track' && laneKey(s) !== 'service').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const phases = [...new Set(live.map(phaseOf))];
  return {
    journey_end: 'نهاية الرحلة (نهاية الدفعة في ملفها)', days: 'مدته بالأيام',
    ...Object.fromEntries(phases.map((p) => [`phase:${p}`, `نهاية محور «${PHASE_AR[p]}»`])),
    ...Object.fromEntries(live.map((s) => [`stage:${s.key}`, `نهاية «${s.title_ar || s.key}»`])),
  };
}

const DAY_MS = 86400000;
// حالة كل مرحلة بعد حساب متطلباتها. stages مرتبة، ولكل منها items محسوبة.
// ctx: { overrides: { [stage_key]: 'open'|'complete'|'skip' }, cohortStart: 'YYYY-MM-DD'|null, today: Date|string }
export function resolveStages(stages, { overrides = {}, cohortStart = null, today = new Date() } = {}) {
  const now = new Date(today).getTime();
  const start = cohortStart ? new Date(`${cohortStart}T00:00:00Z`).getTime() : null;
  const done = new Map();
  const state = new Map();   // حالة كل مرحلة مرّ بها الحل، لقاعدة «تبدأ مع»
  const out = [];
  const title = (k) => stages.find((s) => s.key === k)?.title_ar || k;
  // المسار المستمر (T1): لا يدخل في «بعد الإلزامية قبلها» لأحد، وبنوده الإلزامية تُشترط قبل المرحلة المسماة في due_before
  // وحدها، أيًا كان موضعه في الترتيب (البنود معروفة قبل الحل). المسار المتجاوَز أو المعتمد اكتماله يُعد مستوفى
  const tracks = stages.filter((x) => laneKey(x) === 'track');
  const trackReady = (t) => ['complete', 'skip'].includes(overrides[t.key]) || countedItems(t.items).every((x) => x.status === 'done');
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const r = stageRules(s);
    const ov = overrides[s.key] || null;
    // الاختياري لا يكمل مرحلة بأي قاعدة (optional.js): «بأي متطلب» تعني أي بند يُعد
    const required = countedItems(s.items);
    const byItems = r.complete === 'any' ? required.some((x) => x.status === 'done')
      : r.complete === 'approval' ? false
        : required.length > 0 && required.every((x) => x.status === 'done');
    const before = stages.slice(0, i).filter((x) => stageRules(x).mode === 'required' && (!tracks.length || laneKey(x) !== 'track'));
    const dueWaits = tracks.length ? tracks.filter((t) => t.key !== s.key && stageRules(t).due_before === s.key && !trackReady(t)).map((t) => t.key) : [];
    let unlocked, waits = [];
    if (ov === 'open') unlocked = true;
    else if (r.unlock === 'always') unlocked = true;
    else if (r.unlock === 'approval') unlocked = false;
    // تبدأ مع X: تُفتح حين لا تكون X مقفلة (نشطة أو متاحة أو مكتملة). المرجع قبلها في الترتيب فحالته معروفة،
    // والمرجع اللاحق أو المخفي أو المحذوف يبقيها مقفلة؛ لذلك يرفض الخادم كل حفظ أو ترتيب أو إخفاء أو حذف يُحدثه (stageRulesIssues)
    else if (r.unlock === 'with') unlocked = !!r.with && state.has(r.with) && state.get(r.with) !== 'locked';
    else if (r.unlock === 'stages') { waits = r.after.filter((k) => !done.get(k)); unlocked = !waits.length; }
    else if (r.unlock === 'day' && start != null && r.day != null) unlocked = now >= start + r.day * DAY_MS;
    else { waits = before.filter((x) => !done.get(x.key)).map((x) => x.key); unlocked = !waits.length; }
    // due_before: مع شرط فتحها، تنتظر المرحلة المسماة بنود المسار الإلزامية (إلا بفتح الأدمن)
    if (dueWaits.length && ov !== 'open' && r.unlock !== 'approval') { waits = [...new Set([...waits, ...dueWaits])]; unlocked = false; }
    let status;
    // المقفلة تبقى مقفلة ولو اكتملت متطلباتها (كالسلوك الأصلي)، إلا بتدخل الأدمن
    if (ov === 'complete' || ov === 'skip') status = 'done';
    else if (!unlocked) status = 'locked';
    else if (byItems) status = 'done';
    else status = r.mode === 'required' ? 'active' : 'available';
    done.set(s.key, status === 'done');
    state.set(s.key, status);
    let lock_reason = null;
    if (status === 'locked') {
      if (r.unlock === 'with') lock_reason = `تُفتح مع بداية «${r.with ? title(r.with) : '؟'}»`;
      else if (r.unlock === 'approval') lock_reason = 'تُفتح حين يفتحها لك فريق البرنامج';
      else if (r.unlock === 'day' && start != null && r.day != null) lock_reason = `تُفتح في ${new Date(start + r.day * DAY_MS).toISOString().slice(0, 10)}`;
      else if (waits.length) lock_reason = `تُفتح بعد اكتمال: ${waits.map(title).join('، ')}`;
      if (dueWaits.length && r.unlock !== 'stages' && r.unlock !== 'previous' && r.unlock !== 'approval') lock_reason = `تُفتح بعد اكتمال بنود: ${dueWaits.map(title).join('، ')}`;
    }
    // الطبيعة في المخرج لغير المتتابعة وحدها: الحجز وفتح الجلسات يجدان بند المسار في الرحلة، والعرض والعداد يفلترانه
    out.push({ ...s, status, mode: s.mode, stage_mode: r.mode, lock_reason, override: ov, skipped: ov === 'skip', ...(r.lane ? { lane: r.lane } : {}) });
  }
  return out;
}
