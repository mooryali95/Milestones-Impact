// ════════════════════════════════════════════════════════════════
// جاهزية الدفعة: ما يلزم ضبطه قبل أن تعمل رحلة الجهة (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// قائمة واحدة تقرؤها لوحة الإدارة في صفحة الجهة: لكل بند حاله بجملة تُقرأ، وأين يُضبط.
// لا تخزّن شيئًا: كل بند مشتق من حقل الدفعة نفسه (المستشار من cohorts.advisor_expert_id، والجدول من schedule).

/** @param {{ cohort: any, advisorName?: string|null, teamCount?: number, members?: number, upcomingSessions?: number }} d */
export function cohortSetup({ cohort, advisorName = null, teamCount = 0, members = 0, upcomingSessions = 0 }) {
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
      key: 'sessions', title: 'الجلسات القادمة', ok: upcomingSessions > 0,
      detail: upcomingSessions > 0 ? `${upcomingSessions} جلسة مجدولة` : 'لا جلسة مجدولة: تُضاف من «الأنشطة»',
      where: 'activities',
    },
  ];
}
export const setupMissing = (items) => (items || []).filter((x) => !x.ok).length;
