// ════════════════════════════════════════════════════════════════
// قاموس المسميات: المصدر الوحيد لكل اسم يظهر في المنصة
// ════════════════════════════════════════════════════════════════
// يستورده الخادم وتطبيق المشارك ولوحة الإدارة ووثائق الطباعة. لا يُعرَّف أي
// من هذه الأسماء في ملف آخر؛ فحص tests/single-source يمنع النسخ.
// المفاتيح تطابق قيود قاعدة البيانات (leaders.dimensions وleaders.levels وقيود الحالة).

export const DIMENSIONS = [
  { key: 'milestone', short: 'Milestone', en: 'Milestone · Execution', title: 'إدارة المشروعات' },
  { key: 'impact', short: 'Impact', en: 'Impact · Value', title: 'تحويل المشروع إلى أثر' },
  { key: 'leadership', short: 'Leadership', en: 'Leadership · People', title: 'تمكين القائد' },
];
export const DIM_AR = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.title]));
export const DIM_SHORT = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.short]));

export const LEVELS = [
  { key: 'beginner', title: 'تأسيسي', en: 'Foundation', step: 1 },
  { key: 'intermediate', title: 'متوسط', en: 'Intermediate', step: 2 },
  { key: 'advanced', title: 'احترافي', en: 'Professional', step: 3 },
];
export const LEVEL_AR = Object.fromEntries(LEVELS.map((l) => [l.key, l.title]));

export const TIER_AR = { knowledge: 'المعرفة', skill: 'المواقف', behavior: 'الممارسة' };

export const PARTICIPANT_STATUS = {
  registered: 'مسجّل', profiled: 'أكمل الملف', assessing: 'يجيب على القياس', pending_approval: 'بانتظار الاعتماد',
  placed: 'معتمد المستوى', enrolled: 'في البرنامج', completed: 'أنهى البرنامج', withdrawn: 'منسحب', suspended: 'موقوف',
};
export const FUNNEL = [['registered', 'سجّل'], ['profiled', 'أكمل الملف'], ['assessed', 'أنهى القياس'], ['approved', 'اعتُمد مساره'], ['completed', 'أنهى البرنامج']];

export const REQ_STATUS = { pending: 'لم يُنجز', submitted: 'بانتظار المراجعة', done: 'منجز', returned: 'أُعيد للتعديل' };
