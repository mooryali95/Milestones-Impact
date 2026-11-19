// ════════════════════════════════════════════════════════════════
// «جارية»: تعريف واحد للدفعة الجارية (P10، قرار المالك 19 في تصور البرامج والجهات والدفعات)
// ════════════════════════════════════════════════════════════════
// الدفعة جارية بقاعدة التاريخ: بدأت (starts_on حتى اليوم) ولم تنتهِ (بلا ends_on أو ends_on من اليوم فصاعدًا)، بتاريخ
// UTC، وهي دفعة حية: حالها «التسجيل مفتوح» أو «جارية» (LIVE، كما في live_cohorts وقاعدة الالتحاق pickCohort). «مخطط لها»
// لم يعلن المدير بدءها ولا يدخلها أحد تلقائيًا، و«مغلقة» قرار صريح بانتهائها، فلا تكون أي منهما جارية ولو وقع اليوم في تاريخيها.
// يقرؤه: قفل معيار التسكين والتقييم الختامي (runningCohort في programs.ts)، ومكتب اليوم ونبض الدفعات (today-desk.js)،
// وجاهزية الإطلاق (readiness.js)، وحالة الدفعة كما تُعرض في اللوحة (cohortStateAr).

export const COHORT_STATUS = Object.freeze({ planned: 'مخطط لها', open: 'التسجيل مفتوح', running: 'جارية', closed: 'مغلقة' });

export const LIVE = new Set(['open', 'running']);
const isoDay = (now) => (typeof now === 'string' ? now.slice(0, 10) : new Date(now).toISOString().slice(0, 10));

/** @param {any} c دفعة بحالتها وتاريخيها @param {number|string} [now] الآن أو يوم بصيغة YYYY-MM-DD */
export function isRunning(c, now = Date.now()) {
  const today = isoDay(now);
  return !!c && LIVE.has(c.status) && !!c.starts_on && String(c.starts_on).slice(0, 10) <= today
    && (!c.ends_on || String(c.ends_on).slice(0, 10) >= today);
}

/** حالة الدفعة كما تُعرض: «جارية» من isRunning وحدها، فلا تقول الشاشة «جارية» لدفعة لا تقفل شيئًا ولا العكس */
export function cohortStateAr(c, now = Date.now()) {
  if (!c) return '';
  if (c.status === 'closed' || c.status === 'planned') return COHORT_STATUS[c.status];
  if (isRunning(c, now)) return c.status === 'open' ? 'جارية، والتسجيل مفتوح' : COHORT_STATUS.running;
  // الدفعة المفتوحة العامة بلا تواريخ تستقبل من ليس له جهة على الدوام، ولا تقفل شيئًا
  if (c.is_default && !c.starts_on) return 'مفتوحة على الدوام';
  if (c.status === 'running') {
    if (!c.starts_on) return 'لم يُحدد تاريخ بدئها';
    return String(c.starts_on).slice(0, 10) > isoDay(now) ? 'لم تبدأ بعد' : 'انتهت مدتها';
  }
  // المفتوحة التي مضى تاريخ نهايتها لا تقفل شيئًا، فلا تُعرض «التسجيل مفتوح» وحدها
  if (c.status === 'open' && c.ends_on && String(c.ends_on).slice(0, 10) < isoDay(now)) return 'انتهت مدتها، والتسجيل مفتوح';
  return COHORT_STATUS[c.status] || '';
}
