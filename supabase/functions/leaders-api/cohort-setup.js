// ════════════════════════════════════════════════════════════════
// جاهزية الدفعة: ما يلزم ضبطه قبل أن تعمل رحلة الجهة (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
import { countAr } from './labels.js';
import { planDaysOf, planPinned } from './stage-windows.js';
import { optionalSession } from './optional.js';

// قائمة واحدة تقرؤها لوحة الإدارة في صفحة الجهة: لكل بند حاله بجملة تُقرأ، وأين يُضبط.
// لا تخزّن شيئًا: كل بند مشتق من حقل الدفعة نفسه (المستشار من cohorts.advisor_expert_id، والجدول من schedule).

// ── هل للدفعة جلسات؟ قاعدة واحدة يقرؤها ملف الدفعة وصفحة الجهة وجاهزية الإطلاق وبوابات المراحل ──
// الجلسة الفعّالة بموعد قادم أو حديث (آخر 14 يومًا)، والجلسة بلا دفعة تعمّ الدفعات كلها (كما في القاعة).
// والدفعة بصيغة الكتاب لا تلزمها جلسات: يكتمل تدريبها بقراءة الأبواب واجتياز أسئلتها.
export const SESSION_WINDOW_MS = 14 * 864e5;
// jsonb يصل كائنًا من العميل، وقد يصل نصًا من الاستعلام المباشر للبوابات
const asJson = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
export const usesHandbook = (cohort) => Object.values(asJson(cohort?.delivery) || {}).some((d) => d?.format === 'handbook');
/** عدد جلسات الدفعة بالقاعدة الواحدة
 * @param {{ id?: string }} cohort @param {{ cohort_id?: string|null, active?: boolean, starts_at?: string, ends_at?: string|null }[]} sessions */
// والجلسة غير المؤرخة (J1، قرار المالك): «يُحدد لاحقًا» لا يمنع الإطلاق، فتُعد في الجلسات ويظهر عددها منفصلًا (undatedFor)
export function sessionsFor(cohort, sessions = [], now = Date.now()) {
  return (sessions || []).filter((w) => workshopOf(cohort, w)
    && (!w.starts_at || Date.parse(w.ends_at || w.starts_at) >= now - SESSION_WINDOW_MS)).length;
}
/** ورشة فعّالة تخص الدفعة: لها أو بلا دفعة (تعمّ الدفعات). القاعدة الواحدة لـsessionsFor وundatedFor وأقرب جلسة في مكتب اليوم */
// والورشة الاختيارية لا تُعد جلسة للدفعة: لا في جاهزيتها ولا في «بلا جلسة قادمة» ولا في أقرب جلسة (optional.js)
export const workshopOf = (cohort, w) => !!w && w.active !== false && !optionalSession(w) && (!w.cohort_id || w.cohort_id === cohort?.id);
/** ما يُحدد موعده لاحقًا من جلسات الدفعة الفعّالة (جزء من sessionsFor) */
export function undatedFor(cohort, sessions = []) {
  return (sessions || []).filter((w) => workshopOf(cohort, w) && !w.starts_at).length;
}

/** @param {{ cohort: any, advisorName?: string|null, advisorServes?: boolean, teamCount?: number, members?: number, upcomingSessions?: number, undatedSessions?: number }} d
 *  upcomingSessions: عدد sessionsFor للدفعة، وundatedSessions: منها ما يُحدد موعده لاحقًا (undatedFor). advisorServes: المستشار المعيَّن يخدم في الرحلة (journeyApproved)، فإسناد بقي
 *  على عضو لجنة بلا دور أو معتمد بلا خدمة لا يُحتسب مستشارًا، لأن advisorOf لا يعيده */
export function cohortSetup({ cohort, advisorName = null, advisorServes = true, teamCount = 0, members = 0, upcomingSessions = 0, undatedSessions = 0 }) {
  if (!cohort) return [];
  const plan = Object.values(asJson(cohort.schedule) || {});
  const pinned = plan.filter(planPinned).length;
  const days = plan.filter((e) => !planPinned(e) && planDaysOf(e) != null).length;
  return [
    {
      key: 'members', title: 'الأعضاء', ok: members > 0,
      detail: members > 0 ? `${members} في الدفعة (من سُجّل فيها ومن انضم بجهتها)` : 'لا أحد بعد: شارك رابط تسجيل الجهة',
      where: null,
    },
    {
      key: 'advisor', title: 'المستشار الأساسي', ok: !!cohort.advisor_expert_id && advisorServes,
      detail: cohort.advisor_expert_id && !advisorServes ? `${advisorName || 'المعيَّن'} لا يخدم في الرحلة الآن: لا يراه المشاركون مستشارًا. عيّن غيره`
        : cohort.advisor_expert_id ? `${advisorName || 'معيَّن'}${teamCount ? `، ومعه ${teamCount} في الفريق` : ''}` : 'غير معيَّن: لا خبير يرى ملفات المشاركين ولا إجاباتهم',
      where: 'team',
    },
    {
      key: 'period', title: 'مدة الدفعة', ok: !!(cohort.starts_on && cohort.ends_on),
      detail: cohort.starts_on && cohort.ends_on ? `من ${cohort.starts_on} إلى ${cohort.ends_on}` : cohort.starts_on ? `بدأت ${cohort.starts_on} بلا تاريخ نهاية: لا يمكن توزيع الجدول` : 'بلا تاريخ بداية ولا نهاية',
      where: 'cohort',
    },
    // خطة المراحل (R2a): التواريخ تُحسب دائمًا من بداية الدفعة ومدد المراحل (cohortPlan)، فالبند ناجح متى كان للدفعة تاريخ
    // بداية، لا بعدد مفاتيح schedule. والمثبت بتاريخ (ومنه ما وُزّع قبل R2a) يُسمّى لأنه لا يتبع المدد
    {
      key: 'schedule', title: 'خطة المراحل', ok: !!cohort.is_default || !!cohort.starts_on,
      detail: cohort.is_default ? 'دفعة مفتوحة: المدد نسبية من دخول كل مشارك، ولا تواريخ مطلقة'
        : !cohort.starts_on ? 'بلا تاريخ بداية: لا تواريخ للمراحل ولا مواعيد لمعالمها بعد'
          : [days ? `${countAr(days, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة')} بمدة خاصة بالدفعة` : 'تواريخ المراحل من بداية الدفعة ومدد البرنامج',
            pinned ? `${countAr(pinned, 'مرحلة واحدة مثبتة', 'مرحلتان مثبتتان', 'مراحل مثبتة', 'مرحلة مثبتة')} بتاريخ لا يتبع المدد` : ''].filter(Boolean).join('، '),
      where: 'journey', pinned,
    },
    {
      key: 'sessions', title: 'الجلسات', ok: upcomingSessions > 0 || usesHandbook(cohort),
      detail: upcomingSessions > 0 ? sessionsDetail(upcomingSessions, undatedSessions) : usesHandbook(cohort) ? 'صيغة الكتاب: يكتمل التدريب بالقراءة، فلا تلزم جلسات'
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
