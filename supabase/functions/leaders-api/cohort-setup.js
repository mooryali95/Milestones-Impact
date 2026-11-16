// ════════════════════════════════════════════════════════════════
// جاهزية الدفعة: ما يلزم ضبطه قبل أن تعمل رحلة الجهة (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
import { countAr } from './labels.js';

// قائمة واحدة تقرؤها لوحة الإدارة في صفحة الجهة: لكل بند حاله بجملة تُقرأ، وأين يُضبط.
// لا تخزّن شيئًا: كل بند مشتق من حقل الدفعة نفسه (المستشار من cohorts.advisor_expert_id، والجدول من schedule).

// ── هل للدفعة جلسات؟ قاعدة واحدة يقرؤها ملف الدفعة وصفحة الجهة وجاهزية الإطلاق وبوابات المراحل ──
// الجلسة الفعّالة بموعد قادم أو حديث (آخر 14 يومًا)، والجلسة بلا دفعة تعمّ الدفعات كلها (كما في القاعة).
// والدفعة بصيغة الكتيب لا تلزمها جلسات: يكتمل تدريبها بقراءة الأبواب واجتياز أسئلتها.
export const SESSION_WINDOW_MS = 14 * 864e5;
// jsonb يصل كائنًا من العميل، وقد يصل نصًا من الاستعلام المباشر للبوابات
const asJson = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
export const usesHandbook = (cohort) => Object.values(asJson(cohort?.delivery) || {}).some((d) => d?.format === 'handbook');
/** عدد جلسات الدفعة بالقاعدة الواحدة
 * @param {{ id?: string }} cohort @param {{ cohort_id?: string|null, active?: boolean, starts_at?: string, ends_at?: string|null }[]} sessions */
// والجلسة غير المؤرخة (J1، قرار المالك): «يُحدد لاحقًا» لا يمنع الإطلاق، فتُعد في الجلسات ويظهر عددها منفصلًا (undatedFor)
export function sessionsFor(cohort, sessions = [], now = Date.now()) {
  return (sessions || []).filter((w) => w.active !== false && (!w.cohort_id || w.cohort_id === cohort?.id)
    && (!w.starts_at || Date.parse(w.ends_at || w.starts_at) >= now - SESSION_WINDOW_MS)).length;
}
/** ما يُحدد موعده لاحقًا من جلسات الدفعة الفعّالة (جزء من sessionsFor) */
export function undatedFor(cohort, sessions = []) {
  return (sessions || []).filter((w) => w.active !== false && (!w.cohort_id || w.cohort_id === cohort?.id) && !w.starts_at).length;
}

/** @param {{ cohort: any, advisorName?: string|null, teamCount?: number, members?: number, upcomingSessions?: number, undatedSessions?: number }} d
 *  upcomingSessions: عدد sessionsFor للدفعة، وundatedSessions: منها ما يُحدد موعده لاحقًا (undatedFor) */
export function cohortSetup({ cohort, advisorName = null, teamCount = 0, members = 0, upcomingSessions = 0, undatedSessions = 0 }) {
  if (!cohort) return [];
  const stages = Object.keys(cohort.schedule || {}).length;
  return [
    {
      key: 'members', title: 'الأعضاء', ok: members > 0,
      detail: members > 0 ? `${members} في الدفعة (من سُجّل فيها ومن انضم بجهتها)` : 'لا أحد بعد: شارك رابط تسجيل الجهة',
      where: null,
    },
    {
      key: 'advisor', title: 'المستشار الأساسي', ok: !!cohort.advisor_expert_id,
      detail: cohort.advisor_expert_id ? `${advisorName || 'معيَّن'}${teamCount ? `، ومعه ${teamCount} في الفريق` : ''}` : 'غير معيَّن: لا خبير يرى ملفات المشاركين ولا إجاباتهم',
      where: 'team',
    },
    {
      key: 'period', title: 'مدة الدفعة', ok: !!(cohort.starts_on && cohort.ends_on),
      detail: cohort.starts_on && cohort.ends_on ? `من ${cohort.starts_on} إلى ${cohort.ends_on}` : cohort.starts_on ? `بدأت ${cohort.starts_on} بلا تاريخ نهاية: لا يمكن توزيع الجدول` : 'بلا تاريخ بداية ولا نهاية',
      where: 'cohort',
    },
    {
      key: 'schedule', title: 'جدول المراحل', ok: stages > 0,
      detail: stages > 0 ? `${stages} مرحلة مجدولة` : 'فارغ: يرى المشارك «بلا موعد بعد» عند كل مرحلة',
      where: 'schedule',
    },
    {
      key: 'sessions', title: 'الجلسات', ok: upcomingSessions > 0 || usesHandbook(cohort),
      detail: upcomingSessions > 0 ? sessionsDetail(upcomingSessions, undatedSessions) : usesHandbook(cohort) ? 'صيغة الكتيب: يكتمل التدريب بالقراءة، فلا تلزم جلسات'
        : 'لا جلسة قادمة ولا حديثة: تُضاف من «الحضور والجلسات»',
      where: 'activities',
    },
  ];
}
// «3 جلسة قادمة أو حديثة، منها جلسة واحدة بموعد يُحدد لاحقًا»، أو «جلستان بموعد يُحدد لاحقًا» حين لا مؤرخ
// العدد بتمييزه (undatedAr) فلا «1 جلسة» ولا «3 جلسة»؛ والسطر الأول القائم يبقى كما هو
export const undatedAr = (n) => `${countAr(n, 'جلسة واحدة', 'جلستان', 'جلسات', 'جلسة')} بموعد يُحدد لاحقًا`;
function sessionsDetail(all, undated) {
  const u = Math.min(Math.max(0, Number(undated) || 0), all);
  if (!u) return `${all} جلسة قادمة أو حديثة`;
  if (u === all) return undatedAr(u);
  return `${all} جلسة قادمة أو حديثة، منها ${undatedAr(u)}`;
}
export const setupMissing = (items) => (items || []).filter((x) => !x.ok).length;
