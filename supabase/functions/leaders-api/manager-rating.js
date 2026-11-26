// ════════════════════════════════════════════════════════════════
// تقييم المدير قبل البرنامج وبعده خارج مفتاح 360 (تصور المرحلة 3 §5.1، اعتمده المالك 2026-11-26): منطق خالص
// ════════════════════════════════════════════════════════════════
// المفتاح f360 كان يجمع شيئين: تقدير المدير القبلي والبعدي (raters بمرحلتي pre وpost) ودورة 360 الكاملة. القرار 2:
// تقدير المدير قياسي ظاهر والمفتاح مطفأ، بمقيّم واحد في خانة المدير، وتبقى دورة 360 والزملاء خلف مفتاحها (features.js).
// المطلوب من المدير ثماني فقرات سلوك من فقرات المرحلة نفسها (text_rater_ar)، مرتين في البرنامج. القبلي للدفعات الجديدة
// وحدها (القرار 2)، والجارية يأتيها البعدي الاسترجاعي (الآن وقبل البرنامج) كما في فقرات البعدي القائمة.
// بلا مدير (القرار 3): زميل أعلى يختاره المشارك في خانة المدير، أو «ذاتي فقط» يكمل البنود بلا حبس ويوسم به التقرير.
// الخصوصية (القرار 4): المشارك يرى المتوسط لكل بُعد لا الإجابات، والمستشار يرى الفقرات، والجهة مؤشرًا مجمعًا لخمسة فأكثر.
import { DIMENSIONS } from './logic.js';

export const MANAGER_ITEMS = 8;
// تاريخ الإطلاق: الدفعة التي بدأت قبله جارية فلا قبلي لها
export const MANAGER_PRE_SINCE = '2026-11-26';
export const NO_MANAGER = ['senior', 'self'];
export const NO_MANAGER_AR = { senior: 'زميل أعلى أختاره', self: 'ذاتي فقط' };
export const SELF_ONLY_AR = 'ذاتي فقط';
export const SENIOR_AR = 'زميل أعلى';
export const NO_PRE_RUNNING_AR = 'دفعتك بدأت قبل إطلاق تقييم المدير، فلا تقدير قبل البرنامج. يُطلب من مديرك بعده تقدير واحد يقارن فيه الآن بما قبل.';

// ثماني فقرات بالتناوب على الأطر بترتيبها، فلا يطغى إطار. ما بلا صيغة المقيّم لا يدخل
/** @param {any[]} qs @param {number} [n] */
export function managerItems(qs, n = MANAGER_ITEMS) {
  const ok = (qs || []).filter((q) => q.text_rater_ar);
  const by = DIMENSIONS.map((d) => ok.filter((q) => q.dimension === d).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)));
  const rest = ok.filter((q) => !DIMENSIONS.includes(q.dimension));
  const out = [];
  for (let i = 0; out.length < n && by.some((l) => l.length > i); i++) for (const l of by) if (l[i] && out.length < n) out.push(l[i]);
  for (const q of rest) if (out.length < n) out.push(q);
  return out;
}

// دفعة جديدة أو دفعة بلا موعد أو الدفعة العامة: القبلي متاح. الدفعة التي بدأت قبل الإطلاق جارية
/** @param {any} cohort @param {string} [since] */
export const managerPreAllowed = (cohort, since = MANAGER_PRE_SINCE) => !cohort || !!cohort.is_default || !cohort.starts_on || String(cohort.starts_on) >= since;

// ما يراه المشارك: متوسط المدير لكل بُعد (الآن وقبل)، بلا إجابة ولا فقرة
/** @param {any[] | null | undefined} dimensions */
export function managerView(dimensions) {
  const out = {};
  for (const d of dimensions || []) if (d?.rater && d.rater.now != null) out[d.dimension] = { now: d.rater.now, before: d.rater.before ?? null };
  return Object.keys(out).length ? out : null;
}

// ما تراه الجهة: مؤشر المدير المجمع لكل بُعد إن بلغ min، ولا تقدير مدير بعينه في صفوف الأسماء
/** @param {Record<string, any> | null} cohort @param {any[]} participants @param {number} min */
export function orgRaterView(cohort, participants, min) {
  const c = cohort ? Object.fromEntries(Object.entries(cohort).map(([d, v]) => [d, v ? { ...v, rater: v.rater && v.rater.n >= min ? v.rater : null } : v])) : cohort;
  const people = (participants || []).map((p) => ({ ...p, dimensions: (p.dimensions || []).map(({ rater: _r, rater_change: _c, ...rest }) => rest) }));
  return { cohort: c, participants: people };
}
