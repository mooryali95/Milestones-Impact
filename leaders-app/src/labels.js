// أسماء الأبعاد والمستويات كما في جداول leaders.dimensions وleaders.levels
export const DIMENSIONS = [
  { key: 'milestone', short: 'Milestone', title: 'إدارة المشروعات' },
  { key: 'impact', short: 'Impact', title: 'تحويل المشروع إلى أثر' },
  { key: 'leadership', short: 'Leadership', title: 'تمكين القائد من قيادة التنفيذ' },
];
export const dimOf = (k) => DIMENSIONS.find((d) => d.key === k) || { key: k, short: k, title: k };

export const LEVELS = [
  { key: 'beginner', title: 'تأسيسي', step: 1 },
  { key: 'intermediate', title: 'متوسط', step: 2 },
  { key: 'advanced', title: 'احترافي', step: 3 },
];
export const levelOf = (k) => LEVELS.find((l) => l.key === k) || { key: k, title: k, step: 0 };

export const TIERS = { knowledge: 'المعرفة', skill: 'المواقف', behavior: 'الممارسة' };

export const PHASES = [
  { key: 'admission', title: 'القبول', hint: 'نتعرّف عليك ونحدد نقطة انطلاقك' },
  { key: 'qualification', title: 'التأهيل', hint: 'تدريب وتطبيق على عملك الحقيقي' },
  { key: 'impact', title: 'الأثر', hint: 'دعم حتى الاستقلال ثم قياس ما تغيّر' },
];

export const REQ_STATUS = {
  pending: 'لم يُنجز',
  submitted: 'بانتظار المراجعة',
  done: 'منجز',
  returned: 'أُعيد للتعديل',
};
