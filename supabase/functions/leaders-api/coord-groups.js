// ════════════════════════════════════════════════════════════════
// مجموعات «يحتاج تدخلك» في بوابة الجهة: مصدر واحد للعدّ في الواجهة (coord.js) ولمن يذكّرهم المنسق على الخادم (nudges.ts)
// ════════════════════════════════════════════════════════════════
// من سجّل ولم يكمل القياس المبدئي
export const PRE_BASELINE = ['registered', 'profiled', 'assessing'];
// «متوقف»: لم يدخل منذ أسبوعين ولم يخرج من الرحلة (org-7)
export const STALE_DAYS = 14;
export const isStale = (p, now = Date.now()) => !['completed', 'withdrawn'].includes(p.status) && !!p.last_login_at
  && now - new Date(p.last_login_at).getTime() > STALE_DAYS * 864e5;
// ما يذكّره المنسق: مجموعتا «يحتاج تدخلك» نفسها. «متوقف» لمن له صلاحية النشاط وحده (آخر دخول)
export const COORD_NUDGE_GROUPS = { baseline: 'سجّلوا ولم يكملوا القياس المبدئي', stale: `لم يدخلوا منذ ${STALE_DAYS} يومًا` };
export const inCoordGroup = (p, group, now = Date.now()) => (group === 'baseline' ? PRE_BASELINE.includes(p.status) : group === 'stale' ? isStale(p, now) : false);
// حد الجهة اليومي: عدد من يصلهم تذكير المنسق في 24 ساعة، أيًا كان عدد منسقيها
export const COORD_NUDGE_DAILY = 60;
