// ════════════════════════════════════════════════════════════════
// خطة الدفعة ونوافذ المراحل: المصدر الواحد لتواريخ كل مرحلة في دفعة ومددها
// ════════════════════════════════════════════════════════════════
// cohortPlan(stages, cohort) هو المكان الوحيد الذي يُحسب فيه تاريخ مرحلة أو مدتها في دفعة (تصور محرر رحلة الدفعة، R2a):
// يقرؤه الخادم (رحلة المشارك والمعالم والخريطة والإجراء admin.cohort-plan) واللوحة (تبويب «الرحلة» ومعاينته الحية)، فلا
// يختلف تاريخ بين شاشة وأخرى. وstageWindows اسمه القديم لمن يستورده، يرجع النوافذ { from, to } وحدها كما كان.
// دالة نقية بلا قاعدة بيانات.
//
// خطة الدفعة في cohorts.schedule (البند 4.4 في التصور)، فروق الدفعة فوق نسختها فقط:
//   { [stage_key]: { days?, start?, end?, off?, with?, offset? } }
//   days          مدة خاصة بالدفعة بالأيام، وإلا مدة النسخة (duration_days)
//   start [, end] تاريخ مثبت: المرحلة مرساة يُزاح ما بعدها منها. المدخل القديم {start,end} يُقرأ هكذا من اليوم الأول
//   off، with، offset  الإيقاف والتوازي الخاص بالدفعة: يحفظها المنظف ولا يمحوها، ويطبقها R2b وR3a. هنا لا أثر لها بعد
// قاعدة النهاية (القرار 18): النافذة شاملة الطرفين، فمرحلة بـN يوم من يوم س تنتهي س + N - 1 وما بعدها يبدأ في اليوم التالي.
// والمرحلة بلا مدة (0) نقطة في يوم بدايتها لا تأخذ من المسار شيئًا.
import { addDays, daysBetween } from './milestones.js';
import { daysAr, stageRules } from './journey.js';

const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

// حدود المدة (البند 4.6): من 1 إلى 365 يومًا للإلزامية، ومن 0 للاختيارية وعند الطلب
export const PLAN_DAYS_MAX = 365;
export const planDaysMin = (s) => (stageRules(s).mode === 'required' ? 1 : 0);

// المدة الخاصة بالدفعة من مدخل الخطة إن صلحت، وإلا null (تعود لمدة النسخة)
export function planDaysOf(entry) {
  const n = entry && typeof entry === 'object' ? entry.days : undefined;
  if (n === undefined || n === null || n === '') return null;
  const v = Number(n);
  return Number.isInteger(v) && v >= 0 && v <= PLAN_DAYS_MAX ? v : null;
}
// هل المدخل مثبت بتاريخ (المدخل القديم {start,end} أو تثبيت صريح)
export const planPinned = (entry) => !!(entry && (ISO.test(entry.start || '') || ISO.test(entry.end || '')));

// المراحل بمدتها الفعلية في الدفعة: duration_days يُعاد كتابته من days الخاص بها، فيصح نص {duration} عند المشارك
// وكل ما يقرأ المدة من المرحلة. التطبيق مرتين لا يغير شيئًا لأن days قيمة لا إضافة
export function planStages(stages, schedule) {
  const sched = schedule && typeof schedule === 'object' ? schedule : {};
  return (stages || []).map((s) => {
    const d = planDaysOf(sched[s.key]);
    return d == null ? s : { ...s, duration_days: d };
  });
}
// الخطة بالمدد وحدها، بلا تواريخ مثبتة: لما يُرسم نسبيًا من بداية افتراضية (الخط الزمني لدفعة بلا تاريخ بداية)
export function planDaysOnly(schedule) {
  const out = {};
  for (const [k, v] of Object.entries(schedule && typeof schedule === 'object' ? schedule : {})) {
    const d = planDaysOf(v);
    if (d != null) out[k] = { days: d };
  }
  return out;
}

// مجموعات «تبدأ مع» بترتيب أول ظهورها، كما يجمعها distributeSchedule: المرحلة تنضم إلى مجموعة مرجعها إن كان قبلها،
// والسلسلة (C مع B وB مع A) تُحل إلى A. المرجع اللاحق أو الغائب يجعلها مجموعة وحدها («بعد السابقة»)
export function withGroups(stages) {
  const groups = [], groupOf = new Map();
  for (const s of stages) {
    const r = stageRules(s);
    const g = r.unlock === 'with' && r.with ? groupOf.get(r.with) : null;
    if (g) g.push(s); else groups.push([s]);
    groupOf.set(s.key, g || groups.at(-1));
  }
  return groups;
}

/** خطة الدفعة محسوبة: لكل مرحلة مدتها الفعلية ومصدرها ونافذتها إن عُرفت بداية، وتنبيهات الخطة.
 * المجموعة تبدأ معًا: أولها من المؤشر، وكل من «تبدأ مع» X من بداية X وتمتد بمدتها. المجموعة التالية تبدأ في اليوم التالي
 * لنهاية أطول مراحل المجموعة. المثبت مرساة: نافذته من تاريخه، وما بعده يُزاح منه.
 * الدفعة المفتوحة (is_default) بلا بداية واحدة: مددها نسبية من دخول كل مشارك، فلا تواريخ لها ولو ضُبط لها starts_on (القرار 21)
 * @param {any[]} stages مراحل تعريف الدفعة الظاهرة بترتيبها، بمدد النسخة
 * @param {any} [cohort] { starts_on, ends_on, schedule, is_default } */
export function cohortPlan(stages, cohort = {}) {
  const c = cohort || {};
  const sched = c.is_default ? planDaysOnly(c.schedule) : (c.schedule && typeof c.schedule === 'object' ? c.schedule : {});
  let cursor = c.is_default ? null : (ISO.test(String(c.starts_on || '').slice(0, 10)) ? String(c.starts_on).slice(0, 10) : null);
  const byKey = {};
  const order = [];
  const issues = [];
  for (const group of withGroups(stages || [])) {
    let next = null;
    group.forEach((s, i) => {
      const entry = sched[s.key];
      const programDays = Math.max(0, Math.round(Number(s.duration_days) || 0));
      const own = planDaysOf(entry);
      let days = own ?? programDays;
      let source = own != null && own !== programDays ? 'cohort' : 'program';
      let from = null, to = null, nxt = null;
      if (planPinned(entry)) {
        // التاريخ المثبت (المدخل القديم {start,end}): البداية المكتوبة، والنهاية المكتوبة أو البداية بمدتها شاملة
        source = 'pinned';
        const start = ISO.test(entry.start || '') ? entry.start : null;
        const end = ISO.test(entry.end || '') ? entry.end : null;
        const ref = i > 0 ? byKey[stageRules(s).with] : null;
        from = start || (ref?.from ?? cursor);
        if (from) {
          if (end) {
            // نهاية مكتوبة بلا بداية تسبق بدايتها المحسوبة: تُقرأ يومًا واحدًا عند نهايتها، وتُنبَّه
            if (!start && end < from) { issues.push({ level: 'warn', stage: s.key, code: 'pinned_order', msg: `نهاية «${s.title_ar || s.key}» المثبتة (${end}) قبل بدايتها المحسوبة (${from})` }); from = end; }
            to = end;
            days = daysBetween(from, to) + 1;
          } else to = days > 0 ? addDays(from, days - 1) : from;
          nxt = days > 0 ? addDays(to, 1) : from;
          if (start && cursor && i === 0 && start < cursor) issues.push({ level: 'warn', stage: s.key, code: 'pinned_order', msg: `تاريخ «${s.title_ar || s.key}» المثبت (${start}) يسبق نهاية ما قبلها` });
        }
      } else {
        const ref = i > 0 ? byKey[stageRules(s).with] : null;
        from = i === 0 ? cursor : ref ? ref.from : cursor;
        if (from) {
          to = days > 0 ? addDays(from, days - 1) : from;
          nxt = days > 0 ? addDays(to, 1) : from;
        }
      }
      if (stageRules(s).mode === 'required' && days === 0 && source !== 'pinned' && own != null) {
        issues.push({ level: 'warn', stage: s.key, code: 'zero_required', msg: `«${s.title_ar || s.key}» إلزامية بمدة صفر` });
      }
      const row = { key: s.key, days, program_days: programDays, source, from, to, next: nxt };
      byKey[s.key] = row;
      order.push(row);
      // أول المجموعة مثبتًا يضع نهايتها كما هو ولو سبق المؤشر، والبقية تمدها إن طالت
      if (nxt) next = source === 'pinned' && i === 0 ? nxt : later(next, nxt);
    });
    if (next) cursor = next;
  }
  // قاعدة «تُفتح يوم N» تبقى بتاريخها ولا تتبع المدد (القرار 20): تنبيه إن وقع يومها خارج نافذتها المخططة
  const start0 = c.is_default ? null : (ISO.test(String(c.starts_on || '').slice(0, 10)) ? String(c.starts_on).slice(0, 10) : null);
  for (const s of stages || []) {
    const r = stageRules(s);
    const w = byKey[s.key];
    if (r.unlock !== 'day' || r.day == null || !start0 || !w?.from) continue;
    const open = addDays(start0, r.day);
    if (open < w.from || open > w.to) issues.push({ level: 'warn', stage: s.key, code: 'day_rule', msg: `«${s.title_ar || s.key}» تُفتح ${open} بقاعدة البرنامج، خارج نافذتها المخططة (${w.from} إلى ${w.to})` });
  }
  const dated = order.filter((x) => x.from);
  const first = dated.reduce((m, x) => (!m || x.from < m ? x.from : m), null);
  const end = dated.reduce((m, x) => later(m, x.to), null);
  const endsOn = ISO.test(String(c.ends_on || '').slice(0, 10)) ? String(c.ends_on).slice(0, 10) : null;
  const over = end && endsOn && !c.is_default && end > endsOn ? daysBetween(endsOn, end) : 0;
  if (over) issues.push({ level: 'warn', stage: null, code: 'over_end', msg: `تنتهي الرحلة بعد نهاية الدفعة بـ${daysAr(over)}` });
  const windows = {};
  for (const x of dated) windows[x.key] = { from: x.from, to: x.to };
  return {
    dated: dated.length > 0 && dated.length === order.length, start: first, end, over,
    total_days: first && end ? daysBetween(first, end) + 1 : null,
    stages: order, byKey, windows, issues,
    changed: order.filter((x) => x.source !== 'program').length,
  };
}

// نافذة كل مرحلة { from, to } من خطة الدفعة (cohortPlan)، بالاسم القديم والشكل القديم لكل من يستورده
export function stageWindows(stages, cohort = {}) {
  return cohortPlan(stages, cohort).windows;
}

// أين يقول الجدول إن الدفعة اليوم: آخر مرحلة في الترتيب تحوي نافذتها اليوم، وإلا آخر مرحلة بدأت (بين مرحلتين).
// الرحلة تنتهي بأبعد نهاية بين كل المراحل لا بنافذة آخرها في الترتيب، فمرحلة قصيرة تسير مع أطول منها لا تنهيها
export function todayStage(stages, windows, today) {
  const t = isoDay(today);
  let inside = null, started = null, end = null;
  for (const s of stages) {
    const w = windows[s.key];
    if (!w) continue;
    if (!end || w.to > end) end = w.to;
    if (w.from <= t) started = s.key;
    if (w.from <= t && t <= w.to) inside = s.key;
  }
  if (!started || (end && t > end)) return null;
  return inside || started;
}
