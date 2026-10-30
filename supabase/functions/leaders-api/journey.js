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
  }
  return out;
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
